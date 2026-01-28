import { NextRequest, NextResponse } from 'next/server';
import { CosyVoiceTTS } from '@/lib/tts-server/cosyvoice-tts';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { ttsText, voiceId, dashscopeApiKey } = body;

        const apiKey = dashscopeApiKey || process.env.DASHSCOPE_API_KEY;

        if (!apiKey) {
            return NextResponse.json({ error: 'DASHSCOPE_API_KEY not configured' }, { status: 500 });
        }
        if (!ttsText || !voiceId) {
            return NextResponse.json({ error: 'Missing ttsText or voiceId' }, { status: 400 });
        }

        const tts = new CosyVoiceTTS(apiKey, voiceId);

        const stream = new ReadableStream({
            async start(controller) {
                tts.onAudio((data) => {
                    controller.enqueue(data);
                });

                tts.onError((err) => {
                    console.error('CosyVoice TTS Error:', err);
                    controller.error(err);
                });

                tts.onFinished(() => {
                    controller.close();
                });

                try {
                    await tts.initialize();
                    await tts.sendText(ttsText);
                    await tts.flush();
                } catch (error) {
                    controller.error(error);
                }
            },
            cancel() {
                tts.close();
            }
        });

        return new NextResponse(stream, {
            headers: {
                'Content-Type': 'application/octet-stream',
                'X-Audio-Format': 'pcm_s16le',
                'X-Sample-Rate': '24000'
            }
        });

    } catch (error: any) {
        console.error('CosyVoice TTS API Error:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}
