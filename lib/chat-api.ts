import { streamingPlayer, stopAudioPlayback, COSY_SAMPLE_RATE } from "@/lib/audio-player";

export async function playAudioStream(
    text: string,
    options: {
        engine: 'cosyvoice' | 'qwen',
        promptText?: string,
        promptWavPath?: string,
        voiceId?: string,
        streaming: boolean,
        dashscopeApiKey?: string
    }
) {
    stopAudioPlayback();
    await streamingPlayer.resume();

    try {
        let endpoint = '/api/tts';
        if (options.engine === 'cosyvoice') endpoint = '/api/tts/cosyvoice';
        else if (options.engine === 'qwen') endpoint = '/api/tts/qwen';

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ttsText: text,
                ...options,
                stream: options.streaming
            })
        });

        if (!response.ok || !response.body) {
            console.error("TTS Error", await response.text());
            return;
        }

        const reader = response.body.getReader();
        const sampleRateHeader = response.headers.get('X-Sample-Rate');
        const audioFormatHeader = response.headers.get('X-Audio-Format');

        const sampleRate = sampleRateHeader ? parseInt(sampleRateHeader, 10) : COSY_SAMPLE_RATE;
        // If format is specified in header, use it. Cosy/Qwen usually int16 (unless float32 specified).
        const audioFormat = (audioFormatHeader === 'pcm_f32le') ? 'float32' : 'int16';

        let leftover = new Uint8Array(0);

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) {
                const temp = new Uint8Array(leftover.length + value.length);
                temp.set(leftover);
                temp.set(value, leftover.length);
                leftover = temp;

                const bytesPerSample = audioFormat === 'float32' ? 4 : 2;
                const totalLength = leftover.length;
                const remainder = totalLength % bytesPerSample;
                const processableLength = totalLength - remainder;

                if (processableLength > 0) {
                    const chunkToProcess = leftover.slice(0, processableLength);
                    leftover = leftover.slice(processableLength);
                    streamingPlayer.scheduleChunk(chunkToProcess.buffer, sampleRate, audioFormat);
                }
            }
        }

    } catch (e) {
        console.error(e);
    }
}

export async function sendToBackend({
    messages,
    geminiApiKey,
    onStream,
    ttsEngine,
    voiceId,
    dashscopeApiKey
}: {
    messages: Array<{ role: string; content: string }>;
    geminiApiKey?: string;
    onStream?: (text: string) => void;
    ttsEngine?: string;
    voiceId?: string;
    dashscopeApiKey?: string;
}) {
    if (ttsEngine === 'qwen') {
        stopAudioPlayback();
        await streamingPlayer.resume();
    }

    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages, geminiApiKey, ttsEngine, voiceId, dashscopeApiKey })
        });

        if (!response.ok) {
            throw new Error('API Error');
        }

        if (!response.body) throw new Error("No response body");

        const reader = response.body.getReader();
        const contentType = response.headers.get('Content-Type');
        const decoder = new TextDecoder();
        let fullText = "";

        if (contentType?.includes('application/octet-stream') || response.headers.get('X-Stream-Protocol') === 'mixed-v1') {
            // Mixed binary protocol: [Type(1)][Length(4)][Payload]
            let buffer = new Uint8Array(0);

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                // Append new data to buffer
                const temp = new Uint8Array(buffer.length + value.length);
                temp.set(buffer);
                temp.set(value, buffer.length);
                buffer = temp;

                // Process buffer
                let offset = 0;
                while (offset + 5 <= buffer.length) {
                    const type = buffer[offset];
                    const length = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength).getUint32(offset + 1, false);

                    if (offset + 5 + length > buffer.length) {
                        // Not enough data for full packet
                        break;
                    }

                    const payload = buffer.slice(offset + 5, offset + 5 + length);
                    offset += 5 + length;

                    if (type === 1) { // Text
                        const textChunk = decoder.decode(payload);
                        fullText += textChunk;
                        onStream?.(fullText);
                    } else if (type === 2) { // Audio
                        // Qwen is 24kHz, 16-bit PCM
                        const sampleRate = 24000;
                        const audioFormat = 'int16';
                        streamingPlayer.scheduleChunk(payload.buffer, sampleRate, audioFormat);
                    }
                }

                if (offset > 0) {
                    buffer = buffer.slice(offset);
                }
            }

        } else {
            // Standard text stream
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const chunk = decoder.decode(value, { stream: true });
                fullText += chunk;
                onStream?.(fullText);
            }
        }

        return { text: fullText, tag: "Reply" };
    } catch (e) {
        console.error(e);
        return { text: "I'm having trouble connecting right now.", tag: "Error" };
    }
}
