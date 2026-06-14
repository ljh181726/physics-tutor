"use client";

import React, {
  useState, useEffect, useRef, Suspense, useMemo, useCallback,
} from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { auth, db } from "../../../lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection, addDoc, query, where, orderBy, getDocs, doc, writeBatch, updateDoc
} from "firebase/firestore";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

/* ════════════════════════════════════════
   SUBJECT MAP
   ════════════════════════════════════════ */
const SUBJECT_MAP = {
  math:      { name: "📐 高中數學", color: "bg-red-600", gradient: "from-rose-500 to-red-600" },
  physics:   { name: "🍎 高中物理", color: "bg-blue-600", gradient: "from-sky-500 to-blue-600" },
  chemistry: { name: "🧪 高中化學", color: "bg-green-600", gradient: "from-emerald-500 to-teal-600" },
  biology:   { name: "🧬 高中生物", color: "bg-purple-600", gradient: "from-purple-500 to-fuchsia-600" },
  earth:     { name: "🌍 高中地科", color: "bg-amber-600", gradient: "from-amber-500 to-orange-600" },
  chinese:   { name: "🏮 高中國文", color: "bg-rose-600", gradient: "from-orange-500 to-rose-600" },
  english:   { name: "🔤 高中英文", color: "bg-indigo-600", gradient: "from-indigo-500 to-violet-600" },
} as const;

/* ════════════════════════════════════════
   MODULE-LEVEL TIKZ CACHE & COMPILATION
   ════════════════════════════════════════ */
const SVG_CACHE: Record<string, string>  = {};
const ERR_CACHE: Record<string, string>  = {};
const PENDING:   Record<string, Promise<void> | undefined> = {};

function buildLatex(code: string): string {
  let tikzBody = code.trim();
  const bodyMatch = tikzBody.match(/\\begin\{tikzpicture\}[\s\S]*?\\end\{tikzpicture\}/);
  if (bodyMatch) tikzBody = bodyMatch[0];
  
  // 濾除中文字元以防編譯失敗
  tikzBody = tikzBody.replace(/[\u4e00-\u9fa5]/g, "");
  
  const libMatch = code.match(/\\usetikzlibrary\{[^}]*\}/g);
  const extraLibs = libMatch ? libMatch.join("\n") : "";
  
  return [
    "\\documentclass[tikz,border=2mm]{standalone}",
    "\\usepackage{amsmath,amssymb}",
    "\\usepackage{pgfplots}",
    "\\pgfplotsset{compat=1.18}",
    // 預載常用 TikZ 套件，大幅加強容錯率與繪圖品質
    "\\usetikzlibrary{arrows.meta,calc,positioning,shapes,patterns,decorations.pathmorphing,backgrounds,fit,intersections,mindmap}",
    extraLibs,
    "\\begin{document}",
    tikzBody,
    "\\end{document}",
  ].join("\n");
}

function fetchTikz(key: string): Promise<void> {
  if (SVG_CACHE[key] || ERR_CACHE[key]) return Promise.resolve();
  const currentPending = PENDING[key];
  if (currentPending) return currentPending;
  
  const p = fetch("https://kroki.io/tikz/svg", {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: buildLatex(key),
  })
    .then((r) => r.text())
    .then((text) => {
      if (text.includes("LaTeX Error") || text.includes("Undefined control sequence")) {
        throw new Error(text.slice(0, 500));
      }
      SVG_CACHE[key] = text;
    })
    .catch((e: any) => { ERR_CACHE[key] = e.message ?? "Unknown error"; })
    .finally(() => { delete PENDING[key]; });
    
  PENDING[key] = p;
  return p;
}

/* ════════════════════════════════════════
   TikzImage — 精緻互動與免重繪設計
   ════════════════════════════════════════ */
const TikzImage = React.memo(({ code }: { code: string }) => {
  const key = code.trim();

  const [svg, setSvg] = useState<string>(() => SVG_CACHE[key] ?? "");
  const [err, setErr] = useState<string>(() => ERR_CACHE[key] ?? "");
  
  // 縮放與全螢幕狀態
  const [scale, setScale] = useState(1);
  const [isFullScreen, setIsFullScreen] = useState(false);

  useEffect(() => {
    if (SVG_CACHE[key]) { setSvg(SVG_CACHE[key]); return; }
    if (ERR_CACHE[key]) { setErr(ERR_CACHE[key]); return; }
    
    fetchTikz(key).then(() => {
      if (SVG_CACHE[key]) setSvg(SVG_CACHE[key]);
      else if (ERR_CACHE[key]) setErr(ERR_CACHE[key]);
    });
  }, [key]);

  const copyLaTeX = () => {
    navigator.clipboard.writeText(code).then(() => {
      alert("✅ 已複製 LaTeX 程式碼到剪貼簿！");
    }).catch(() => {
      alert("❌ 複製失敗");
    });
  };

  const downloadSvg = () => {
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tutor-diagram-${Date.now()}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (err) return (
    <div className="my-4 p-4 bg-red-50 border border-red-200 rounded-2xl text-xs text-red-600 animate-fade-in">
      <div className="flex items-center gap-2 font-bold mb-1">
        <span>⚠️</span> 繪圖代碼編譯失敗
      </div>
      <details className="mt-2">
        <summary className="cursor-pointer font-semibold underline">展開錯誤日誌</summary>
        <pre className="mt-2 p-3 bg-white border border-red-100 rounded-xl overflow-x-auto whitespace-pre-wrap font-mono text-[10px] text-red-500">{err}</pre>
      </details>
      <button 
        onClick={copyLaTeX}
        className="mt-3 px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-800 font-bold rounded-lg cursor-pointer transition-colors"
      >
        📋 複製原始 LaTeX 代碼以自行編譯
      </button>
    </div>
  );

  if (!svg) return (
    <div className="my-4 p-6 bg-slate-100/80 rounded-2xl text-center text-slate-400 font-bold animate-pulse-light flex flex-col items-center gap-2 border border-slate-200/50">
      <span>🎨</span>
      <p className="text-xs">老師正在精確製圖中...</p>
    </div>
  );

  const controlPanel = (
    <div className="flex flex-wrap gap-2 justify-end mb-2">
      <button onClick={() => setScale(s => Math.min(2, s + 0.25))} className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-700 font-bold rounded-lg text-xs cursor-pointer transition-all">🔍+ 放大</button>
      <button onClick={() => setScale(s => Math.max(0.5, s - 0.25))} className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-700 font-bold rounded-lg text-xs cursor-pointer transition-all">🔍- 縮小</button>
      <button onClick={() => setScale(1)} className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-700 font-bold rounded-lg text-xs cursor-pointer transition-all">🔄 重設</button>
      <button onClick={copyLaTeX} className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-700 font-bold rounded-lg text-xs cursor-pointer transition-all">📋 複製 LaTeX</button>
      <button onClick={downloadSvg} className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-700 font-bold rounded-lg text-xs cursor-pointer transition-all">📥 下載 SVG</button>
      <button onClick={() => setIsFullScreen(true)} className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-lg text-xs cursor-pointer transition-all">⛶ 全螢幕</button>
    </div>
  );

  const svgElement = (
    <div 
      style={{ transform: `scale(${scale})`, transformOrigin: "center top", transition: "transform 0.15s ease-out" }}
      className="max-w-full flex justify-center bg-white p-4 rounded-xl border border-slate-100 overflow-x-auto"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );

  return (
    <div className="my-4 p-4 bg-slate-50 border border-slate-200/60 rounded-2xl animate-fade-in relative">
      {controlPanel}
      <div className="overflow-hidden w-full flex justify-center py-2 bg-white rounded-xl">
        {svgElement}
      </div>

      {/* 🌟 全螢幕燈箱 Modal */}
      {isFullScreen && (
        <div className="fixed inset-0 bg-slate-900/90 z-50 flex flex-col justify-between p-6 animate-fade-in">
          <div className="flex justify-between items-center text-white">
            <h4 className="font-extrabold text-sm sm:text-base">📐 觀看精細圖表</h4>
            <div className="flex gap-2">
              <button onClick={() => setScale(s => Math.min(3, s + 0.25))} className="px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-xs font-bold transition-all cursor-pointer">🔍+</button>
              <button onClick={() => setScale(s => Math.max(0.5, s - 0.25))} className="px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-xs font-bold transition-all cursor-pointer">🔍-</button>
              <button onClick={() => setScale(1)} className="px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-xs font-bold transition-all cursor-pointer">🔄</button>
              <button onClick={() => setIsFullScreen(false)} className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 rounded-lg text-xs font-bold transition-all cursor-pointer">✖ 關閉</button>
            </div>
          </div>
          <div className="flex-1 overflow-auto flex items-center justify-center p-4">
            <div 
              style={{ transform: `scale(${scale})`, transition: "transform 0.15s ease-out" }}
              className="bg-white p-6 rounded-2xl shadow-2xl max-w-full max-h-[85vh] overflow-auto"
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          </div>
          <div className="text-center text-xs text-slate-400">
            可使用上方按鈕進行縮放。按關閉返回討論室。
          </div>
        </div>
      )}
    </div>
  );
}, (prev: { code: string }, next: { code: string }) => prev.code.trim() === next.code.trim());

TikzImage.displayName = "TikzImage";

/* ════════════════════════════════════════
   MESSAGE SEGMENTATION
   ════════════════════════════════════════ */
type Seg = { type: "tikz"; code: string } | { type: "md"; text: string };

function parseSegs(raw: string): Seg[] {
  if (!raw) return [];
  let text = raw.replace(/```latex/g, "```tikz");
  if (text.includes("\\begin{tikzpicture}") && !text.includes("```tikz")) {
    text = text.replace(
      /\\begin\{tikzpicture\}[\s\S]*?\\end\{tikzpicture\}/g,
      (m) => `\n\`\`\`tikz\n${m}\n\`\`\`\n`,
    );
  }
  const segs: Seg[] = [];
  const re = /```tikz\n([\s\S]*?)```/g;
  let last = 0, m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) segs.push({ type: "md", text: text.slice(last, m.index) });
    segs.push({ type: "tikz", code: m[1].trim() });
    last = m.index + m[0].length;
  }
  if (last < text.length) segs.push({ type: "md", text: text.slice(last) });
  return segs;
}

/* ════════════════════════════════════════
   MarkdownBlock
   ════════════════════════════════════════ */
const MarkdownBlock = React.memo(({ text }: { text: string }) => (
  <div className="markdown-content prose prose-slate max-w-none">
    <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
      {text}
    </ReactMarkdown>
  </div>
));
MarkdownBlock.displayName = "MarkdownBlock";

/* ════════════════════════════════════════
   MessageBubble
   ════════════════════════════════════════ */
const MessageBubble = React.memo(
  ({ msg, idx, onSave }: { msg: any; idx: number; onSave: (msg: any, idx: number) => void }) => {
    const segs = useMemo(() => parseSegs(msg.content ?? ""), [msg.content]);

    return (
      <div className={`flex w-full my-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
        <div 
          className={`max-w-[85%] sm:max-w-2xl lg:max-w-3xl rounded-3xl p-5 relative group shadow-sm transition-all border ${
            msg.role === "user" 
              ? "bg-slate-900 text-white border-slate-900 rounded-tr-none" 
              : "bg-white text-slate-800 border-slate-100 rounded-tl-none"
          }`}
        >
          {msg.role === "model" && (
            <button
              onClick={() => onSave(msg, idx)}
              className="absolute -top-3 -right-3 bg-amber-400 hover:bg-amber-500 hover:scale-110 border-none rounded-full w-8 h-8 flex items-center justify-center cursor-pointer transition-all duration-200 opacity-0 group-hover:opacity-100 shadow-md text-sm z-10"
              title="存入錯題本"
            >
              ⭐
            </button>
          )}

          <div className="leading-relaxed break-words">
            {segs.length === 0 && msg.images?.length > 0 && (
              <em className="text-slate-400 text-xs">(上傳了圖片進行提問)</em>
            )}
            {segs.map((seg: Seg, i: number) =>
              seg.type === "tikz"
                ? <TikzImage key={`${seg.code.length}-${seg.code.slice(0, 45)}`} code={seg.code} />
                : <MarkdownBlock key={`md-${i}`} text={seg.text} />
            )}
          </div>

          {msg.images?.map((img: string, i: number) => (
            <img key={i} src={img} className="mt-3 max-h-80 rounded-2xl border border-slate-100 block object-contain shadow-sm" alt="uploaded" />
          ))}
        </div>
      </div>
    );
  },
  (prev: any, next: any) =>
    prev.msg.content === next.msg.content &&
    prev.msg.images === next.msg.images &&
    prev.idx === next.idx,
);
MessageBubble.displayName = "MessageBubble";

/* ════════════════════════════════════════
   ROOT
   ════════════════════════════════════════ */
export default function ThreadChatRoom() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-500 font-bold">進入教室中...</div>}>
      <ChatContent />
    </Suspense>
  );
}

/* ════════════════════════════════════════
   ChatContent
   ════════════════════════════════════════ */
function ChatContent() {
  const router       = useRouter();
  const params       = useParams();
  const searchParams = useSearchParams();
  const threadId     = params.id as string;

  const rawSubject  = searchParams.get("subject") || "physics";
  const subject     = (rawSubject in SUBJECT_MAP ? rawSubject : "physics") as keyof typeof SUBJECT_MAP;
  const subjectInfo = SUBJECT_MAP[subject];

  const [user,              setUser]              = useState<any>(null);
  const [messages,          setMessages]          = useState<any[]>([]);
  const [threads,           setThreads]           = useState<any[]>([]); // 側邊欄列表
  const [input,             setInput]             = useState("");
  const [isSending,         setIsSending]         = useState(false);
  const [imagesBase64,      setImagesBase64]      = useState<string[]>([]);
  const [knowledgeBaseText, setKnowledgeBaseText] = useState("");
  const [noteTitle,         setNoteTitle]         = useState("");
  const [noteContent,       setNoteContent]       = useState("");
  const [showNoteForm,      setShowNoteForm]      = useState(false);
  const [showQuizPanel,     setShowQuizPanel]     = useState(false);
  const [quizTopic,         setQuizTopic]         = useState("");
  const [quizCount,         setQuizCount]         = useState(3);
  const [quizzes,           setQuizzes]           = useState<any[]>([]);
  const [isGeneratingQuiz,  setIsGeneratingQuiz]  = useState(false);
  const [quizAnswers,       setQuizAnswers]       = useState<Record<number, number>>({});
  const [quizSubmitted,     setQuizSubmitted]     = useState(false);
  const [sidebarOpen,       setSidebarOpen]       = useState(false); // 手機板側邊欄
  const [showSymbols,       setShowSymbols]       = useState(false);
  const [socraticMode,        setSocraticMode]        = useState(false);
  const [showSummaryModal,    setShowSummaryModal]    = useState(false);
  const [summaryText,         setSummaryText]         = useState("");
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const [pomoMinutes, setPomoMinutes] = useState(25);
  const [pomoSeconds, setPomoSeconds] = useState(0);
  const [pomoActive, setPomoActive] = useState(false);
  const [pomoMode, setPomoMode] = useState<"study" | "break">("study");
  const [pomoStreak, setPomoStreak] = useState(0);
  const [pomoToday, setPomoToday] = useState(0);
  const [ambientSound, setAmbientSound] = useState<"none" | "lofi" | "rain" | "forest">("none");
  const [soundVolume, setSoundVolume] = useState(0.5);

  const audioRef = useRef<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // 滾動到底部
  useEffect(() => { 
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); 
  }, [messages]);

  const live = useRef({ user, messages, knowledgeBaseText, threadId, subject });
  useEffect(() => { 
    live.current = { user, messages, knowledgeBaseText, threadId, subject }; 
  });

  useEffect(() => {
    const todayStr = new Date().toDateString();
    const localToday = localStorage.getItem(`pomo_sessions_${todayStr}`);
    if (localToday) setPomoToday(parseInt(localToday));
    const localStreak = localStorage.getItem("pomo_streak");
    if (localStreak) setPomoStreak(parseInt(localStreak));
  }, []);

  useEffect(() => {
    let interval: any = null;
    if (pomoActive) {
      interval = setInterval(() => {
        if (pomoSeconds > 0) {
          setPomoSeconds(pomoSeconds - 1);
        } else if (pomoSeconds === 0) {
          if (pomoMinutes === 0) {
            playAlertSound();
            if (pomoMode === "study") {
              const newToday = pomoToday + 1;
              setPomoToday(newToday);
              const todayStr = new Date().toDateString();
              localStorage.setItem(`pomo_sessions_${todayStr}`, newToday.toString());
              
              const lastStudyDay = localStorage.getItem("pomo_last_study_day");
              const yesterday = new Date();
              yesterday.setDate(yesterday.getDate() - 1);
              if (lastStudyDay === yesterday.toDateString()) {
                const newStreak = pomoStreak + 1;
                setPomoStreak(newStreak);
                localStorage.setItem("pomo_streak", newStreak.toString());
              } else if (lastStudyDay !== new Date().toDateString()) {
                setPomoStreak(1);
                localStorage.setItem("pomo_streak", "1");
              }
              localStorage.setItem("pomo_last_study_day", new Date().toDateString());
              
              alert("🎉 太棒了！專注時間結束，休息 5 分鐘吧！");
              setPomoMode("break");
              setPomoMinutes(5);
            } else {
              alert("⏰ 休息時間結束！準備開始專注吧！");
              setPomoMode("study");
              setPomoMinutes(25);
            }
            setPomoActive(false);
          } else {
            setPomoMinutes(pomoMinutes - 1);
            setPomoSeconds(59);
          }
        }
      }, 1000);
    } else {
      clearInterval(interval);
    }
    return () => clearInterval(interval);
  }, [pomoActive, pomoMinutes, pomoSeconds, pomoMode, pomoToday, pomoStreak]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (ambientSound === "none") return;
    let url = "";
    if (ambientSound === "lofi") url = "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3";
    else if (ambientSound === "rain") url = "https://assets.mixkit.co/active_storage/sfx/2433/2433-500.wav";
    else if (ambientSound === "forest") url = "https://assets.mixkit.co/active_storage/sfx/1239/1239-500.wav";
    
    if (url) {
      const audio = new Audio(url);
      audio.loop = true;
      audio.volume = soundVolume;
      audio.play().catch((e) => console.log("Audio play blocked/failed:", e));
      audioRef.current = audio;
    }
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, [ambientSound]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = soundVolume;
    }
  }, [soundVolume]);

  const playAlertSound = () => {
    const alertAudio = new Audio("https://assets.mixkit.co/active_storage/sfx/911/911-500.wav");
    alertAudio.play().catch(() => {});
  };

  const togglePomo = () => setPomoActive(!pomoActive);
  const resetPomo = () => {
    setPomoActive(false);
    setPomoMode("study");
    setPomoMinutes(25);
    setPomoSeconds(0);
  };

  // 讀取對話/側邊欄/知識庫
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (cu: any) => {
      if (!cu) { router.push("/"); return; }
      setUser(cu);
      
      // 讀取當前對話
      try {
        const snap = await getDocs(query(
          collection(db, "chats"),
          where("threadId", "==", threadId),
          orderBy("timestamp", "asc"),
        ));
        setMessages(snap.docs.map((d: any) => d.data()));
      } catch (e: any) { 
        console.error("讀取聊天失敗：", e.message); 
      }

      // 讀取同學在此學科的所有 threads
      try {
        const q = query(
          collection(db, "threads"),
          where("uid", "==", cu.uid),
          where("subject", "==", subject),
          orderBy("timestamp", "desc")
        );
        const querySnapshot = await getDocs(q);
        const list: any[] = [];
        querySnapshot.forEach((doc: any) => list.push({ id: doc.id, ...doc.data() }));
        setThreads(list);
      } catch (e: any) { 
        console.error("讀取目錄失敗：", e.message); 
      }

      // 讀取知識庫
      try {
        const kbSn = await getDocs(query(
          collection(db, `users/${cu.uid}/knowledge_base`),
          where("subject", "==", subject),
        ));
        setKnowledgeBaseText(kbSn.docs.map((d: any) => `[${d.data().title}]\n${d.data().content}`).join("\n\n"));
      } catch (e) { 
        console.error("讀取個人資料庫失敗", e); 
      }
    });
    return () => unsub();
  }, [threadId, router, subject]);

  const handleSaveNote = async () => {
    const { user, subject } = live.current;
    if (!noteTitle.trim() || !noteContent.trim() || !user) return;
    try {
      await addDoc(collection(db, `users/${user.uid}/knowledge_base`), {
        subject, title: noteTitle.trim(), content: noteContent.trim(), timestamp: Date.now(),
      });
      alert("✅ 已加入你的個人 AI 資料庫！");
      setNoteTitle(""); setNoteContent(""); setShowNoteForm(false);
      const kbSn = await getDocs(query(collection(db, `users/${user.uid}/knowledge_base`), where("subject", "==", subject)));
      setKnowledgeBaseText(kbSn.docs.map((d: any) => `[${d.data().title}]\n${d.data().content}`).join("\n\n"));
    } catch (e: any) { 
      alert("儲存失敗：" + e.message); 
    }
  };

  const handleGenerateSummary = async () => {
    if (messages.length === 0) {
      alert("目前尚無對話內容可供生成講義！");
      return;
    }
    setIsGeneratingSummary(true);
    setShowSummaryModal(true);
    setSummaryText("");
    
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: "請生成此對話的精華講義大綱與重點整理。",
          subject,
          history: messages,
          threadId,
          userName: user?.displayName,
          isSummaryRequest: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "連線失敗");
      setSummaryText(data.text);
    } catch (err: any) {
      setSummaryText(`❌ 生成精華講義失敗，請重試。\n錯誤資訊：${err.message}`);
    } finally {
      setIsGeneratingSummary(false);
    }
  };

  const copySummary = () => {
    navigator.clipboard.writeText(summaryText).then(() => {
      alert("✅ 已複製講義 Markdown 內容到剪貼簿！");
    }).catch(() => {
      alert("❌ 複製失敗");
    });
  };

  const exportToMarkdown = () => {
    let md = `# ${subjectInfo.name} 學習筆記\n\n`;
    messages.forEach((msg, idx) => {
      const roleName = msg.role === "user" ? "同學" : "AI 老師";
      md += `### 💬 ${roleName} (${new Date(msg.timestamp).toLocaleTimeString()})\n\n${msg.content}\n\n`;
      if (msg.images && msg.images.length > 0) {
        md += `*包含圖片於原始對話中*\n\n`;
      }
      md += `---\n\n`;
    });
    
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${subjectInfo.name}-Study-Notes-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportToPDF = () => {
    window.print();
  };

  const handleGenerateQuiz = async () => {
    if (!quizTopic.trim()) { alert("請輸入測驗主題！"); return; }
    setIsGeneratingQuiz(true);
    setQuizzes([]);
    setQuizAnswers({});
    setQuizSubmitted(false);
    
    const prompt = `請針對高中「${subjectInfo.name}」科目中的「${quizTopic.trim()}」單元，設計 ${quizCount} 題高水準的單選題（包含解析與 LaTeX 公式）。
請【嚴格】僅回傳符合以下 JSON 格式的內容，切勿包含任何前言、後記、引號包裝或說明：
[
  {
    "question": "題目描述（涉及公式時使用 LaTeX，$ 符號包圍）",
    "options": ["選項 A", "選項 B", "選項 C", "選項 D"],
    "answer": 0, // 正確選項的索引 (0 到 3)
    "explanation": "詳細的解析與步驟說明（包含公式）"
  }
]`;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          subject,
          history: [],
          threadId: "quiz-generation",
          userName: user?.displayName,
          knowledge: ""
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "連線失敗");
      
      let cleanText = data.text.trim();
      if (cleanText.includes("```")) {
        cleanText = cleanText.replace(/```(?:json)?/g, "").trim();
      }
      
      const parsed = JSON.parse(cleanText);
      if (Array.isArray(parsed)) {
        setQuizzes(parsed);
      } else {
        throw new Error("回傳格式非 JSON 陣列");
      }
    } catch (err: any) {
      alert("生成失敗，請重試！\n錯誤資訊：" + err.message);
    } finally {
      setIsGeneratingQuiz(false);
    }
  };

  const handleSaveQuizToNotebook = async (quiz: any) => {
    if (!user) return;
    try {
      const data = {
        uid: user.uid,
        userName: user.displayName,
        subject,
        question: `【AI 模擬測驗】\n主題：${quizTopic}\n問題：${quiz.question}\n選項：\n${quiz.options.map((o: string, idx: number) => `${String.fromCharCode(65 + idx)}. ${o}`).join("\n")}`,
        answer: `正確答案：${String.fromCharCode(65 + quiz.answer)}\n\n【詳細解析】\n${quiz.explanation}`,
        images: [],
        timestamp: Date.now(),
        isPublic: true,
        threadId: threadId || "quiz-thread"
      };
      await addDoc(collection(db, `users/${user.uid}/wrong_questions`), data);
      await addDoc(collection(db, "community_vault"), data);
      alert("✅ 已將本題與詳解存入錯題本！");
    } catch {
      alert("❌ 儲存失敗");
    }
  };

  // 🌟 修復 1：回溯尋找正確的 User 發問內容，並與錯題一同存入
  const saveToNotebook = useCallback(async (msg: any, index: number) => {
    const { user, messages, subject, threadId } = live.current;
    if (!user) return;

    let userPrompt = "追問內容";
    let userImages: string[] = [];

    // 往回找最近的一筆 role === "user"
    for (let i = index - 1; i >= 0; i--) {
      if (messages[i]?.role === "user") {
        userPrompt = messages[i].content || "";
        userImages = messages[i].images || [];
        break;
      }
    }

    try {
      const data = {
        uid: user.uid, userName: user.displayName, subject,
        question: userPrompt,
        answer: msg.content, images: userImages,
        timestamp: Date.now(), isPublic: true, threadId,
      };
      await addDoc(collection(db, `users/${user.uid}/wrong_questions`), data);
      await addDoc(collection(db, "community_vault"), data);
      alert("✅ 已加入錯題本");
    } catch { 
      alert("❌ 儲存失敗"); 
    }
  }, []);

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []) as File[];
    const results = await Promise.all(files.map((file) =>
      new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = (ev) => {
          const img = new Image();
          img.onload = () => {
            const MAX = 1024;
            let w = img.width, h = img.height;
            if (w > h) { if (w > MAX) { h = h * MAX / w; w = MAX; } }
            else { if (h > MAX) { w = w * MAX / h; h = MAX; } }
            const canvas = document.createElement("canvas");
            canvas.width = w; canvas.height = h;
            canvas.getContext("2d")?.drawImage(img, 0, 0, w, h);
            resolve(canvas.toDataURL("image/jpeg", 0.7));
          };
          img.src = ev.target?.result as string;
        };
        reader.readAsDataURL(file);
      })
    ));
    setImagesBase64(results);
  };

  const handlePaste = async (e: React.ClipboardEvent<HTMLInputElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf("image") !== -1) {
        const file = items[i].getAsFile();
        if (!file) continue;
        const reader = new FileReader();
        reader.onload = (ev) => {
          const img = new Image();
          img.onload = () => {
            const MAX = 1024;
            let w = img.width, h = img.height;
            if (w > h) { if (w > MAX) { h = h * MAX / w; w = MAX; } }
            else { if (h > MAX) { w = w * MAX / h; h = MAX; } }
            const canvas = document.createElement("canvas");
            canvas.width = w; canvas.height = h;
            canvas.getContext("2d")?.drawImage(img, 0, 0, w, h);
            const base64 = canvas.toDataURL("image/jpeg", 0.7);
            setImagesBase64((prev) => [...prev, base64]);
          };
          img.src = ev.target?.result as string;
        };
        reader.readAsDataURL(file);
        e.preventDefault();
      }
    }
  };

  const insertFormula = (latex: string) => {
    if (!inputRef.current) return;
    const start = inputRef.current.selectionStart ?? 0;
    const end = inputRef.current.selectionEnd ?? 0;
    const currentVal = inputRef.current.value;
    const newVal = currentVal.substring(0, start) + latex + currentVal.substring(end);
    setInput(newVal);
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.setSelectionRange(start + latex.length, start + latex.length);
      }
    }, 50);
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const { user, messages, knowledgeBaseText, threadId, subject } = live.current;
    if (!input.trim() && imagesBase64.length === 0) return;
    if (isSending) return;

    const userPrompt = input;
    const currentImages = [...imagesBase64];
    const userMsg = {
      uid: user.uid, userName: user.displayName || "匿名同學",
      subject, role: "user", content: userPrompt,
      images: currentImages, timestamp: Date.now(), threadId,
    };
    setMessages((prev: any[]) => [...prev, userMsg]);
    setInput(""); setImagesBase64([]); setIsSending(true);

    if (socraticMode) {
      try {
        const count = parseInt(localStorage.getItem("pomo_socrates_count") || "0") + 1;
        localStorage.setItem("pomo_socrates_count", count.toString());
      } catch (err) {
        console.error("Failed to update Socrates count:", err);
      }
    }

    try {
      await addDoc(collection(db, "chats"), userMsg);
      const res = await fetch("/api/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: userPrompt,
          imagesBase64: currentImages,
          subject,
          history: messages,
          threadId,
          userName: user?.displayName,
          knowledge: knowledgeBaseText,
          socraticMode,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        const aiMsg = { uid: user.uid, role: "model", content: data.text, timestamp: Date.now(), threadId };
        setMessages((prev: any[]) => [...prev, aiMsg]);
        await addDoc(collection(db, "chats"), aiMsg);
      } else {
        setMessages((prev: any[]) => [...prev, { role: "model", content: `❌ 錯誤：${data.error || "連線失敗"}`, timestamp: Date.now() }]);
      }
    } catch (err: any) {
      setMessages((prev: any[]) => [...prev, { role: "model", content: `❌ 錯誤：${err.message}`, timestamp: Date.now() }]);
    } finally { setIsSending(false); }
  };

  const handleOpenNewThread = async () => {
    if (!user) return;
    try {
      const threadRef = await addDoc(collection(db, "threads"), {
        uid: user.uid,
        userName: user.displayName || "匿名同學",
        subject: subject,
        title: `新問題... ${new Date().toLocaleDateString()}`,
        timestamp: Date.now()
      });
      setSidebarOpen(false);
      router.push(`/chat/${threadRef.id}?subject=${subject}`);
    } catch (err) { 
      alert("無法建立新對話"); 
    }
  };

  const handleDeleteThread = async (e: React.MouseEvent, targetId: string) => {
    e.stopPropagation();
    if (!confirm("確定要刪除此題目嗎？這會清空本題的所有追問對話。")) return;
    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, "threads", targetId));
      const chatsQ = query(collection(db, "chats"), where("threadId", "==", targetId));
      const snapshot = await getDocs(chatsQ);
      snapshot.docs.forEach((d: any) => batch.delete(doc(db, "chats", d.id)));
      await batch.commit();
      
      setThreads((prev: any[]) => prev.filter((t: any) => t.id !== targetId));
      if (targetId === threadId) {
        router.push(`/chat?subject=${subject}`);
      }
    } catch (err) { 
      alert("刪除失敗"); 
    }
  };

  const handleRenameThread = async (e: React.MouseEvent, targetId: string, oldTitle: string) => {
    e.stopPropagation();
    const newTitle = prompt("請輸入新名稱：", oldTitle);
    if (!newTitle || newTitle.trim() === "" || newTitle === oldTitle) return;
    try {
      await updateDoc(doc(db, "threads", targetId), { title: newTitle.trim() });
      setThreads((prev: any[]) => prev.map((t: any) => t.id === targetId ? { ...t, title: newTitle.trim() } : t));
    } catch (err) { 
      alert("改名失敗"); 
    }
  };

  const colors: Record<string, string> = { 
    "bg-red-600": "#dc2626", 
    "bg-blue-600": "#2563eb", 
    "bg-green-600": "#16a34a", 
    "bg-purple-600": "#9333ea", 
    "bg-amber-600": "#d97706",
    "bg-rose-600": "#e11d48",
    "bg-indigo-600": "#4f46e5"
  };
  const headerColor = colors[subjectInfo.color] ?? "#2563eb";

  return (
    <div className="flex h-screen overflow-hidden bg-slate-100 font-sans text-slate-800">
      
      {/* CSS 補丁，防止 KaTeX 被 Tailwind 壓縮與 Markdown 間距優化 */}
      <style>{`
        .markdown-content .katex svg {
          display: inline !important;
        }
        .markdown-content .katex-display {
          overflow-x: auto !important;
          margin: 1em 0 !important;
        }
        .save-btn { opacity: 0 !important; }
        .save-btn:hover, *:hover > .save-btn { opacity: 1 !important; }

        @media print {
          body {
            background: white !important;
            color: black !important;
          }
          aside, header, footer, select, input, button, label, .white-noise-panel, .pomo-panel, .no-print, style {
            display: none !important;
          }
          main {
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: visible !important;
            height: auto !important;
            background: white !important;
          }
          .flex-1 {
            overflow: visible !important;
            height: auto !important;
          }
        }
      `}</style>

      {/* 🌟 側邊欄 (雙版面設計) */}
      <aside 
        className={`w-72 bg-white border-r border-slate-200/80 flex flex-col h-full z-30 transition-all duration-300 md:static fixed top-0 bottom-0 left-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
      >
        {/* 側邊欄頂部 */}
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button 
              onClick={() => router.push("/")}
              className="hover:bg-slate-100 p-2 rounded-xl text-sm transition-all cursor-pointer flex items-center justify-center border border-slate-100"
              title="回到大廳"
            >
              🏠
            </button>
            <span className="font-extrabold text-sm text-slate-700">{subjectInfo.name}</span>
          </div>
          <button 
            onClick={() => setSidebarOpen(false)}
            className="md:hidden p-2 hover:bg-slate-100 rounded-xl cursor-pointer"
          >
            ✖
          </button>
        </div>

        {/* 新建發問 */}
        <div className="p-4 border-b border-slate-50">
          <button 
            onClick={handleOpenNewThread}
            className="w-full py-2.5 bg-slate-900 hover:bg-indigo-600 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1 transition-all shadow-sm cursor-pointer active:scale-95"
          >
            ➕ 開始新提問
          </button>
        </div>

        {/* 提問歷史列表 */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1 bg-slate-50/50">
          <p className="text-[10px] uppercase tracking-wider text-slate-400 font-extrabold px-3 py-1">歷史提問</p>
          {threads.map((t: any) => (
            <div 
              key={t.id}
              onClick={() => {
                setSidebarOpen(false);
                router.push(`/chat/${t.id}?subject=${subject}`);
              }}
              className={`p-3 rounded-xl cursor-pointer group flex justify-between items-center transition-all border ${
                t.id === threadId 
                  ? "bg-white border-slate-200 text-indigo-600 shadow-sm font-bold" 
                  : "hover:bg-white/60 border-transparent hover:border-slate-100 text-slate-600"
              }`}
            >
              <span className="text-xs truncate flex-1">{t.title}</span>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button 
                  onClick={(e: React.MouseEvent<HTMLButtonElement>) => handleRenameThread(e, t.id, t.title)}
                  className="p-1 text-[10px] hover:bg-slate-100 text-slate-400 hover:text-indigo-600 rounded cursor-pointer"
                  title="改名"
                >
                  ✏️
                </button>
                <button 
                  onClick={(e: React.MouseEvent<HTMLButtonElement>) => handleDeleteThread(e, t.id)}
                  className="p-1 text-[10px] hover:bg-slate-100 text-slate-400 hover:text-rose-600 rounded cursor-pointer"
                  title="刪除"
                >
                  🗑️
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* ⏱️ 番茄專注與白噪音 */}
        <div className="p-4 border-t border-slate-100 bg-indigo-50/20 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold text-slate-600 flex items-center gap-1.5">
              <span>⏱️</span> 專注番茄鐘
            </span>
            <div className="flex gap-1.5 items-center">
              <span className="text-[10px] font-bold text-orange-600" title="連續專注天數">🔥 {pomoStreak} 天</span>
              <span className="text-[10px] font-bold text-indigo-600" title="今日專注次數">🎯 {pomoToday} 回</span>
            </div>
          </div>

          <div className="flex items-center justify-between bg-white px-3 py-2 rounded-2xl border border-indigo-100/50 shadow-sm">
            <div className="flex flex-col">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{pomoMode === "study" ? "專注中" : "休息中"}</span>
              <span className="text-base font-extrabold font-mono text-slate-800">
                {String(pomoMinutes).padStart(2, "0")}:{String(pomoSeconds).padStart(2, "0")}
              </span>
            </div>
            <div className="flex gap-1">
              <button 
                type="button"
                onClick={togglePomo}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold text-white cursor-pointer transition-all active:scale-95 border-none ${pomoActive ? "bg-amber-500 hover:bg-amber-600" : "bg-indigo-600 hover:bg-indigo-700"}`}
              >
                {pomoActive ? "暫停" : "開始"}
              </button>
              <button 
                type="button"
                onClick={resetPomo}
                className="px-2 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold cursor-pointer active:scale-95 border border-slate-200/50"
              >
                重設
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[9px] font-bold text-slate-400">學習白噪音</label>
            <div className="flex items-center gap-2">
              <select 
                value={ambientSound}
                onChange={(e: any) => setAmbientSound(e.target.value)}
                className="flex-1 bg-white border border-slate-200 rounded-xl px-2 py-1 text-xs outline-none focus:border-indigo-500"
              >
                <option value="none">🔇 無</option>
                <option value="lofi">🎵 專注 Lo-fi 音樂</option>
                <option value="rain">🌧️ 窗外雨聲</option>
                <option value="forest">🌲 森林鳥鳴</option>
              </select>
              {ambientSound !== "none" && (
                <input 
                  type="range" 
                  min="0" 
                  max="1" 
                  step="0.1" 
                  value={soundVolume}
                  onChange={(e) => setSoundVolume(parseFloat(e.target.value))}
                  className="w-12 h-1 accent-indigo-600 cursor-pointer"
                  title="音量調整"
                />
              )}
            </div>
          </div>
        </div>

        {/* 側邊欄底部 */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
            <span className="text-[10px] font-bold text-slate-500">{user?.displayName} 同學</span>
          </div>
          <button 
            onClick={() => router.push("/notebook")}
            className="text-[10px] font-bold text-indigo-600 hover:underline cursor-pointer"
          >
            📚 進入錯題本
          </button>
        </div>
      </aside>

      {/* 側邊欄手機板遮罩 */}
      {sidebarOpen && (
        <div 
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 bg-slate-900/20 z-20 md:hidden backdrop-blur-[1px] transition-all"
        />
      )}

      {/* 🌟 右側對話工作區 */}
      <main className="flex-1 flex flex-col h-full relative overflow-hidden bg-slate-50">
        {/* Header */}
        <header className="px-4 py-3 bg-white border-b border-slate-200/80 flex items-center justify-between shadow-sm z-10">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setSidebarOpen((v: boolean) => !v)}
              className="md:hidden p-2 hover:bg-slate-100 border border-slate-200 rounded-xl cursor-pointer flex items-center justify-center text-sm"
            >
              ☰
            </button>
            <h1 className="text-sm sm:text-base font-extrabold flex items-center gap-1.5">
              <span style={{ color: headerColor }}>●</span>
              <span>{subjectInfo.name} 教室</span>
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] sm:text-xs text-slate-400 hidden sm:block">💡 個人知識庫已就緒</span>
            <button 
              type="button"
              onClick={exportToMarkdown}
              className="px-2.5 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold cursor-pointer transition-all active:scale-95 flex items-center gap-1 no-print"
              title="匯出 Markdown"
            >
              📥 匯出
            </button>
            <button 
              type="button"
              onClick={handleGenerateSummary}
              className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-bold cursor-pointer transition-all active:scale-95 flex items-center gap-1 no-print"
              title="生成精華講義"
            >
              📝 講義
            </button>
            <button 
              type="button"
              onClick={exportToPDF}
              className="px-2.5 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold cursor-pointer transition-all active:scale-95 flex items-center gap-1 no-print"
              title="列印 PDF"
            >
              🖨️ PDF
            </button>
            <button 
              type="button"
              onClick={() => setShowQuizPanel((v: boolean) => !v)}
              className="px-3 py-1.5 bg-orange-50 hover:bg-orange-100 text-orange-700 font-bold rounded-xl text-xs cursor-pointer transition-all border border-orange-100/50 no-print"
            >
              {showQuizPanel ? "✖ 關閉測驗" : "📝 AI 模擬考"}
            </button>
            <button 
              onClick={() => setShowNoteForm((v: boolean) => !v)}
              className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-xl text-xs cursor-pointer transition-all border border-indigo-100/50"
            >
              {showNoteForm ? "✖ 關閉" : "📝 加入口訣筆記"}
            </button>
          </div>
        </header>

        {/* 模擬測驗面板 */}
        {showQuizPanel && (
          <div className="bg-white border-b border-slate-200 p-4 animate-fade-in shadow-inner z-10">
            <div className="max-w-3xl mx-auto p-5 bg-indigo-50/50 rounded-2xl border border-indigo-100/50 flex flex-col gap-4">
              <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
                <h4 className="text-xs font-black text-indigo-800">📝 AI 模擬考與即時測驗系統</h4>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="輸入主題 (例如：萬有引力、氧化還原)"
                    value={quizTopic}
                    onChange={(e) => setQuizTopic(e.target.value)}
                    className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs outline-none focus:border-indigo-500"
                  />
                  <select
                    value={quizCount}
                    onChange={(e) => setQuizCount(parseInt(e.target.value))}
                    className="bg-white border border-slate-200 rounded-xl px-2 py-1 text-xs outline-none focus:border-indigo-500"
                  >
                    <option value={3}>3 題</option>
                    <option value={5}>5 題</option>
                  </select>
                  <button
                    onClick={handleGenerateQuiz}
                    disabled={isGeneratingQuiz}
                    className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50 cursor-pointer active:scale-95 shadow-sm"
                  >
                    {isGeneratingQuiz ? "AI 出題中..." : "開始測驗"}
                  </button>
                </div>
              </div>

              {/* 測驗題目清單 */}
              {quizzes.length > 0 && (
                <div className="space-y-4 max-h-96 overflow-y-auto pr-1">
                  {quizzes.map((q, qIdx) => (
                    <div key={qIdx} className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm flex flex-col gap-3">
                      <div className="font-extrabold text-xs text-slate-700 flex gap-2">
                        <span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-md text-[10px] self-start">Q{qIdx + 1}</span>
                        <div className="markdown-content inline-block">
                          <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                            {q.question}
                          </ReactMarkdown>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {q.options.map((opt: string, oIdx: number) => {
                          const isSelected = quizAnswers[qIdx] === oIdx;
                          const isCorrect = q.answer === oIdx;
                          let btnStyle = "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100";
                          if (quizSubmitted) {
                            if (isCorrect) btnStyle = "bg-emerald-100 border-emerald-500 text-emerald-800 font-bold";
                            else if (isSelected) btnStyle = "bg-rose-100 border-rose-500 text-rose-800 font-bold";
                          } else if (isSelected) {
                            btnStyle = "bg-indigo-600 border-indigo-600 text-white font-bold";
                          }
                          return (
                            <button
                              key={oIdx}
                              type="button"
                              disabled={quizSubmitted}
                              onClick={() => setQuizAnswers(prev => ({ ...prev, [qIdx]: oIdx }))}
                              className={`w-full text-left p-2.5 rounded-xl border text-xs transition-all active:scale-95 cursor-pointer flex items-center gap-2 ${btnStyle}`}
                            >
                              <span className="font-extrabold text-[10px] w-5 h-5 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-600 shadow-sm">
                                {String.fromCharCode(65 + oIdx)}
                              </span>
                              <span>{opt}</span>
                            </button>
                          );
                        })}
                      </div>

                      {/* 題目詳解 */}
                      {quizSubmitted && (
                        <div className="mt-2 p-3.5 bg-slate-50 rounded-xl border border-slate-100 animate-fade-in">
                          <div className="flex justify-between items-start mb-2">
                            <span className="text-[10px] font-black text-indigo-600 tracking-wider">💡 老師詳細解析：</span>
                            <button
                              type="button"
                              onClick={() => handleSaveQuizToNotebook(q)}
                              className="text-[10px] font-black text-indigo-600 hover:text-indigo-800 bg-transparent border-none cursor-pointer flex items-center gap-1"
                              title="加入錯題本"
                            >
                              ⭐ 存入錯題本
                            </button>
                          </div>
                          <div className="text-xs text-slate-600 leading-relaxed markdown-content">
                            <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                              {q.explanation}
                            </ReactMarkdown>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}

                  {/* 提交按鈕 */}
                  {!quizSubmitted && (
                    <div className="flex justify-end pt-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (Object.keys(quizAnswers).length < quizzes.length) {
                            alert("您還有題目尚未作答喔！");
                            return;
                          }
                          setQuizSubmitted(true);
                          try {
                            const count = parseInt(localStorage.getItem("quiz_completed_count") || "0") + 1;
                            localStorage.setItem("quiz_completed_count", count.toString());
                          } catch (err) {
                            console.error("Failed to increment quiz count:", err);
                          }
                        }}
                        className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-md active:scale-95 cursor-pointer"
                      >
                        送出答案
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* 出題讀取骨架 */}
              {isGeneratingQuiz && (
                <div className="space-y-4">
                  {[1, 2].map((i) => (
                    <div key={i} className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm animate-pulse flex flex-col gap-3">
                      <div className="h-4 bg-slate-100 rounded w-2/3"></div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div className="h-8 bg-slate-50 rounded"></div>
                        <div className="h-8 bg-slate-50 rounded"></div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* 筆記投放面板 */}
        {showNoteForm && (
          <div className="bg-white border-b border-slate-200 p-4 animate-fade-in shadow-inner z-10">
            <div className="max-w-3xl mx-auto p-4 bg-indigo-50/50 rounded-2xl border border-indigo-100 flex flex-col gap-3">
              <h4 className="text-xs font-extrabold text-indigo-800">✍️ 存入口訣或特定觀念，AI 將優先採用回答此科目：</h4>
              <input 
                type="text" 
                placeholder="筆記標題 (例如：平移定理口訣)" 
                value={noteTitle} 
                onChange={(e) => setNoteTitle(e.target.value)} 
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs outline-none focus:border-indigo-500 transition-colors"
              />
              <textarea 
                placeholder="內容 (例如：向左平移加，向右平移減。)" 
                value={noteContent} 
                onChange={(e) => setNoteContent(e.target.value)} 
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs h-20 outline-none focus:border-indigo-500 resize-none transition-colors"
              />
              <div className="flex justify-end gap-2">
                <button onClick={() => setShowNoteForm(false)} className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-[10px] font-bold cursor-pointer">取消</button>
                <button onClick={handleSaveNote} className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[10px] font-bold cursor-pointer transition-colors shadow-sm">存入 AI 大腦</button>
              </div>
            </div>
          </div>
        )}

        {/* 訊息泡泡對話區 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 py-12">
              <span className="text-5xl mb-3">💬</span>
              <h3 className="font-extrabold text-sm text-slate-600">這是新建立的提問空間</h3>
              <p className="text-xs text-slate-400 mt-1 max-w-xs text-center leading-relaxed">請在下方輸入您不懂的物理公式、數學題目，或者直接上傳手寫講義拍照，AI 老師會為您作答。</p>
            </div>
          ) : (
            messages.map((msg: any, idx: number) => (
              <MessageBubble
                key={`${msg.threadId ?? "local"}-${msg.timestamp}-${idx}`}
                msg={msg}
                idx={idx}
                onSave={saveToNotebook}
              />
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* 底部發送區 */}
        <footer className="p-4 bg-white border-t border-slate-200">
          <form onSubmit={handleSend} className="max-w-4xl mx-auto flex flex-col gap-3">
            
            {/* 圖片預覽區 */}
            {imagesBase64.length > 0 && (
              <div className="flex gap-2 p-2 bg-slate-50 border border-slate-100 rounded-2xl w-fit">
                {imagesBase64.map((img: string, i: number) => (
                  <div key={i} className="relative group">
                    <img src={img} className="w-16 h-16 object-cover rounded-xl border border-slate-200" alt="preview" />
                    <button 
                      type="button"
                      onClick={() => setImagesBase64((prev: string[]) => prev.filter((_, idx) => idx !== i))}
                      className="absolute -top-1.5 -right-1.5 bg-slate-900/80 hover:bg-slate-900 text-white w-4 h-4 rounded-full flex items-center justify-center text-[8px] cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* 📐 LaTeX 數學公式輸入助手 */}
            <div className="flex flex-col gap-1 border border-slate-100 rounded-2xl p-2.5 bg-slate-50/50">
              <div className="flex items-center justify-between">
                <button 
                  type="button"
                  onClick={() => setShowSymbols(!showSymbols)}
                  className="text-xs text-indigo-600 hover:text-indigo-800 font-extrabold flex items-center gap-1.5 cursor-pointer border-none bg-transparent outline-none"
                >
                  <span>{showSymbols ? "▼" : "▶"} 📐 數學公式與繪圖輸入助手</span>
                </button>
                
                <label className="flex items-center gap-2 cursor-pointer select-none text-xs font-bold text-slate-600 hover:text-slate-900 transition-colors">
                  <input
                    type="checkbox"
                    checked={socraticMode}
                    onChange={(e) => setSocraticMode(e.target.checked)}
                    className="w-4 h-4 rounded text-indigo-600 border-slate-300 focus:ring-indigo-500 cursor-pointer"
                  />
                  <span>🔍 啟發引導模式 (Socratic)</span>
                </label>
              </div>
              
              {showSymbols && (
                <div className="flex flex-col gap-2.5 pt-2.5 border-t border-slate-200/50 animate-fade-in">
                  <div className="flex flex-wrap gap-1.5 items-center">
                    <span className="text-[10px] font-black text-slate-400 mr-1.5">常用符號:</span>
                    {["θ", "α", "β", "Δ", "π", "∞", "≈", "≠", "≤", "≥", "±"].map((sym) => (
                      <button
                        key={sym}
                        type="button"
                        onClick={() => insertFormula(sym)}
                        className="px-2 py-1 bg-white hover:bg-indigo-50 border border-slate-200/60 rounded-lg text-xs font-bold text-slate-700 cursor-pointer hover:border-indigo-200 transition-all active:scale-95"
                      >
                        {sym}
                      </button>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-1.5 items-center">
                    <span className="text-[10px] font-black text-slate-400 mr-1.5">公式結構:</span>
                    {[
                      { label: "分式", latex: "\\frac{a}{b} " },
                      { label: "根號", latex: "\\sqrt{x} " },
                      { label: "次方", latex: "x^{n} " },
                      { label: "下標", latex: "x_{i} " },
                      { label: "積分", latex: "\\int_{a}^{b} f(x) dx " },
                      { label: "加總", latex: "\\sum_{i=1}^{n} " },
                      { label: "向量", latex: "\\vec{v} " },
                      { label: "極限", latex: "\\lim_{x \\to 0} " }
                    ].map((f) => (
                      <button
                        key={f.label}
                        type="button"
                        onClick={() => insertFormula(f.latex)}
                        className="px-2.5 py-1 bg-white hover:bg-indigo-50 border border-slate-200/60 rounded-lg text-[10px] font-extrabold text-slate-700 cursor-pointer hover:border-indigo-200 transition-all active:scale-95"
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-1.5 items-center">
                    <span className="text-[10px] font-black text-slate-400 mr-1.5">繪圖模板:</span>
                    {[
                      { label: "直線", latex: "\\draw (0,0) -- (2,0);" },
                      { label: "圓形", latex: "\\draw (0,0) circle (1);" },
                      { label: "網格", latex: "\\draw[step=1,gray,very thin] (-2,-2) grid (2,2);" }
                    ].map((t) => (
                      <button
                        key={t.label}
                        type="button"
                        onClick={() => insertFormula(t.latex)}
                        className="px-2 py-1 bg-white hover:bg-indigo-50 border border-slate-200/60 rounded-lg text-[10px] font-bold text-slate-600 cursor-pointer hover:border-indigo-200 transition-all active:scale-95"
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-3">
              <label className="cursor-pointer bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-800 w-11 h-11 rounded-2xl flex items-center justify-center text-lg shadow-sm border border-slate-200/50 transition-all cursor-pointer">
                📷
                <input type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
              </label>
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onPaste={handlePaste}
                className="flex-1 bg-slate-50 hover:bg-slate-100/60 focus:bg-white border border-slate-200 rounded-2xl px-5 py-3 text-sm outline-none focus:border-indigo-500 shadow-inner transition-all"
                placeholder={`請輸入您想請教的 ${subjectInfo.name} 問題...`}
              />
              <button
                type="submit"
                disabled={isSending}
                style={{ background: isSending ? "#cbd5e1" : headerColor }}
                className="px-6 py-3 rounded-2xl text-white font-bold text-sm shadow-md transition-all active:scale-95 cursor-pointer disabled:cursor-not-allowed"
              >
                {isSending ? "回答中..." : "發送"}
              </button>
            </div>
          </form>
        </footer>
      </main>

      {/* 🌟 課程精華講義 Summary Modal */}
      {showSummaryModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in no-print">
          <div className="bg-white rounded-3xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden border border-slate-100">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-gradient-to-r from-emerald-500 to-teal-600 text-white flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="text-xl">📝</span>
                <div>
                  <h3 className="font-extrabold text-sm sm:text-base">AI 課程精華講義整理</h3>
                  <p className="text-[10px] text-emerald-100/80">根據此討論室的對話內容自動生成重點筆記</p>
                </div>
              </div>
              <button 
                onClick={() => setShowSummaryModal(false)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white border-none cursor-pointer transition-all"
              >
                ✕
              </button>
            </div>
            
            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
              {isGeneratingSummary ? (
                <div className="py-24 flex flex-col items-center justify-center gap-4 text-slate-500">
                  <div className="w-12 h-12 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin"></div>
                  <p className="text-xs font-bold animate-pulse">AI 老師正在精編課程重點，請稍候...</p>
                </div>
              ) : (
                <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm leading-relaxed max-w-none text-slate-800 markdown-content">
                  <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                    {summaryText}
                  </ReactMarkdown>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-white border-t border-slate-100 flex justify-end gap-2.5">
              <button 
                onClick={() => setShowSummaryModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs cursor-pointer transition-all"
              >
                關閉
              </button>
              {!isGeneratingSummary && (
                <>
                  <button 
                    onClick={copySummary}
                    className="px-4 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-100/50 font-bold rounded-xl text-xs cursor-pointer transition-all flex items-center gap-1"
                  >
                    📋 複製 Markdown
                  </button>
                  <button 
                    onClick={handleGenerateSummary}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs cursor-pointer transition-all"
                  >
                    🔄 重新整理
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
