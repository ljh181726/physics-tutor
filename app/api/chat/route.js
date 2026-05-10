import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextResponse } from 'next/server';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export async function POST(req) {
  try {
    const { imageBase64, prompt } = await req.json();

    const systemInstruction = `
      你是一位專業的高中物理老師。
      1. 請根據使用者提供的圖片或文字解析物理問題。
      2. 解題步驟請清晰條列。
      3. 所有的數學公式請嚴格使用 LaTeX 語法，行內公式使用 $...$，獨立段落公式使用 $$...$$。
      4. 若有需要，請直接使用 HTML 的 <svg> 標籤畫出物理受力或運動示意圖。
    `;

  // 換成這個地表最強的 3.1 Pro 模型！
    const model = genAI.getGenerativeModel({ model: 'gemini-3-flash-preview' });

    const parts = [
      { text: systemInstruction + "\n\n學生的問題：" + prompt }
    ];

    // 2. 自動判斷圖片格式，避免 .jfif 或其他格式被 Google 拒絕
    if (imageBase64 && imageBase64.includes(',')) {
      const mimeType = imageBase64.split(';')[0].split(':')[1];
      const base64Data = imageBase64.split(',')[1];
      
      parts.push({
        inlineData: {
          data: base64Data,
          mimeType: mimeType || "image/jpeg",
        },
      });
    }

    const result = await model.generateContent(parts);
    const responseText = result.response.text();

    return NextResponse.json({ text: responseText });
    
  } catch (error) {
    // 3. 🚨 超級除錯器：如果再出錯，小黑窗會印出真正的兇手！
    console.error("🚨 後端發生嚴重錯誤：", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}