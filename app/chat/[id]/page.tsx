"use client";

import React, {
  useState, useEffect, useRef, Suspense, useMemo, useCallback,
} from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { auth, db } from "../../../lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection, addDoc, query, where, orderBy, getDocs,
} from "firebase/firestore";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

/* ════════════════════════════════════════
   SUBJECT MAP
════════════════════════════════════════ */
const SUBJECT_MAP = {
  math:      { name: "📐 高中數學", color: "bg-red-600" },
  physics:   { name: "🍎 高中物理", color: "bg-blue-600" },
  chemistry: { name: "🧪 高中化學", color: "bg-green-600" },
  biology:   { name: "🧬 高中生物", color: "bg-purple-600" },
  earth:     { name: "🌍 高中地科", color: "bg-amber-600" },
} as const;

/* ════════════════════════════════════════
   MODULE-LEVEL TIKZ CACHE
════════════════════════════════════════ */
const SVG_CACHE: Record<string, string>  = {};
const ERR_CACHE: Record<string, string>  = {};
const PENDING:   Record<string, Promise<void>> = {};

function buildLatex(code: string): string {
  let tikzBody = code.trim();
  const bodyMatch = tikzBody.match(/\\begin\{tikzpicture\}[\s\S]*?\\end\{tikzpicture\}/);
  if (bodyMatch) tikzBody = bodyMatch[0];
  tikzBody = tikzBody.replace(/[\u4e00-\u9fa5]/g, "");
  const libMatch = code.match(/\\usetikzlibrary\{[^}]*\}/g);
  const extraLibs = libMatch ? libMatch.join("\n") : "";
  return [
    "\\documentclass[tikz,border=2mm]{standalone}",
    "\\usepackage{amsmath,amssymb}",
    "\\usepackage{pgfplots}",
    "\\pgfplotsset{compat=1.18}",
    extraLibs,
    "\\begin{document}",
    tikzBody,
    "\\end{document}",
  ].join("\n");
}

function fetchTikz(key: string): Promise<void> {
  if (SVG_CACHE[key] || ERR_CACHE[key]) return Promise.resolve();
  if (PENDING[key]) return PENDING[key];
  PENDING[key] = fetch("https://kroki.io/tikz/svg", {
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
  return PENDING[key];
}

/* ════════════════════════════════════════
   TikzImage — 加上 React.memo 徹底防止輸入文字時重繪
════════════════════════════════════════ */
const TikzImage = React.memo(({ code }: { code: string }) => {
  const key = code.trim();

  const [svg, setSvg] = useState<string>(() => SVG_CACHE[key] ?? "");
  const [err, setErr] = useState<string>(() => ERR_CACHE[key] ?? "");

  useEffect(() => {
    if (SVG_CACHE[key]) { setSvg(SVG_CACHE[key]); return; }
    if (ERR_CACHE[key]) { setErr(ERR_CACHE[key]); return; }
    
    fetchTikz(key).then(() => {
      if (SVG_CACHE[key]) setSvg(SVG_CACHE[key]);
      else if (ERR_CACHE[key]) setErr(ERR_CACHE[key]);
    });
  }, [key]);

  if (err) return (
    <div style={{ margin: "1rem 0", padding: "1rem", background: "#fff0f0", border: "1px solid #fca5a5", borderRadius: 12, fontSize: 13, color: "#dc2626" }}>
      <strong>⚠️ 畫圖失敗</strong>
      <details style={{ marginTop: 8 }}>
        <summary style={{ cursor: "pointer", fontWeight: "bold" }}>點我展開錯誤細節</summary>
        <pre style={{ marginTop: 8, fontSize: 11, background: "white", padding: 8, borderRadius: 6, overflowX: "auto", whiteSpace: "pre-wrap", border: "1px solid #fca5a5" }}>{err}</pre>
      </details>
    </div>
  );

  if (!svg) return (
    <div style={{ margin: "1rem 0", padding: "1.5rem", background: "#f3f4f6", borderRadius: 12, textAlign: "center", color: "#9ca3af", animation: "pulse 2s infinite" }}>
      🎨 老師正在精確繪圖中...
    </div>
  );

  return (
    <div
      style={{ margin: "1rem 0", display: "flex", justifyContent: "center", background: "white", padding: "1rem", borderRadius: 12, border: "1px solid #e5e7eb", overflowX: "auto" }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}, (prev, next) => prev.code.trim() === next.code.trim());

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
  <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
    {text}
  </ReactMarkdown>
));
MarkdownBlock.displayName = "MarkdownBlock";

/* ════════════════════════════════════════
   MessageBubble
════════════════════════════════════════ */
const MessageBubble = React.memo(
  ({ msg, idx, onSave }: { msg: any; idx: number; onSave: (msg: any, idx: number) => void }) => {
    const segs = useMemo(() => parseSegs(msg.content ?? ""), [msg.content]);

    return (
      <div style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
        <div style={{
          maxWidth: "48rem", borderRadius: 24, padding: "1rem",
          position: "relative",
          boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
          background: msg.role === "user" ? "#2563eb" : "white",
          color: msg.role === "user" ? "white" : "#1f2937",
          border: msg.role === "user" ? "none" : "1px solid #e5e7eb",
          borderTopLeftRadius: msg.role === "user" ? 24 : 4,
          borderTopRightRadius: msg.role === "user" ? 4 : 24,
        }}>
          {msg.role === "model" && (
            <button
              onClick={() => onSave(msg, idx)}
              style={{ position: "absolute", top: -12, right: -12, background: "#facc15", border: "none", borderRadius: "50%", width: 32, height: 32, cursor: "pointer", opacity: 0, transition: "opacity 0.2s", fontSize: 14 }}
              className="save-btn"
            >⭐</button>
          )}

          <div className="markdown-content" style={{ lineHeight: 1.8, wordBreak: "break-word" }}>
            {segs.length === 0 && msg.images?.length > 0 && <em>(上傳了圖片)</em>}
            {segs.map((seg, i) =>
              seg.type === "tikz"
                ? <TikzImage key={`${seg.code.length}-${seg.code.slice(0, 40)}`} code={seg.code} />
                : <MarkdownBlock key={`md-${i}`} text={seg.text} />
            )}
          </div>

          {msg.images?.map((img: string, i: number) => (
            <img key={i} src={img} style={{ marginTop: 8, maxHeight: 320, borderRadius: 12, border: "1px solid #f3f4f6", display: "block" }} alt="uploaded" />
          ))}
        </div>
      </div>
    );
  },
  (prev, next) =>
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
    <Suspense fallback={<div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f9fafb" }}>進入教室中...</div>}>
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
  const [input,             setInput]             = useState("");
  const [isSending,         setIsSending]         = useState(false);
  const [imagesBase64,      setImagesBase64]      = useState<string[]>([]);
  const [knowledgeBaseText, setKnowledgeBaseText] = useState("");
  const [noteTitle,         setNoteTitle]         = useState("");
  const [noteContent,       setNoteContent]       = useState("");
  const [showNoteForm,      setShowNoteForm]      = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const live = useRef({ user, messages, knowledgeBaseText, threadId, subject });
  useEffect(() => { live.current = { user, messages, knowledgeBaseText, threadId, subject }; });

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (cu) => {
      if (!cu) { router.push("/"); return; }
      setUser(cu);
      try {
        const snap = await getDocs(query(
          collection(db, "chats"),
          where("threadId", "==", threadId),
          orderBy("timestamp", "asc"),
        ));
        setMessages(snap.docs.map((d) => d.data()));
      } catch (e: any) { console.error("讀取失敗：", e.message); }
      try {
        const kbSn = await getDocs(query(
          collection(db, `users/${cu.uid}/knowledge_base`),
          where("subject", "==", subject),
        ));
        setKnowledgeBaseText(kbSn.docs.map((d) => `[${d.data().title}]\n${d.data().content}`).join("\n\n"));
      } catch (e) { console.error("讀取個人資料庫失敗", e); }
    });
    return () => unsub();
  }, [threadId, router, subject]);

  const handleSaveNote = async () => {
    const { user, subject } = live.current;
    if (!noteTitle.trim() || !noteContent.trim() || !user) return;
    try {
      await addDoc(collection(db, `users/${user.uid}/knowledge_base`), {
        subject, title: noteTitle, content: noteContent, timestamp: Date.now(),
      });
      alert("✅ 已加入你的個人 AI 資料庫！");
      setNoteTitle(""); setNoteContent(""); setShowNoteForm(false);
      const kbSn = await getDocs(query(collection(db, `users/${user.uid}/knowledge_base`), where("subject", "==", subject)));
      setKnowledgeBaseText(kbSn.docs.map((d) => `[${d.data().title}]\n${d.data().content}`).join("\n\n"));
    } catch (e: any) { alert("儲存失敗：" + e.message); }
  };

  const saveToNotebook = useCallback(async (msg: any, index: number) => {
    const { user, messages, subject, threadId } = live.current;
    if (!user) return;
    const prev = messages[index - 1];
    try {
      const data = {
        uid: user.uid, userName: user.displayName, subject,
        question: prev?.role === "user" ? prev.content : "追問內容",
        answer: msg.content, images: prev?.images || [],
        timestamp: Date.now(), isPublic: true, threadId,
      };
      await addDoc(collection(db, `users/${user.uid}/wrong_questions`), data);
      await addDoc(collection(db, "community_vault"), data);
      alert("✅ 已加入錯題本");
    } catch { alert("❌ 儲存失敗"); }
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
    setMessages((prev) => [...prev, userMsg]);
    setInput(""); setImagesBase64([]); setIsSending(true);

    try {
      await addDoc(collection(db, "chats"), userMsg);
      const res = await fetch("/api/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: userPrompt, imagesBase64: currentImages, subject, history: messages, threadId, userName: user?.displayName, knowledge: knowledgeBaseText }),
      });
      const data = await res.json();
      if (res.ok) {
        const aiMsg = { uid: user.uid, role: "model", content: data.text, timestamp: Date.now(), threadId };
        setMessages((prev) => [...prev, aiMsg]);
        await addDoc(collection(db, "chats"), aiMsg);
      }
    } catch (err: any) {
      setMessages((prev) => [...prev, { role: "model", content: `❌ 錯誤：${err.message}`, timestamp: Date.now() }]);
    } finally { setIsSending(false); }
  };

  const colors: Record<string, string> = { "bg-red-600": "#dc2626", "bg-blue-600": "#2563eb", "bg-green-600": "#16a34a", "bg-purple-600": "#9333ea", "bg-amber-600": "#d97706" };
  const headerColor = colors[subjectInfo.color] ?? "#2563eb";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "#f8fafc" }}>

      {/* ── KATEX & TAILWIND FIXES ──────────────────────── */}
      <style>{`
        .markdown-content .katex-display {
          overflow-x: auto !important;
          overflow-y: visible !important;
          margin: 1em 0 !important;
        }
        .markdown-content .katex-display > .katex {
          overflow-y: visible !important;
        }
        .markdown-content .katex-display > .katex > .katex-html {
          overflow-y: visible !important;
          padding-top: 0.5em !important;
          padding-bottom: 0.3em !important;
        }
        .markdown-content p .katex {
          overflow-y: visible !important;
        }
        .markdown-content p .katex > .katex-html {
          overflow-y: visible !important;
          display: inline-block !important;
          padding-top: 0.35em !important;
          padding-bottom: 0.1em !important;
          vertical-align: middle !important;
        }
        .markdown-content p {
          line-height: 2.4 !important;
          margin-bottom: 0.6em !important;
        }
        /* 修正 Tailwind Preflight 將全域 svg 設為 block 的排版衝突 */
        .markdown-content .katex svg {
          display: inline !important;
          width: auto !important;
          height: auto !important;
        }
        .save-btn { opacity: 0 !important; }
        .save-btn:hover, *:hover > .save-btn { opacity: 1 !important; }
      `}</style>

      {/* Header */}
      <header style={{ background: headerColor, color: "white", padding: "1rem 1.5rem", display: "flex", justifyContent: "space-between", alignItems: "center", boxShadow: "0 2px 8px rgba(0,0,0,0.15)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={() => router.push(`/chat?subject=${subject}`)} style={{ background: "none", border: "none", color: "white", fontSize: 20, cursor: "pointer", opacity: 0.9 }}>🏠</button>
          <h1 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 700 }}>{subjectInfo.name}</h1>
        </div>
        <span style={{ fontSize: 14, fontWeight: 700, opacity: 0.9 }}>{user?.displayName} 同學</span>
      </header>

      {/* Knowledge bar */}
      <div style={{ background: "white", borderBottom: "1px solid #e5e7eb", padding: "8px 1rem" }}>
        <div style={{ maxWidth: "56rem", margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12 }}>
          <span style={{ color: "#9ca3af" }}>💡 已加載 {knowledgeBaseText.split("\n\n").filter(Boolean).length} 條個人筆記</span>
          <button onClick={() => setShowNoteForm((v) => !v)} style={{ background: "none", border: "none", color: "#2563eb", fontWeight: 700, cursor: "pointer", fontSize: 12 }}>
            {showNoteForm ? "✖ 關閉" : "📝 加入個人筆記/解題口訣"}
          </button>
        </div>
        {showNoteForm && (
          <div style={{ maxWidth: "56rem", margin: "12px auto 4px", padding: "1rem", background: "#eff6ff", borderRadius: 16, border: "1px solid #bfdbfe", display: "flex", flexDirection: "column", gap: 10 }}>
            <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#1d4ed8" }}>幫你的 AI 大腦增加記憶：</h4>
            <input type="text" placeholder="筆記標題" value={noteTitle} onChange={(e) => setNoteTitle(e.target.value)} style={{ padding: "8px 12px", border: "1px solid #ddd", borderRadius: 10, fontSize: 14, outline: "none" }} />
            <textarea placeholder="內容" value={noteContent} onChange={(e) => setNoteContent(e.target.value)} style={{ padding: "8px 12px", border: "1px solid #ddd", borderRadius: 10, fontSize: 14, height: 80, outline: "none", resize: "vertical" }} />
            <button onClick={handleSaveNote} style={{ background: "#2563eb", color: "white", border: "none", borderRadius: 10, padding: "8px 0", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>存入我的個人 AI 大腦</button>
          </div>
        )}
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: "1rem", display: "flex", flexDirection: "column", gap: "1rem", background: "#f1f5f9" }}>
        {messages.map((msg, idx) => (
          <MessageBubble
            key={`${msg.threadId ?? "local"}-${msg.timestamp}-${idx}`}
            msg={msg}
            idx={idx}
            onSave={saveToNotebook}
          />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Footer */}
      <footer style={{ padding: "1rem", background: "white", borderTop: "1px solid #e5e7eb" }}>
        <form onSubmit={handleSend} style={{ maxWidth: "56rem", margin: "0 auto", display: "flex", flexDirection: "column", gap: 8 }}>
          {imagesBase64.length > 0 && (
            <div style={{ display: "flex", gap: 8, padding: 8, background: "#f9fafb", borderRadius: 12 }}>
              {imagesBase64.map((img, i) => (
                <img key={i} src={img} style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 8, border: "1px solid #e5e7eb" }} alt="preview" />
              ))}
            </div>
          )}
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <label style={{ cursor: "pointer", background: "#f3f4f6", padding: "10px 12px", borderRadius: "50%", fontSize: 18, lineHeight: 1 }}>
              📷<input type="file" accept="image/*" onChange={handleImageChange} style={{ display: "none" }} />
            </label>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              style={{ flex: 1, border: "1px solid #d1d5db", borderRadius: 9999, padding: "10px 20px", fontSize: 15, outline: "none" }}
              placeholder="請輸入問題或拍照..."
            />
            <button
              type="submit"
              disabled={isSending}
              style={{ padding: "10px 24px", borderRadius: 9999, border: "none", fontWeight: 700, fontSize: 15, cursor: isSending ? "not-allowed" : "pointer", background: isSending ? "#9ca3af" : "#2563eb", color: "white" }}
            >
              {isSending ? "發送中..." : "發送"}
            </button>
          </div>
        </form>
      </footer>
    </div>
  );
}
