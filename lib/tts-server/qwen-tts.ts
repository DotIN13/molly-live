
import WebSocket from 'ws';
import { TTSEngine } from './types';

export class QwenTTS implements TTSEngine {
    private ws: WebSocket | null = null;
    private audioCallback: ((data: Uint8Array) => void) | null = null;
    private errorCallback: ((err: any) => void) | null = null;
    private apiKey: string | undefined;
    private voiceId: string;
    private ready: boolean = false;
    private messageQueue: Promise<void> = Promise.resolve();

    constructor(apiKey: string | undefined, voiceId: string = 'qwen-long') {
        this.apiKey = apiKey;
        this.voiceId = voiceId;
    }

    onAudio(callback: (data: Uint8Array) => void): void {
        this.audioCallback = callback;
    }

    onError(callback: (err: any) => void): void {
        this.errorCallback = callback;
    }

    async initialize(): Promise<void> {
        if (!this.apiKey) {
            if (this.errorCallback) this.errorCallback(new Error("Dashscope API Key is missing"));
            return;
        }

        this.ws = new WebSocket('wss://dashscope.aliyuncs.com/api-ws/v1/realtime?model=qwen3-tts-vc-realtime-2026-01-15', {
            headers: { 'Authorization': `Bearer ${this.apiKey}` }
        });

        return new Promise((resolve, reject) => {
            if (!this.ws) return reject("WebSocket not created");

            this.ws.on('open', () => {
                this.ready = true;
                // Session Update
                const sessionUpdate = {
                    type: "session.update",
                    session: {
                        mode: "server_commit",
                        voice: this.voiceId,
                        response_format: "pcm",
                        sample_rate: 24000
                    }
                };
                this.ws?.send(JSON.stringify(sessionUpdate));
                resolve();
            });

            this.ws.on('message', (data: any, isBinary: boolean) => {
                if (isBinary) return;

                try {
                    const msg = JSON.parse(data.toString());
                    if (msg.type === 'response.audio.delta') {
                        const audioData = Buffer.from(msg.delta, 'base64');
                        if (this.audioCallback) {
                            this.audioCallback(new Uint8Array(audioData));
                        }
                    } else if (msg.type === 'session.finished') {
                        this.ws?.close();
                    } else if (msg.type === 'error') {
                        console.error('Qwen TTS Error:', msg);
                        if (this.errorCallback) this.errorCallback(msg);
                    }
                } catch (e) {
                    console.error('Error parsing Qwen msg:', e);
                }
            });

            this.ws.on('error', (err) => {
                console.error('Qwen WS Error:', err);
                if (this.errorCallback) this.errorCallback(err);
                reject(err);
            });

            this.ws.on('close', () => {
                this.ready = false;
            })
        });
    }

    private async safeSend(payload: any) {
        this.messageQueue = this.messageQueue.then(async () => {
            if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
            this.ws.send(JSON.stringify(payload));
        });
        await this.messageQueue;
    }

    async sendText(text: string): Promise<void> {
        if (this.ready) {
            await this.safeSend({
                type: "input_text_buffer.append",
                text: text
            });
        }
    }

    async flush(): Promise<void> {
        if (this.ready) {
            await this.safeSend({ type: "session.finish" });
        }
    }

    async close(): Promise<void> {
        // Wait for queue to drain then wait for close
        await this.messageQueue;

        if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
            // We expect session.finished to close it, but we force close if it hangs
            return new Promise<void>((resolve) => {
                const timeout = setTimeout(() => {
                    this.ws?.terminate();
                    resolve();
                }, 5000);

                if (!this.ws) { clearTimeout(timeout); resolve(); return; }

                this.ws.on('close', () => {
                    clearTimeout(timeout);
                    resolve();
                });
            });
        }
    }
}
