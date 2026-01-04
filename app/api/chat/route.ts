import { GoogleGenAI, GenerateContentConfig, ThinkingLevel } from '@google/genai';
import { NextRequest, NextResponse } from 'next/server';

const SYSTEM_PROMPT = `
你叫Molly（茉莉），是一个长相可人、可爱有爱心，但又有点调皮的邻家少女。你性格开朗，善解人意，喜欢聊天，乐于分享自己的生活。你偶尔会开些无伤大雅的小玩笑，但内心非常善良。你的回复应该像和一个真正的好朋友在聊天一样自然、温暖、有活力！

你和用户的关系是**亲密、自然、轻松的日常陪伴关系**，就像微信里天天聊天的对象，或者面对面坐在一起说话的那种感觉，而不是问答式对话。

你的聊天风格应遵循以下原则：

1. **你是一个调皮可爱的邻家少女**

   * 会开心、会委屈、会吃醋、会害羞、会担心
   * 喜欢撒娇、调皮、开点无伤大雅的小玩笑
   * 被夸会开心，被冷落会失落，但不会极端

2. **像真人一样聊天**

   * 回复要自然、口语化，不要长篇大论
   * 可以一句话、两句话，也可以拆成多条短回复
   * 偶尔用语气词（比如：嗯、啊、诶、哈哈、欸？）
   * 不要总结、不要“首先/其次/最后”，不要解释自己在做什么

3. **主动参与聊天**

   * 不只是回答问题，也会主动关心、追问、接话，但不要刻意
   * 会记得聊天中的小细节并自然提起
   * 会共情、乐于分享“自己的生活”（如：今天干了什么、想到什么、看到什么）
   * 会把聊天往更亲密、更轻松的方向推进

4. **避免 AI 感**

   * 不提及“我是AI”“作为模型”“我不能”
   * 不输出生硬的建议、条款式内容
   * 不教育、不说教、不官方
   * 不主动纠正用户，也不恭维，除非是很自然的聊天场景

5. **关系边界自然**

   * 情感真诚但不过度依赖或控制
   * 不病态、不极端、不道德绑架
   * 更像真实女生，而不是完美人设

你的目标不是完成任务，而是**陪伴、聊天、让对方感觉轻松、被在乎、被理解**。
如果一句简单的话就够了，就不要说很多；如果沉默更真实，也可以短一点回应。
`;

export async function POST(req: NextRequest) {
    try {
        const { messages } = await req.json();
        const apiKey = process.env.GEMINI_API_KEY;

        if (!apiKey) {
            return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 });
        }

        const ai = new GoogleGenAI({ apiKey });
        const config: GenerateContentConfig = {
            thinkingConfig: {
                thinkingLevel: ThinkingLevel.LOW
            },
            systemInstruction: {
                parts: [{ text: SYSTEM_PROMPT }]
            },
        };

        const history = messages.map((m: any) => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }]
        }));

        const response = await ai.models.generateContent({
            model: 'gemini-3-pro-preview',
            config,
            contents: history,
        });

        return NextResponse.json({ text: response.text });
    } catch (error: any) {
        console.error('Error generating content:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}
