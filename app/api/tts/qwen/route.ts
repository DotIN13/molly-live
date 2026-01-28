import { NextRequest, NextResponse } from 'next/server';
import WebSocket from 'ws';

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

        const stream = new ReadableStream({
            start(controller) {
                // Ensure model param is passed in URL as per Qwen requirements
                const ws = new WebSocket('wss://dashscope.aliyuncs.com/api-ws/v1/realtime?model=qwen3-tts-vc-realtime-2026-01-15', {
                    headers: {
                        'Authorization': `Bearer ${apiKey}`
                    }
                });

                ws.on('open', () => {
                    // 1. Session Update
                    const sessionUpdate = {
                        type: "session.update",
                        session: {
                            mode: "server_commit",
                            voice: voiceId,
                            // model removed here as it is in the URL query param
                            response_format: "pcm",
                            sample_rate: 24000
                        }
                    };
                    ws.send(JSON.stringify(sessionUpdate));

                    // 2. Append Text
                    const appendText = {
                        type: "input_text_buffer.append",
                        text: ttsText
                    };
                    ws.send(JSON.stringify(appendText));

                    // 3. Finish Session
                    const finishSession = {
                        type: "session.finish"
                    };
                    ws.send(JSON.stringify(finishSession));
                });

                ws.on('message', (data: any, isBinary: boolean) => {
                    try {
                        if (isBinary) return;
                        const msg = JSON.parse(data.toString());

                        if (msg.type === 'response.audio.delta') {
                            const audioData = Buffer.from(msg.delta, 'base64');
                            controller.enqueue(audioData);
                        } else if (msg.type === 'session.finished') {
                            ws.close();
                            controller.close();
                        } else if (msg.type === 'error') {
                            console.error('Qwen TTS Error:', msg);
                            controller.error(new Error(msg.error?.message || 'Unknown Qwen TTS Error'));
                            ws.close();
                        }
                    } catch (e) {
                        console.error('Error parsing WebSocket message:', e);
                    }
                });

                ws.on('error', (err: any) => {
                    console.error('WebSocket Error:', err);
                    controller.error(err);
                });

                ws.on('close', () => {
                    try { controller.close(); } catch (e) { }
                });
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
        console.error('Qwen TTS API Error:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}
