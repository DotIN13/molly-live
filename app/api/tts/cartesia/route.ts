import { NextRequest, NextResponse } from 'next/server';

const CARTESIA_API_KEY = process.env.CARTESIA_API_KEY;

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { ttsText, stream, voiceId, cartesiaApiKey } = body;

        const apiKey = cartesiaApiKey || CARTESIA_API_KEY;
        if (!apiKey) {
            return NextResponse.json({ error: 'CARTESIA_API_KEY not configured' }, { status: 500 });
        }
        if (!ttsText) {
            return NextResponse.json({ error: 'Missing ttsText' }, { status: 400 });
        }

        const cartesiaBody = {
            model_id: "sonic-3",
            transcript: ttsText,
            voice: {
                mode: "id",
                id: voiceId || "78386a09-04ef-484d-9b9d-efd13087b792"
            },
            output_format: {
                container: "raw",
                encoding: "pcm_f32le",
                sample_rate: 44100
            },
            speed: "normal",
            generation_config: {
                speed: 0.8,
                volume: 1,
            }
        };

        const response = await fetch("https://api.cartesia.ai/tts/bytes", {
            method: "POST",
            headers: {
                "Cartesia-Version": "2024-06-10",
                "X-API-Key": apiKey,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(cartesiaBody)
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Cartesia API error: ${response.status} ${errText}`);
        }

        if (stream) {
            return new NextResponse(response.body, {
                headers: {
                    'Content-Type': 'application/octet-stream',
                    'X-Audio-Format': 'pcm_f32le',
                    'X-Sample-Rate': '44100'
                }
            });
        } else {
            const arrayBuffer = await response.arrayBuffer();
            return new NextResponse(arrayBuffer, {
                headers: {
                    'Content-Type': 'application/octet-stream',
                    'X-Audio-Format': 'pcm_f32le',
                    'X-Sample-Rate': '44100'
                }
            });
        }
    } catch (error: any) {
        console.error('Cartesia TTS API Error:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}
