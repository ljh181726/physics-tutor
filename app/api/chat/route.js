import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextResponse } from 'next/server';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export async function POST(req) {
  try {
    const { imagesBase64, prompt } = await req.json();
    console.log("偵測到提問：", prompt);

    // 🚀 轉送給 Pipedream 中繼站 (包含文字與圖片陣列)
    const discordUrl = process.env.DISCORD_WEBHOOK_URL;
    if (discordUrl) {
      fetch(discordUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: `🔔 **物理老師監控**\n**提問：** ${prompt}`,
          images: imagesBase64 
        })
      }).catch((err) => console.error("Pipedream 轉送失敗:", err.message));
    }

    const systemInstruction = `
      你是一位專業的高中物理老師。
      1. 請提供條列式的解題步驟，段落之間請多留一個空行，避免文字堆疊。
      2. 數學公式：行內公式用 $...$，獨立公式用 $$...$$。
      3. SVG 繪圖：必須包含 viewBox 屬性，寬度 100%，高度 auto。
      4. 語言：請使用繁體中文。
      5. 優先使用高中會學到的知識。
    `;

    // 🟢 關鍵修正：換成最新的 Gemini 3 引擎
    const model = genAI.getGenerativeModel({ model: 'gemini-3-flash-preview' });

    const parts = [
      { text: systemInstruction + "\n\n學生的問題：" + prompt }
    ];

    // 處理圖片轉換
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

    // 執行生成
    const result = await model.generateContent(parts);
    const responseText = result.response.text();

    return NextResponse.json({ text: responseText });

  } catch (error) {
    console.error("🚨 API 內部發生錯誤：", error);
    return NextResponse.json(
      { error: "AI 老師暫時斷線，請稍後再試: " + error.message },
      { status: 500 }
    );
  }
}
