import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const TTS_ENDPOINT = process.env.TTS_ENDPOINT || 'http://127.0.0.1:50000';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { ttsText, promptText, promptWavPath, stream } = body;

        if (!ttsText || !promptText || !promptWavPath) {
            return NextResponse.json({ error: 'Missing required fields for CosyVoice' }, { status: 400 });
        }

        const formData = new FormData();
        formData.append('tts_text', ttsText);
        formData.append('prompt_text', "You are a helpful assistant.<|endofprompt|>" + promptText);
        formData.append('stream', stream ? 'true' : 'false');

        // Read the prompt wav file
        let absolutePath = promptWavPath;
        if (!path.isAbsolute(promptWavPath)) {
            absolutePath = path.resolve(process.cwd(), 'public', promptWavPath);
            if (!fs.existsSync(absolutePath)) {
                absolutePath = path.resolve(process.cwd(), promptWavPath);
            }
        }

        if (!fs.existsSync(absolutePath)) {
            return NextResponse.json({ error: `Prompt WAV file not found at ${absolutePath}` }, { status: 404 });
        }

        const fileBuffer = await fs.promises.readFile(absolutePath);
        const blob = new Blob([fileBuffer], { type: 'audio/wav' });
        formData.append('prompt_wav', blob, path.basename(absolutePath));

        const response = await fetch(`${TTS_ENDPOINT}/inference_zero_shot`, {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            throw new Error(`TTS server error: ${response.status} ${response.statusText}`);
        }

        if (stream) {
            return new NextResponse(response.body, {
                headers: {
                    'Content-Type': 'audio/wav',
                    'X-Audio-Format': 'pcm_s16le', // CosyVoice default
                    'X-Sample-Rate': '24000' // or 22050
                },
            });
        } else {
            const arrayBuffer = await response.arrayBuffer();
            return new NextResponse(arrayBuffer, {
                headers: {
                    'Content-Type': 'audio/wav',
                    'X-Audio-Format': 'pcm_s16le',
                    'X-Sample-Rate': '24000'
                },
            });
        }

    } catch (error: any) {
        console.error('CosyVoice TTS API Error:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}
