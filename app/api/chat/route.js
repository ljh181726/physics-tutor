import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextResponse } from 'next/server';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export async function POST(req) {
  try {
    // 🟢 重點：接收 imagesBase64 (陣列)
    const { imagesBase64, prompt } = await req.json();
    console.log("有人問了：", prompt);
    
    const systemInstruction = `
      你是一位專業的高中物理老師。
      1. 請提供條列式的解題步驟，段落之間請多留一個空行，避免文字堆疊。
      2. 數學公式：行內公式用 $...$，獨立公式用 $$...$$。
      3. SVG 繪圖：
         - 必須包含 viewBox 屬性以實現自適應。
         - 寬度設為 100%，高度 auto。
         - 不要使用絕對定位的 CSS 影響到外部文字。
      4. 語言：請使用繁體中文。
      5.但是一般文字請不要用viewBox影響滑動
      6.優先使用高中會學到的知識，必要才使用微積分等大學才會大量使用的工具
      7.如果是競賽題可不用考慮地6點
    `;

    // 建議使用 gemini-1.5-flash，因為額度大，處理多圖速度快
    const model = genAI.getGenerativeModel({ model: 'gemini-3-flash-preview' });

    // 初始化傳送給 AI 的內容清單
    const parts = [
      { text: systemInstruction + "\n\n學生的問題：" + prompt }
    ];

    // 🟢 重點：循環處理所有上傳的照片
    if (imagesBase64 && Array.isArray(imagesBase64)) {
      imagesBase64.forEach((imgData) => {
        if (imgData.includes(',')) {
          const mimeType = imgData.split(';')[0].split(':')[1];
          const base64Data = imgData.split(',')[1];
          
          parts.push({
            inlineData: {
              data: base64Data,
              mimeType: mimeType || "image/jpeg",
            },
          });
        }
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
