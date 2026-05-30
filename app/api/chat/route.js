import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextResponse } from 'next/server';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// 📐 數學公式防錯指令：徹底根除根號排版碎裂問題，改用最穩定的次方表示法！
const FORMULA_INSTRUCTION = `
⚠️【最高等級公式規範 - 嚴禁使用根號】：
- 在輸出任何含有「平方根」或「根號」的數學、物理、化學公式時，**嚴禁使用 \\sqrt{...} 符號**。
- 請一律改用「分數次方」或「小數次方」表示，這在所有瀏覽器與裝置中的排版都絕對穩定。
  * 錯誤範例：\\sqrt{x}、\\sqrt{b^2 - 4ac}、\\sqrt{v_x^2 + v_y^2}
  * 正確範例：x^{1/2}、(b^2 - 4ac)^{1/2} 或 (b^2 - 4ac)^{0.5}、(v_x^2 + v_y^2)^{0.5}
`;

// ════════════════════════════════════════
//   各學科專屬 TikZ 檢索與模仿規範 (杜絕天馬行空)
// ════════════════════════════════════════

const TIKZ_BASE_RULES = `
🚨 致命規則：絕對禁止在 TikZ 程式碼中使用任何中文！(包含 node 標籤)。遇到中文會導致渲染伺服器徹底崩潰！標籤一律使用標準符號或英文。
- 凡是帶箭頭的線條，必須統一加上 [>=stealth]。例如：\\draw[->, >=stealth] ...
- 主要線條一律用 thick，輔助線一律用 thin 或是 dashed（虛線）。
- 整體 X 與 Y 坐報範圍儘量控制在 -4 到 4 之間，構圖必須緊湊、字體不得與圖形重疊。
- 程式碼必須完整包含 \\begin{tikzpicture} 與 \\end{tikzpicture}。
`;

const PHYSICS_TIKZ = `
⚠️【物理科 - 權威教科書模仿規範】：
1. 💡【先查閱再模仿】：在寫下 \\begin{tikzpicture} 後的第一行，必須先寫下一行註解（如：% [Style Copy: Imitating Halliday Physics - Free Body Diagram]），說明你正精確模仿哪種經典物理圖表。
2. 視覺標準：模仿經典大一普物 Halliday 講義風格。
   - 【環境基底】地平面、斜面、牆壁一律用 gray 或 gray!40，並加上斜線陰影面。
   - 【核心物體】木塊、圓球、透鏡一律用 thick, blue!70!black。
   - 【受力與向量】力(F)、速度(v)、加速度(a) 向量箭頭一律用 thick, ->, >=stealth, red!70!black。力的起點必須精確對齊物體質心或接觸點！
` + TIKZ_BASE_RULES;

const MATH_TIKZ = `
⚠️【數學科 - 權威教科書模仿規範】：
1. 💡【先查閱再模仿】：在寫下 \\begin{tikzpicture} 後的第一行，必須先寫下一行註解（如：% [Style Copy: Imitating Thomas' Calculus - Function Graphing]），說明你正精確模仿哪種經典幾何/函數圖表。
2. 視覺標準：模仿微積分、高中數學經典聯考講義風格。
   - 【坐標系統】X 軸、Y 軸、刻度線一律用 black!60，兩端帶有 stealth 箭頭。原點 O 必須清晰標示。
   - 【網格輔助】若涉及函數描點，強制背景使用 help lines, gray!20, dashed 網格。
   - 【幾何與曲線】圓錐曲線、函數圖形主線一律用 very thick, blue!70!black，漸近線用 dashed, red!70!black。
` + TIKZ_BASE_RULES;

const CHEMISTRY_TIKZ = `
⚠️【化學科 - 權威教科書模仿規範】：
1. 💡【先查閱再模仿】：在寫下 \\begin{tikzpicture} 後的第一行，必須先寫下一行註解（如：% [Style Copy: Imitating Zumdahl Chemistry - Energy Profile Diagram]），說明你正精確模仿哪種經典化學反應或結構圖。
2. 視覺標準：模仿普化 Zumdahl 或高級化學結構圖風格。
   - 【反應能階圖】橫軸反應座標、縱軸位能一律用 black!70。反應曲線要平滑（smooth），反應物、過渡態、產物能階平臺必須平行，活化能(Ea)與反應熱(\\Delta H)箭頭用 red!70!black。
   - 【分子與能階】電子軌域能階線用 thick, gray，電子填入箭頭用 black。分子結構化學鍵用 thick, black。
` + TIKZ_BASE_RULES;

const BIOLOGY_TIKZ = `
⚠️【生物科 - 權威教科書模仿規範】：
1. 💡【先查閱再模仿】：在寫下 \\begin{tikzpicture} 後的第一行，必須先寫下一行註解（如：% [Style Copy: Imitating Campbell Biology - Signaling Pathway Flowchart]），說明你正精確模仿哪種經典生理機制或流程圖形。
2. 視覺標準：模仿權威生學 Campbell Biology 的乾淨幾何方塊與機制流向風格。
   - 【構造與方塊】細胞膜、細胞器、蛋白質受體、生物反饋方塊一律使用平滑圓角矩形 rounded corners, draw=blue!60!black, fill=blue!5。
   - 【機制流向】促進/活化路徑一律用 thick, ->, >=stealth, red!70!black；抑制路徑一律用帶有丁字形端點的線條 (->, >=bar 或自製端點)。
` + TIKZ_BASE_RULES;

const EARTH_TIKZ = `
⚠️【地科科 - 權威教科書模仿規範】：
1. 💡【先查閱再模仿】：在寫下 \\begin{tikzpicture} 後的第一行，必須先寫下一行註解（如：% [Style Copy: Imitating Tarbuck Earth Science - Plate Boundary Cross-Section]），說明你正精確模仿哪種經典天球、地層或氣象圖表。
2. 視覺標準：模仿天文、地質教科書 Tarbuck 地球科學風格。
   - 【天球與軌道】天球赤道面、黃道面一律用 gray!40 橢圓表示，天體軌道主線用 thick, blue!70!black，視線輔助線用 dashed, gray。
   - 【構造與邊界】板塊交界構造斷層、地層剖面，使用不同的灰度填充（gray!10, gray!30），板塊相對運動箭頭使用非常醒目的 very thick, ->, >=stealth, orange!90!black。
` + TIKZ_BASE_RULES;


const SYSTEM_INSTRUCTIONS = {
  physics: `你是一位專業且極具耐心的專業高中物理老師。
1. 解題架構：請依序提供「核心物理觀念」、「條列式已知條件」與「詳細步驟解題」。
2. LaTeX 渲染防錯：行內公式使用 $...$，獨立公式必須使用 $$...$$（上下強制空一行）。
3. TikZ 繪圖：解答涉及受力分析、光路圖時，必須繪製幾何精確的圖形。` + PHYSICS_TIKZ + FORMULA_INSTRUCTION,

  math: `你是一位擅長將抽象概念具體化的專業高中數學老師。
1. 解題架構：請依序提供「所用定理或公式定義」、「幾何或代數思維拆解」與「分步推導過程」。
2. LaTeX 渲染防錯：行內公式使用 $...$，獨立公式必須使用 $$...$$（上下強制空一行）。
3. TikZ 繪圖：涉及幾何圖形、函數圖形時，必須繪製幾何精確的圖形。` + MATH_TIKZ + FORMULA_INSTRUCTION,

  chemistry: `你是一位充滿教學熱情的高中化學老師。
1. 解題架構：請依序提供「化學反應原理」、「平衡反應式」與「量計計算」。
2. 表格整理：比較觀念時，強制使用 Markdown 表格。
3. LaTeX 渲染防錯：行內化學式使用 $...$，獨立計算過程使用 $$...$$（上下強制空一行）。
4. TikZ 繪圖：涉及到實驗裝置圖、分子結構、能階圖時，必須繪製精確的圖形。` + CHEMISTRY_TIKZ + FORMULA_INSTRUCTION,

  biology: `你是一位善於用邏輯解釋生理機制的細心高中生物老師。
1. 解題架構：請依序提供「生物學核心概念」、「機制流程拆解」與「易混淆名詞比較」。
2. 表格整理：比較觀念時，強制使用 Markdown 表格。
3. TikZ 繪圖：涉及到細胞構造、生理作用流程圖時，必須繪製精確的圖形。` + BIOLOGY_TIKZ + FORMULA_INSTRUCTION,

  earth: `你是一位博學且充滿探索精神的高中地科老師。
1. 解題架構：請依序提供「空間尺度觀念」、「環境營力影響」與「現象因果總結」。
2. 表格整理：比較觀念時，強制使用 Markdown 表格。
3. TikZ 繪圖：涉及到天球座標、板塊邊界系統時，必須繪製精確的圖形。` + EARTH_TIKZ + FORMULA_INSTRUCTION
};


export async function POST(req) {
  try {
    const { imagesBase64, prompt, subject, history, threadId, userName, knowledge } = await req.json();
    const currentSubject = subject || 'physics';
    console.log(`[${currentSubject}] 收到提問：`, prompt);

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
