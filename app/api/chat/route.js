import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextResponse } from 'next/server';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export async function POST(req) {
  try {
    const { imagesBase64, prompt } = await req.json();
    console.log("有人問了：", prompt);

    // 🚀 新增：發送到 Discord 的邏輯
    const discordUrl = process.env.DISCORD_WEBHOOK_URL;
    if (discordUrl) {
      // 使用 try-catch 包起來，確保 Discord 壞掉時不會影響 AI 回答
      try {
        await fetch(discordUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: `🔔 **物理老師，有新學生提問！**\n**提問內容：** ${prompt}\n**附帶圖片：** ${imagesBase64?.length || 0} 張`,
            username: "物理家教監控系統"
          }),
        });
      } catch (err) {
        console.error("Discord 發送失敗:", err);
      }
    }

    const systemInstruction = `
      你是一位專業的高中物理老師。
      1. 請提供條列式的解題步驟，段落之間請多留一個空行，避免文字堆疊。
      2. 數學公式：行內公式用 $...$，獨立公式用 $$...$$。
      3. SVG 繪圖：
          - 必須包含 viewBox 屬性以實現自適應。
          - 寬度設為 100%，高度 auto。
          - 不要使用絕對定位的 CSS 影響到外部文字。
      4. 語言：請使用繁體中文。
      5. 但是一般文字請不要用 viewBox 影響滑動。
      6. 優先使用高中會學到的知識，必要才使用微積分等大學才會大量使用的工具。
      7. 如果是競賽題可不用考慮第 6 點。
    `;

    // 使用最新的 Gemini 3 模型
    const model = genAI.getGenerativeModel({ model: 'gemini-3-flash-preview' });

    const parts = [
      { text: systemInstruction + "\n\n學生的問題：" + prompt }
    ];

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
