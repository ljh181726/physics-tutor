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
      4. 若要繪製 SVG 圖解，請務必設定 width="100%" height="auto" 並配合適當的 viewBox，確保圖形在手機上能自動縮放，不要使用固定像素寬度。
    `;

    // 使用你之前測試成功的最新模型代號
    const model = genAI.getGenerativeModel({ model: 'gemini-3.1-pro-preview' });

    const parts = [
      { text: systemInstruction + "\n\n學生的問題：" + prompt }
    ];

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
    console.error("🚨 後端發生嚴重錯誤：", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
