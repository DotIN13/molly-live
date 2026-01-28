export interface TTSEngine {
    initialize(): Promise<void>;
    sendText(text: string): Promise<void>; // Add text to the buffer
    flush(): Promise<void>; // Signal that no more text is coming for this turn
    close(): Promise<void>; // cleanup
    onAudio(callback: (data: Uint8Array) => void): void;
    onError(callback: (err: any) => void): void;
}
