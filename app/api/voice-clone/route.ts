
import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { audioPath, audioData, apiKey } = body;

        if ((!audioPath && !audioData) || !apiKey) {
            return NextResponse.json({ error: 'Missing audioPath/audioData or apiKey' }, { status: 400 });
        }

        let dataUri = audioData;

        if (audioPath) {
            // resolve path
            let absolutePath = audioPath;
            if (!path.isAbsolute(audioPath)) {
                absolutePath = path.resolve(process.cwd(), audioPath);
            }

            if (!fs.existsSync(absolutePath)) {
                return NextResponse.json({ error: `File not found: ${absolutePath}` }, { status: 404 });
            }

            const fileBuffer = await fs.promises.readFile(absolutePath);
            const base64Audio = fileBuffer.toString('base64');
            const mimeType = absolutePath.endsWith('.wav') ? 'audio/wav' : 'audio/mpeg'; // simple check
            dataUri = `data:${mimeType};base64,${base64Audio}`;
        }

        // If audioData is providing raw base64 without prefix, we might want to guess mime type or expect prefix
        // For this implementation, we expect frontend to send 'data:...' or we handle it if provided.
        // But the previous code for file reading constructed it. 
        // Let's assume input `audioData` is a full Data URI.

        const url = "https://dashscope.aliyuncs.com/api/v1/services/audio/tts/customization";
        const payload = {
            model: "qwen-voice-enrollment",
            input: {
                action: "create",
                target_model: "qwen3-tts-vc-realtime-2026-01-15",
                preferred_name: "molly_" + Math.random().toString(36).substring(7),
                audio: {
                    data: dataUri
                }
            }
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Aliyun API error: ${response.status} ${errText}`);
        }

        const data = await response.json();
        /*
         Response structure:
         {
            "output": { "voice": "..." },
            ...
         }
        */
        const voiceId = data.output?.voice;

        return NextResponse.json({ voiceId });

    } catch (error: any) {
        console.error("Voice Clone Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
