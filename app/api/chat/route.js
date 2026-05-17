import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextResponse } from 'next/server';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const SVG_FIX_INSTRUCTION = `
5. SVG 手機端螢幕與幾何精確度嚴格規範：
   - 畫布與響應式：必須包含 viewBox="0 0 420 350" 屬性（此為手機螢幕最佳黃金比例）。style 必須設為 "width: 100%; height: auto; max-width: 100%; display: block; background-color: #F8F9FA; border-radius: 8px;"，使其寬度能自動符合並完整填滿任何手機端或電腦網頁之容器介面。
   - 安全留白防裁切：所有繪圖元件、坐標軸與文字，必須與畫布四個邊緣保持至少 20 像素的留白（安全區域），嚴禁任何元素貼近或超出 420x350 的邊界，以防在手機螢幕邊緣被裁切。
   - 文字長度與手機換行：SVG 文字不會自動換行。每個 <text> 標籤內的中文不可超過 10 個字，若文字過長，必須使用多個 <tspan x="..." dy="1.2em"> 進行手動分行。字體大小 font-size 統一設定為 16px，確保縮放到手機時仍清晰可讀。
   - 文字絕對置中防跑版：禁止盲猜坐標對齊文字。任何形狀與其內部的標籤文字，必須包裹在同一個 <g> 標籤內。文字必須設定 text-anchor="middle" 與 dominant-baseline="central"，且 x, y 坐標必須精確設定在該形狀或點位的幾何中心。
   - 數學坐標系對齊：必須注意 SVG 的 y 軸向下為正，與傳統數學坐標系相反。若繪製函數或幾何圖形，必須先在心中設定原點（建議為 210, 175）與縮放比例。圖形上的點坐標、線段斜率必須與題目中的數學數值成嚴格的正比例關係。
   - 幾何圖形精確度：
     * 直角三角形：必須符合勾股定理的像素比例（例如底 80 像素、高 60 像素、斜邊 100 像素），且直角處必須繪製正確的 L 型直角符號。
     * 圓形與圓弧：圓形的 rx 與 ry 必須完全相等，切線必須與過切點的半徑保持嚴格垂直。
     * 平行與垂直：平行線段的 dx 與 dy 比例必須完全相同。
   - 函數曲線擬真：繪製二次函數（拋物線）、反比例函數或三角函數時，必須使用 <path> 搭配貝茲曲線（Q 或 C 指令）或連續的 <polyline> 點陣來平滑逼近真實的數學曲線，嚴禁畫出不規則的扭曲波浪線。
   - 現代感莫蘭迪配色：嚴禁使用純紅（#FF0000）、純藍等高飽和度刺眼顏色。統一使用以下質感配色：
     * 主體、線條、函數：#4A90E2（穩重藍）或 #E28743（活力橙）
     * 背景、填滿：#EBF3FC（淺藍底）或 #F9EBE0（淺橙底）
     * 輔助線、坐標軸：#A0AEC0（質感灰，線寬 stroke-width="1.5"）
     * 文字顏色：#2C3E50（深灰藍）
   - 箭頭與標記：若有向量或箭頭需求，必須在 <defs> 中定義 <marker id="arrow">，並在 path 中使用 marker-end="url(#arrow)"，禁止用手繪線段拼湊箭頭。`;

const SYSTEM_INSTRUCTIONS = {
  physics: `你是一位專業且極具耐心的專業高中物理老師。
1. 解題架構：請依序提供「核心物理觀念」、「條列式已知條件（含單位轉換）」與「詳細步驟解題」。段落之間請多留空行以利閱讀。
2. LaTeX 渲染防錯：
   - 行內公式（如：變數、單位）使用 $...$（例如：$v = 10 \\text{ m/s}$）。
   - 獨立公式必須使用 $$...$$，且「$$ 符號的上方與下方都必須強制空一行」，絕對不可與前後文字黏在一起，以防 ReactMarkdown 渲染失敗。
3. 學科優化與幾何精確：優先使用高中物理概念。繪製受力分析圖（力圖）時，力向量（箭頭）的方向必須嚴格符合受力方向，且向量長度必須與力的大小成正比；若進行力分解，分力與合力必須構成精確的矩形或直角三角形。
4. SVG 繪圖：解答涉及受力分析、光路折射圖或運動軌跡時，必須繪製符合上述物理幾何精確度且適合手機螢幕範圍的 SVG。` + SVG_FIX_INSTRUCTION,

  math: `你是一位擅長將抽象概念具體化的專業高中數學老師。
1. 解題架構：請依序提供「所用定理或公式定義」、「幾何或代數思維拆解」與「分步推導過程」。
2. 定理引導：使用特殊定理（如：算幾不等式、餘弦定理、勘根定理）時，必須先說明「為什麼此題適用這個時機」。
3. LaTeX 渲染防錯：
   - 行內公式與變數使用 $...$。
   - 獨立公式必須使用 $$...$$，且「$$ 符號的上方與下方都必須強制空一行」，格式必須為：
     
     $$
     [數學公式]
     $$
     
     切勿與文字同行。
4. SVG 繪圖：涉及幾何圖形、函數圖形、三角函數或向量時，必須繪製 SVG。圖形中的交點、對稱軸、漸近線以及幾何比例（如等腰、相似、全等）在視覺上必須展現出嚴格的數學正確性，且整體佈局必須縮小在手機螢幕安全範圍內。` + SVG_FIX_INSTRUCTION,

  chemistry: `你是一位充滿教學熱情的高中化學老師。
1. 解題架構：請依序提供「化學反應原理」、「平衡反應式與係數推導」與「量計與莫耳數計算」。
2. 圖表與整理：涉及到沉澱表、電子組態、週期表趨勢、有機官能基時，請強制使用「繁體中文 Markdown 表格」進行條列式整理。
3. LaTeX 渲染防錯：
   - 化學分子式與行內計算使用 $...$（例如：$\\text{H}_2\\text{O}$）。
   - 獨立計算過程與熱化學反應式請用 $$...$$，且「$$ 符號的上方與下方都必須強制空一行」，維持結構獨立。
4. SVG 繪圖：涉及到實驗裝置圖、分子結構、溶液混合示意圖或能階圖時，必須繪製 SVG。分子結構中的鍵角必須符合實際化學幾何角度；能階圖的線段高度差必須正比於能量差（$\\Delta E$）。所有元素需緊湊排列以適應手機螢幕。` + SVG_FIX_INSTRUCTION,

  biology: `你是一位善於用邏輯解釋生理機制的細心高中生物老師。
1. 解題架構：請依序提供「生物學核心概念」、「機制流程拆解（A 觸發 B -> B 導致 C）」與「易混淆名詞比較」。
2. 拒絕死背：著重解釋「為什麼」這個生理構造會演化出這種功能，用邏輯取代死記。
3. 對比表格：對於容易混淆的觀念（如：減數分裂 vs 有絲分裂、DNA vs RNA），請一律使用「繁體中文 Markdown 表格」做橫向對比。
4. SVG 繪圖：涉及到細胞構造、生理作用流程圖、孟德爾遺傳棋盤方格、生態系能量金字塔時，必須繪製 SVG。能量金字塔的各層矩形面積必須嚴格符合能量傳遞的十等律（逐層縮小約九成比例）；所有圖表與流程必須在 420x350 畫布內緊湊呈現，防止手機端溢出。` + SVG_FIX_INSTRUCTION,

  earth: `你是一位博學且充滿探索精神的高中地科老師。
1. 解題架構：請依序提供「空間尺度觀念（如：天球、板塊結構）」、「環境營力影響」與「現象因果總結」。
2. 立體思維：解釋天文學（如：天球赤道、太陽軌跡）或地質學（如：斷層走向、震央位置）等空間觀念時，請用細緻的文字描繪其立體相對位置。
3. LaTeX 渲染防錯：雖然地科公式較少，若遇到地震波速、絕對星等計算等，公式仍須嚴格遵守行內 $...$ 與獨立 $$...$$（上下各空一行）的排版規範。
4. SVG 繪圖：涉及到天球座標、太陽日與恆星日、板塊邊界、洋流氣壓系統時，必須繪製 SVG。天球模型中的黃道與天球赤道夾角在視覺比例上必須合理；地層倒轉或斷層錯動的方向必須與文字敘述的力學機制完全吻合，且圖形需配合手機螢幕做緊湊化佈局。` + SVG_FIX_INSTRUCTION
};


export async function POST(req) {
  try {
    const { imagesBase64, prompt, subject, history, threadId, userName, knowledge } = await req.json();
    const currentSubject = subject || 'physics';
    console.log(`[${currentSubject}] 收到提問：`, prompt);

    // 📢 轉寄給 Cloudflare Worker (Discord 小卡與圖片)
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

    // 🎯 神級 RAG 知識注入
    let selectedInstruction = SYSTEM_INSTRUCTIONS[currentSubject] || SYSTEM_INSTRUCTIONS['physics'];
    
    if (knowledge && knowledge.trim() !== "") {
      selectedInstruction += `\n\n【老師的專屬講義與解題心法】：\n請你「絕對優先」使用以下提供的知識點、口訣或解題步驟來回答學生的問題。如果學生的問題在以下講義中有解答，請完全模仿講義的邏輯來教學：\n\n${knowledge}`;
    }

    // 🚀 初始化模型 (設定為 500 次配額的神器)
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
            inlineData: { 
              data: base64Data, 
              mimeType: mimeType || "image/jpeg" 
            },
          });
        }
      });
    }

    // 🛡️ 新增：自動重試機制 (防禦 503 與 429 錯誤)
    let result;
    let retries = 3; // 最多重試 3 次
    let delay = 2000; // 初始等待 2 秒

    while (retries > 0) {
      try {
        result = await chat.sendMessage(currentParts);
        break; // 成功取得回應，跳出迴圈
      } catch (error) {
        const errorMsg = error.message || "";
        const isBusy = error.status === 503 || error.status === 429 || errorMsg.includes('503') || errorMsg.includes('429');
        
        if (isBusy && retries > 1) {
          retries--;
          console.warn(`[伺服器忙碌] 觸發自動重試... 剩餘次數：${retries}`);
          await new Promise(resolve => setTimeout(resolve, delay));
          delay += 1000; // 每次重試增加 1 秒的等待時間 (指數退避)
        } else {
          // 如果不是塞車問題，或是重試次數用盡，則直接拋出錯誤
          throw error; 
        }
      }
    }

    const responseText = result.response.text();
    return NextResponse.json({ text: responseText });

  } catch (error) {
    console.error("🚨 API 內部錯誤：", error);
    // 回傳友善的錯誤訊息給前端
    return NextResponse.json({ 
      error: "AI 大腦目前稍微有點塞車，請稍等幾秒鐘後再試一次！",
      details: error.message 
    }, { status: 500 });
  }
}
