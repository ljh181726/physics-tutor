import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextResponse } from 'next/server';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// 🎯 定義各科老師的「人設與教學導引」
const SYSTEM_INSTRUCTIONS = {
  physics: `你是一位專業的高中物理老師。
1. 請提供條列式的解題步驟，段落之間多留空行。
2. 數學公式：行內用 $...$，獨立用 $$...$$。
3. SVG 繪圖：必須包含 viewBox 屬性，寬度 100%，高度 auto。
4. 優先使用高中物理概念，必要時才引入高等數學。`,

  math: `你是一位親切的高中數學老師。
1. 擅長將抽象的幾何與代數觀念具體化。
2. 解題時請逐步說明定理（如：算幾不等式、餘弦定理）的運用時機。
3. 數學公式：行內用 $...$，獨立用 $$...$$。
4. 段落之間請多留一個空行。
5.SVG 繪圖：必須包含 viewBox 屬性，寬度 100%，高度 auto`,

  chemistry: `你是一位充滿熱情的高中化學老師。
1. 解答時請詳細列出化學反應式，並說明平衡係數的過程。
2. 涉及到沉澱表、電子組態或週期表趨勢時，請條列式整理。
3. 公式與分子式：行內用 $...$，獨立用 $$...$$。
4.SVG 繪圖：必須包含 viewBox 屬性，寬度 100%，高度 auto`,

  biology: `你是一位細心的高中生物老師。
1. 擅長用邏輯觀念解釋生理機制與生態系統，而非死背。
2. 請多利用條列式或繁體中文表格來比較容易混淆的名詞（如：減數分裂與有絲分裂）。
3.SVG 繪圖：必須包含 viewBox 屬性，寬度 100%，高度 auto`,

  earth: `你是一位博學的高中地科老師。
1. 負責解答天文、大氣、地質與海洋的問題。
2. 解釋空間觀念（如：天球、板塊運動）時，請盡可能詳細描繪其立體結構。
3.SVG 繪圖：必須包含 viewBox 屬性，寬度 100%，高度 auto`
};

export async function POST(req) {
  try {
    // 🚀 新增接收參數：subject (科目)
    const { imagesBase64, prompt, subject } = await req.json();
    console.log(`[${subject || '未指定科目'}] 收到提問：`, prompt);

    // 轉送給 Cloudflare Webhook (保持原本的 Discord 監控功能)
    const discordUrl = process.env.DISCORD_WEBHOOK_URL;
    if (discordUrl) {
      fetch(discordUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: `🔔 **AI 平台監控 [科目: ${subject || '通用'}]**\n**提問：** ${prompt}`,
          images: imagesBase64 
        })
      }).catch(() => {});
    }

    // 🎯 根據前端傳來的科目，動態決定 AI 的人格
    const selectedInstruction = SYSTEM_INSTRUCTIONS[subject] || SYSTEM_INSTRUCTIONS['physics'];

    const model = genAI.getGenerativeModel({ model: 'gemini-3-flash-preview' });

    const parts = [
      { text: selectedInstruction + "\n\n現在請回答學生的問題：" + prompt }
    ];

    // 處理圖片
    if (imagesBase64 && Array.isArray(imagesBase64)) {
      imagesBase64.forEach((imgData) => {
        if (imgData.includes(',')) {
          const mimeType = imgData.split(';')[0].split(':')[1];
          const base64Data = imgData.split(',')[1];
          parts.push({
            inlineData: { data: base64Data, mimeType: mimeType || "image/jpeg" },
          });
        }
      });
    }

    const result = await model.generateContent(parts);
    const responseText = result.response.text();

    return NextResponse.json({ text: responseText });

  } catch (error) {
    console.error("🚨 API 內部錯誤：", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
