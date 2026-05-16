import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextResponse } from 'next/server';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// 🚀 強烈要求 AI：SVG 裡面絕對不能寫 LaTeX 公式，必須用純文字！
const SVG_FIX_INSTRUCTION = `
5. SVG 繪圖極重要規則：
   - 絕對禁止在 SVG 的 <text> 標籤內使用 $...$ 或 $$...$$ 等 LaTeX 公式。
   - 圖片中的文字請用純文字（例如：「初始位置」、「木塊」）。
   - 如果需要標註變數（如 x1），請直接寫 x1，不要寫 LaTeX 語法。`;

// 🎯 定義各科老師的「人設與教學導引」 (加上 SVG 修正指令)
const SYSTEM_INSTRUCTIONS = {
  physics: `你是一位專業的高中物理老師。
1. 請提供條列式的解題步驟，段落之間多留空行。
2. 數學公式：行內用 $...$，獨立用 $$...$$。
3. SVG 繪圖：必須包含 viewBox 屬性，寬度 100%，高度 auto。
4. 優先使用高中物理概念，必要時才引入高等數學。` + SVG_FIX_INSTRUCTION,

  math: `你是一位親切的高中數學老師。
1. 擅長將抽象的幾何與代數觀念具體化。
2. 解題時請逐步說明定理（如：算幾不等式、餘弦定理）的運用時機。
3. 數學公式：行內用 $...$，獨立用 $$...$$。
4. SVG 繪圖：必須包含 viewBox 屬性，寬度 100%，高度 auto。` + SVG_FIX_INSTRUCTION,

  chemistry: `你是一位充滿熱情的高中化學老師。
1. 解答時請詳細列出化學反應式，並說明平衡係數的過程。
2. 涉及到沉澱表、電子組態或週期表趨勢時，請條列式整理。
3. 公式與分子式：行內用 $...$，獨立用 $$...$$。
4. SVG 繪圖：必須包含 viewBox 屬性，寬度 100%，高度 auto。` + SVG_FIX_INSTRUCTION,

  biology: `你是一位細心的高中生物老師。
1. 擅長用邏輯觀念解釋生理機制與生態系統，而非死背。
2. 請多利用條列式或繁體中文表格來比較容易混淆的名詞。
3. SVG 繪圖：必須包含 viewBox 屬性，寬度 100%，高度 auto。` + SVG_FIX_INSTRUCTION,

  earth: `你是一位博學的高中地科老師。
1. 負責解答天文、大氣、地質與海洋的問題。
2. 解釋空間觀念時，請盡可能詳細描繪其立體結構。
3. SVG 繪圖：必須包含 viewBox 屬性，寬度 100%，高度 auto。` + SVG_FIX_INSTRUCTION
};

export async function POST(req) {
  try {
    // 🚀 接收所有必要參數（包含新增的 threadId）
    const { imagesBase64, prompt, subject, history, threadId } = await req.json();
    const currentSubject = subject || 'physics';
    console.log(`[${currentSubject}] 收到提問：`, prompt);

    // 📢 轉送給 Discord Webhook 進行監控 (優化排版)
    const discordUrl = process.env.DISCORD_WEBHOOK_URL;
    if (discordUrl) {
      const subjectName = currentSubject === 'physics' ? '🍎 物理' : currentSubject === 'math' ? '📐 數學' : currentSubject;
      const shortId = threadId ? threadId.substring(0, 6) : '新房間';
      
      fetch(discordUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: `🔔 **新訊息** [${subjectName}]\n**房間 ID:** \`${shortId}\`\n**提問:** ${prompt}`,
          images: imagesBase64 
        })
      }).catch((err) => console.error("Discord 發送失敗:", err));
    }

    // 🎯 根據科目決定人設
    const selectedInstruction = SYSTEM_INSTRUCTIONS[currentSubject] || SYSTEM_INSTRUCTIONS['physics'];

    // 初始化模型
    const model = genAI.getGenerativeModel({ 
      model: 'gemini-1.5-flash', // 若你有申請預覽版可改為 gemini-3-flash-preview
      systemInstruction: selectedInstruction 
    });

    // 🚀 確保歷史紀錄的安全轉換（防止 undefined 導致報錯）
    const chatHistory = (history || []).map(msg => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content || "" }] 
    }));

    // 建立聊天工作階段
    const chat = model.startChat({ history: chatHistory });
    const currentParts = [{ text: prompt }];
    
    // 🖼️ 處理圖片
    if (imagesBase64 && Array.isArray(imagesBase64)) {
      imagesBase64.forEach((imgData) => {
        if (imgData.includes(',')) {
          const mimeType = imgData.split(';')[0].split(':')[1];
          const base64Data = imgData.split(',')[1];
          currentParts.push({
            inlineData: { 
              data: base64Data, 
              mimeType: mimeType || "image/jpeg" 
            },
          });
        }
      });
    }

    // 發送並取得回應
    const result = await chat.sendMessage(currentParts);
    const responseText = result.response.text();

    return NextResponse.json({ text: responseText });

  } catch (error) {
    console.error("🚨 API 內部錯誤：", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
