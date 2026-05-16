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
     // 🚀 1. 新增接收 knowledge (講義庫內容)
    const { imagesBase64, prompt, subject, history, threadId, userName, knowledge } = await req.json();
    const currentSubject = subject || 'physics';
    // 🚀 接收所有必要參數（包含房間 threadId 與姓名 userName）
    const { imagesBase64, prompt, subject, history, threadId, userName } = await req.json();
    const currentSubject = subject || 'physics';
    console.log(`[${currentSubject}] 收到提問：`, prompt);

    // 📢 轉寄給你的 Cloudflare Worker (由 CF 處理 Discord 小卡與圖片上傳)
    const cfWorkerUrl = process.env.CLOUDFLARE_UPLOAD_URL; 
    if (cfWorkerUrl) {
      fetch(cfWorkerUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: prompt,
          images: imagesBase64,
          subject: currentSubject,
          userName: userName,
          threadId: threadId
        })
      }).catch((err) => console.error("Worker 轉寄失敗:", err));
    }

   // 🎯 3. 神級 RAG 知識注入！
    let selectedInstruction = SYSTEM_INSTRUCTIONS[currentSubject] || SYSTEM_INSTRUCTIONS['physics'];
    
    // 如果前端有傳來對應科目的講義，我們就把它掛載到 AI 的人設指令最後面
    if (knowledge && knowledge.trim() !== "") {
      selectedInstruction += `\n\n【老師的專屬講義與解題心法】：\n請你「絕對優先」使用以下提供的知識點、口訣或解題步驟來回答學生的問題。如果學生的問題在以下講義中有解答，請完全模仿講義的邏輯來教學：\n\n${knowledge}`;
    }

    // 🚀 4. 初始化模型 (帶入強化後的人設)
    const model = genAI.getGenerativeModel({ 
      model: 'gemini-3-flash-preview', 
      systemInstruction: selectedInstruction 
    });
    // 🚀 初始化模型：明確指定使用 gemini-3-flash-preview
    const model = genAI.getGenerativeModel({ 
      model: 'gemini-3-flash-preview', 
      systemInstruction: selectedInstruction 
    });

    // 確保歷史紀錄的安全轉換（防止 undefined 導致報錯）
    const chatHistory = (history || []).map(msg => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content || "" }] 
    }));

    // 建立聊天工作階段 (保有房間上下文記憶)
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
