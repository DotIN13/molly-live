
import { TTSEngine } from './types';
import { QwenTTS } from './qwen-tts';
import { CosyVoiceTTS } from './cosyvoice-tts';

interface TTSConfig {
    engine: string;
    voiceId?: string;
    dashscopeApiKey?: string;
}

export function createTTSEngine(config: TTSConfig): TTSEngine | null {
    if (config.engine === 'qwen') {
        // Fallback to env var if not passed in config
        const apiKey = config.dashscopeApiKey || process.env.DASHSCOPE_API_KEY;
        return new QwenTTS(apiKey, config.voiceId);
    } else if (config.engine === 'cosyvoice') {
        const apiKey = config.dashscopeApiKey || process.env.DASHSCOPE_API_KEY;
        return new CosyVoiceTTS(apiKey, config.voiceId);
    }

    return null;
}
