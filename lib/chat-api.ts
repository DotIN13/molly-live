import { streamingPlayer, stopAudioPlayback, COSY_SAMPLE_RATE, CARTESIA_SAMPLE_RATE } from "@/lib/audio-player";

export async function playAudioStream(
    text: string,
    options: {
        engine: 'cosyvoice' | 'cartesia' | 'qwen',
        promptText?: string,
        promptWavPath?: string,
        voiceId?: string,
        streaming: boolean,
        cartesiaApiKey?: string,
        dashscopeApiKey?: string
    }
) {
    stopAudioPlayback();
    await streamingPlayer.resume();

    try {
        let endpoint = '/api/tts';
        if (options.engine === 'cosyvoice') endpoint = '/api/tts/cosyvoice';
        else if (options.engine === 'cartesia') endpoint = '/api/tts/cartesia';
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

        const sampleRate = sampleRateHeader ? parseInt(sampleRateHeader, 10) : (options.engine === 'cartesia' ? CARTESIA_SAMPLE_RATE : COSY_SAMPLE_RATE);
        // If format is specified in header, use it. Cartesian is float32. Cosy/Qwen usually int16 (unless float32 specified).
        const audioFormat = (audioFormatHeader === 'pcm_f32le' || options.engine === 'cartesia') ? 'float32' : 'int16';

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
    onStream
}: {
    messages: Array<{ role: string; content: string }>;
    geminiApiKey?: string;
    onStream?: (text: string) => void;
}) {
    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages, geminiApiKey })
        });

        if (!response.ok) {
            throw new Error('API Error');
        }

        if (!response.body) throw new Error("No response body");

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullText = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            fullText += chunk;
            onStream?.(fullText);
        }

        return { text: fullText, tag: "Reply" };
    } catch (e) {
        console.error(e);
        return { text: "I'm having trouble connecting right now.", tag: "Error" };
    }
}
