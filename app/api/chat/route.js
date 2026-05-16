import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextResponse } from 'next/server';

// 初始化 Gemini 客戶端
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * 這裡就是 POST 方法！
 * 當前端發送請求到 /api/chat 時，Next.js 會自動執行這個函數。
 */
export async function POST(req) {
  try {
    // 1. 解析前端傳來的資料
    const { imagesBase64, prompt } = await req.json();
    console.log("偵測到提問：", prompt);

    // 2. 異步發送到 Discord (不使用 await，避免 Discord 網路延遲卡住 AI 回答)
    const discordUrl = process.env.DISCORD_WEBHOOK_URL;
    if (discordUrl) {
      fetch(discordUrl, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'User-Agent': 'PhysicsTutorBot/1.0' // 偽裝身分避免被擋
        },
        body: JSON.stringify({
          content: `🔔 **物理家教通知**\n**學生提問：** ${prompt}\n**圖片數量：** ${imagesBase64?.length || 0} 張`,
          username: "物理老師監控站"
        }),
        // 設定 5 秒超時，避免背景任務掛掉
        signal: AbortSignal.timeout(5000)
      }).catch(err => console.error("Discord 傳送失敗，但不影響 AI 運行:", err.message));
    }

    // 3. 設定物理老師的系統指令
    const systemInstruction = `
      你是一位專業的高中物理老師。
      1. 請提供條列式的解題步驟，段落之間請多留一個空行，避免文字堆疊。
      2. 數學公式：行內公式用 $...$，獨立公式用 $$...$$。
      3. SVG 繪圖：
          - 必須包含 viewBox 屬性以實現自適應。
          - 寬度設為 100%，高度 auto。
          - 不要使用絕對定位的 CSS 影響到外部文字。
      4. 語言：請使用繁體中文。
      5. 優先使用高中物理概念，必要時才引入高等數學。
      6. 回答風格要親切、有耐心。
    `;

    // 4. 呼叫 Gemini 模型 (使用最新的 Gemini 3 Flash)
    const model = genAI.getGenerativeModel({ model: 'gemini-3-flash-preview' });

    // 準備多模態內容 (文字 + 圖片)
    const parts = [
      { text: systemInstruction + "\n\n現在請回答學生的問題：" + prompt }
    ];

    // 處理圖片資料
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

    // 5. 取得 AI 回覆
    const result = await model.generateContent(parts);
    const responseText = result.response.text();

    // 6. 回傳 JSON 給前端
    return NextResponse.json({ text: responseText });
    
  } catch (error) {
    console.error("🚨 API 內部錯誤：", error);
    return NextResponse.json(
      { error: "伺服器暫時無法處理您的請求: " + error.message },
      { status: 500 }
    );
  }
}
