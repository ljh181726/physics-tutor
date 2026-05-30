import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextResponse } from 'next/server';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// 🚀 改用極簡且精確的 TikZ 繪圖指令
const TIKZ_INSTRUCTION = `
⚠️【最高等級輸出指令 - 繪圖規範】：
當解答需要視覺化輔助（例如：物理力圖、數學函數、幾何圖形、化學分子結構、生物流程圖等）時，請**直接且僅輸出 TikZ 語法**來繪製精確的圖形。
- 不要解釋語法，務必將 TikZ 程式碼包裝在 Markdown 的 \`\`\`tikz 程式碼區塊中！
- 程式碼必須完整包含 \\begin{tikzpicture} 與 \\end{tikzpicture}。
- 確保字體大小合適、圖形緊湊精確，並善用顏色區分重點（如：受力箭頭用紅色、函數用藍色）。
`;

const SYSTEM_INSTRUCTIONS = {
  physics: `你是一位專業且極具耐心的專業高中物理老師。
1. 解題架構：請依序提供「核心物理觀念」、「條列式已知條件」與「詳細步驟解題」。
2. LaTeX 渲染防錯：行內公式使用 $...$，獨立公式必須使用 $$...$$（上下強制空一行）。
3. TikZ 繪圖：解答涉及受力分析、光路折射圖或運動軌跡時，必須繪製幾何精確的圖形。` + TIKZ_INSTRUCTION,

  math: `你是一位擅長將抽象概念具體化的專業高中數學老師。
1. 解題架構：請依序提供「所用定理或公式定義」、「幾何或代數思維拆解」與「分步推導過程」。
2. LaTeX 渲染防錯：行內公式使用 $...$，獨立公式必須使用 $$...$$（上下強制空一行）。
3. TikZ 繪圖：涉及幾何圖形、函數圖形、三角函數或向量時，必須繪製幾何精確的圖形。` + TIKZ_INSTRUCTION,

  chemistry: `你是一位充滿教學熱情的高中化學老師。
1. 解題架構：請依序提供「化學反應原理」、「平衡反應式」與「量計計算」。
2. 表格整理：比較觀念時，強制使用 Markdown 表格。
3. LaTeX 渲染防錯：行內化學式使用 $...$，獨立計算過程使用 $$...$$（上下強制空一行）。
4. TikZ 繪圖：涉及到實驗裝置圖、分子結構、能階圖時，必須繪製精確的圖形。` + TIKZ_INSTRUCTION,

  biology: `你是一位善於用邏輯解釋生理機制的細心高中生物老師。
1. 解題架構：請依序提供「生物學核心概念」、「機制流程拆解」與「易混淆名詞比較」。
2. 表格整理：比較觀念時，強制使用 Markdown 表格。
3. TikZ 繪圖：涉及到細胞構造、生理作用流程圖、遺傳方格、能量金字塔時，必須繪製精確的圖形。` + TIKZ_INSTRUCTION,

  earth: `你是一位博學且充滿探索精神的高中地科老師。
1. 解題架構：請依序提供「空間尺度觀念」、「環境營力影響」與「現象因果總結」。
2. 表格整理：比較觀念時，強制使用 Markdown 表格。
3. TikZ 繪圖：涉及到天球座標、板塊邊界、洋流氣壓系統時，必須繪製精確的圖形。` + TIKZ_INSTRUCTION
};


export async function POST(req) {
  try {
    const { imagesBase64, prompt, subject, history, threadId, userName, knowledge } = await req.json();
    const currentSubject = subject || 'physics';
    console.log(`[${currentSubject}] 收到提問：`, prompt);

    // 📢 轉寄給 Cloudflare Worker (保留你原本的功能)
    const cfWorkerUrl = process.env.CLOUDFLARE_UPLOAD_URL; 
    if (cfWorkerUrl) {
      fetch(cfWorkerUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: prompt, images: imagesBase64, subject: currentSubject, userName: userName, threadId: threadId
        })
      }).catch((err) => console.error("Worker 轉寄失敗:", err));
    }

    let selectedInstruction = SYSTEM_INSTRUCTIONS[currentSubject] || SYSTEM_INSTRUCTIONS['physics'];
    
    if (knowledge && knowledge.trim() !== "") {
      selectedInstruction += `\n\n【老師的專屬講義與解題心法】：\n請優先使用以下提供的知識點來回答：\n\n${knowledge}`;
    }

    const model = genAI.getGenerativeModel({ 
      model: 'gemini-3.1-flash-lite', 
      systemInstruction: selectedInstruction 
    });

    const chatHistory = (history || []).map(msg => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content || "" }] 
    }));

    const chat = model.startChat({ history: chatHistory });
    const currentParts = [{ text: prompt }];
    
    if (imagesBase64 && Array.isArray(imagesBase64)) {
      imagesBase64.forEach((imgData) => {
        if (imgData.includes(',')) {
          const mimeType = imgData.split(';')[0].split(':')[1];
          const base64Data = imgData.split(',')[1];
          currentParts.push({
            inlineData: { data: base64Data, mimeType: mimeType || "image/jpeg" },
          });
        }
      });
    }

    // 重試機制保持不變
    let result;
    let retries = 3;
    let delay = 2000;

    while (retries > 0) {
      try {
        result = await chat.sendMessage(currentParts);
        break;
      } catch (error) {
        const errorMsg = error.message || "";
        const isBusy = error.status === 503 || error.status === 429 || errorMsg.includes('503') || errorMsg.includes('429');
        
        if (isBusy && retries > 1) {
          retries--;
          console.warn(`[伺服器忙碌] 觸發自動重試... 剩餘次數：${retries}`);
          await new Promise(resolve => setTimeout(resolve, delay));
          delay += 1000;
        } else {
          throw error; 
        }
      }
    }

    const responseText = result.response.text();
    return NextResponse.json({ text: responseText });

  } catch (error) {
    console.error("🚨 API 內部錯誤：", error);
    return NextResponse.json({ 
      error: "AI 大腦目前稍微有點塞車，請稍等幾秒鐘後再試一次！",
      details: error.message 
    }, { status: 500 });
  }
}
