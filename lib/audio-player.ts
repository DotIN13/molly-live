export const COSY_SAMPLE_RATE = 24000;

export class StreamingAudioPlayer {
    private audioContext: AudioContext | null = null;
    private nextStartTime: number = 0;
    private isPlaying: boolean = false;
    private queue: Float32Array[] = [];
    private scheduledSources: AudioBufferSourceNode[] = [];

    constructor() {
        // Lazy initialization in resume()
    }

    async resume() {
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
        if (this.audioContext?.state === 'suspended') {
            await this.audioContext.resume();
        }
    }

    stop() {
        this.scheduledSources.forEach(source => {
            try {
                source.stop();
            } catch (e) {
                // ignore
            }
        });
        this.scheduledSources = [];
        this.queue = [];
        this.isPlaying = false;
        this.nextStartTime = 0;
    }

    scheduleChunk(chunk: ArrayBuffer, sampleRate: number = COSY_SAMPLE_RATE, format: 'int16' | 'float32' = 'int16') {
        if (!this.audioContext) return;

        let float32Array: Float32Array<ArrayBuffer>;

        if (format === 'int16') {
            const int16Array = new Int16Array(chunk);
            float32Array = new Float32Array(int16Array.length);
            for (let i = 0; i < int16Array.length; i++) {
                float32Array[i] = int16Array[i] / 32768;
            }
        } else {
            // Float32
            float32Array = new Float32Array(chunk);
        }

        const audioBuffer = this.audioContext.createBuffer(1, float32Array.length, sampleRate);
        audioBuffer.copyToChannel(float32Array, 0);

        const source = this.audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(this.audioContext.destination);

        // Schedule playback
        if (this.nextStartTime < this.audioContext.currentTime) {
            this.nextStartTime = this.audioContext.currentTime;
        }

        source.start(this.nextStartTime);
        this.scheduledSources.push(source);

        this.nextStartTime += audioBuffer.duration;

        source.onended = () => {
            const index = this.scheduledSources.indexOf(source);
            if (index > -1) {
                this.scheduledSources.splice(index, 1);
            }
        };
    }
}

export const streamingPlayer = new StreamingAudioPlayer();

export function stopAudioPlayback() {
    streamingPlayer.stop();
}
