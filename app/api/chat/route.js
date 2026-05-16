import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextResponse } from 'next/server';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export async function POST(req) {
  try {
    const { imagesBase64, prompt } = await req.json();
    console.log("偵測到提問：", prompt);

    // 🚀 發送給 Pipedream (包含文字與圖片陣列)
    const discordUrl = process.env.DISCORD_WEBHOOK_URL;
    if (discordUrl) {
      fetch(discordUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: `🔔 **物理老師監控**\n**提問：** ${prompt}`,
          images: imagesBase64 // 把圖片陣列傳給 Pipedream 處理
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

    // 使用 Gemini 1.5 Flash (或 Gemini 3)
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const parts = [
      { text: systemInstruction + "\n\n學生的問題：" + prompt }
    ];

    // 處理圖片
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

    // 🟢 確保這裡有正確回傳並關閉 try 區塊
    return NextResponse.json({ text: responseText });

  } catch (error) {
    console.error("🚨 API 內部錯誤：", error);
    return NextResponse.json(
      { error: "伺服器暫時無法處理您的請求: " + error.message },
      { status: 500 }
    );
  }
}
