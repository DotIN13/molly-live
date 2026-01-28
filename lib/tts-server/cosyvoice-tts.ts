
import WebSocket from 'ws';
import { TTSEngine } from './types';
import { v4 as uuidv4 } from 'uuid';

export class CosyVoiceTTS implements TTSEngine {
    private ws: WebSocket | null = null;
    private audioCallback: ((data: Uint8Array) => void) | null = null;
    private errorCallback: ((err: any) => void) | null = null;
    private finishedCallback: (() => void) | null = null;
    private apiKey: string | undefined;
    private voiceId: string;
    private taskId: string;
    private taskStarted: boolean = false;
    private messageQueue: Promise<void> = Promise.resolve();
    private readyPromise: Promise<void> | null = null;

    constructor(apiKey: string | undefined, voiceId: string = 'longanyang') {
        this.apiKey = apiKey;
        this.voiceId = voiceId;
        this.taskId = uuidv4().replace(/-/g, '');
    }

    onAudio(callback: (data: Uint8Array) => void): void {
        this.audioCallback = callback;
    }

    onError(callback: (err: any) => void): void {
        this.errorCallback = callback;
    }

    onFinished(callback: () => void): void {
        this.finishedCallback = callback;
    }

    async initialize(): Promise<void> {
        if (!this.apiKey) {
            const err = new Error("Dashscope API Key is missing for CosyVoice");
            if (this.errorCallback) this.errorCallback(err);
            throw err;
        }

        this.ws = new WebSocket('wss://dashscope.aliyuncs.com/api-ws/v1/inference', {
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'X-DashScope-DataInspection': 'enable'
            }
        });

        this.readyPromise = new Promise((resolve, reject) => {
            if (!this.ws) return reject("WebSocket not created");

            this.ws.on('open', () => {
                // Send run-task command upon connection
                const runTaskCmd = {
                    header: {
                        action: "run-task",
                        task_id: this.taskId,
                        streaming: "duplex"
                    },
                    payload: {
                        task_group: "audio",
                        task: "tts",
                        function: "SpeechSynthesizer",
                        model: "cosyvoice-v3-plus",
                        parameters: {
                            text_type: "PlainText",
                            voice: this.voiceId,
                            format: "pcm",
                            sample_rate: 24000,
                            volume: 50,
                            rate: 1,
                            pitch: 1,
                            enable_ssml: false
                        },
                        input: {}
                    }
                };
                this.ws?.send(JSON.stringify(runTaskCmd));
                // We resolve when we get task-started
            });

            this.ws.on('message', (data: any, isBinary: boolean) => {
                if (isBinary) {
                    // Audio data
                    if (this.audioCallback) {
                        this.audioCallback(new Uint8Array(data));
                    }
                    return;
                }

                try {
                    const msg = JSON.parse(data.toString());
                    const event = msg.header?.event;

                    if (event === 'task-started') {
                        this.taskStarted = true;
                        resolve();
                    } else if (event === 'task-finished') {
                        if (this.finishedCallback) this.finishedCallback();
                        this.ws?.close();
                    } else if (event === 'task-failed') {
                        const errMsg = msg.header?.error_message || "Unknown error";
                        console.error('CosyVoice Task Failed:', errMsg);
                        if (this.errorCallback) this.errorCallback(new Error(errMsg));
                        reject(new Error(errMsg));
                    } else if (event === 'result-generated') {
                        // We might get sentence text here, but we mostly care about binary audio which comes separately
                    }
                } catch (e) {
                    console.error('Error parsing CosyVoice msg:', e);
                }
            });

            this.ws.on('error', (err) => {
                console.error('CosyVoice WS Error:', err);
                if (this.errorCallback) this.errorCallback(err);
                reject(err);
            });

            this.ws.on('close', () => {
                this.taskStarted = false;
            })
        });

        return this.readyPromise;
    }

    private async safeSend(payload: any) {
        // Ensure we wait for initialization
        if (this.readyPromise) await this.readyPromise;

        this.messageQueue = this.messageQueue.then(async () => {
            if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
            // Ensure task is started before sending continue-task
            if (!this.taskStarted) return;

            this.ws.send(JSON.stringify(payload));
        });
        await this.messageQueue;
    }

    async sendText(text: string): Promise<void> {
        await this.safeSend({
            header: {
                action: "continue-task",
                task_id: this.taskId,
                streaming: "duplex"
            },
            payload: {
                input: {
                    text: text
                }
            }
        });
    }

    async flush(): Promise<void> {
        await this.safeSend({
            header: {
                action: "finish-task",
                task_id: this.taskId,
                streaming: "duplex"
            },
            payload: {
                input: {}
            }
        });
    }

    async close(): Promise<void> {
        await this.messageQueue;

        if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
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
