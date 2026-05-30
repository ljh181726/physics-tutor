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

/* ─────────────────────────────────────────
   Constants
───────────────────────────────────────── */
const SUBJECT_MAP = {
  math:      { name: "📐 高中數學", color: "bg-red-600" },
  physics:   { name: "🍎 高中物理", color: "bg-blue-600" },
  chemistry: { name: "🧪 高中化學", color: "bg-green-600" },
  biology:   { name: "🧬 高中生物", color: "bg-purple-600" },
  earth:     { name: "🌍 高中地科", color: "bg-amber-600" },
} as const;

/* ─────────────────────────────────────────
   Module-level SVG cache
   Lives outside React — never reset by renders
───────────────────────────────────────── */
const SVG_CACHE: Record<string, string> = {};
const ERR_CACHE: Record<string, string> = {};
// Track in-flight fetches so two mounts of same code don't double-fetch
const IN_FLIGHT: Record<string, Promise<void>> = {};

async function fetchTikz(code: string): Promise<void> {
  const key = code.trim();
  if (SVG_CACHE[key] || ERR_CACHE[key]) return;
  if (key in IN_FLIGHT) return IN_FLIGHT[key];

  IN_FLIGHT[key] = (async () => {
    try {
      let tikzBody = key;
      const bodyMatch = key.match(/\\begin\{tikzpicture\}[\s\S]*?\\end\{tikzpicture\}/);
      if (bodyMatch) tikzBody = bodyMatch[0];
      tikzBody = tikzBody.replace(/[\u4e00-\u9fa5]/g, "");

      const libMatch = key.match(/\\usetikzlibrary\{[^}]*\}/g);
      const extraLibs = libMatch ? libMatch.join("\n") : "";

      const finalLatex = [
        "\\documentclass[tikz,border=2mm]{standalone}",
        "\\usepackage{amsmath,amssymb}",
        "\\usepackage{pgfplots}",
        "\\pgfplotsset{compat=1.18}",
        extraLibs,
        "\\begin{document}",
        tikzBody,
        "\\end{document}",
      ].join("\n");

      const res = await fetch("https://kroki.io/tikz/svg", {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: finalLatex,
      });
      const text = await res.text();
      if (
        !res.ok ||
        text.includes("LaTeX Error") ||
        text.includes("Undefined control sequence")
      ) {
        throw new Error(text.slice(0, 600));
      }
      SVG_CACHE[key] = text;
    } catch (e: any) {
      ERR_CACHE[key] = e.message ?? "Unknown error";
    } finally {
      delete IN_FLIGHT[key];
    }
  })();

  return IN_FLIGHT[key];
}

/* ─────────────────────────────────────────
   TikzImage
   - reads from cache immediately on mount
   - fetches only if not cached, never refetches
   - useEffect has [] deps — intentional
───────────────────────────────────────── */
function TikzImage({ code }: { code: string }) {
  const key = code.trim();
  const [svg, setSvg] = useState<string>(SVG_CACHE[key] ?? "");
  const [err, setErr] = useState<string>(ERR_CACHE[key] ?? "");

  useEffect(() => {
    // Already in cache from a previous render — nothing to do
    if (SVG_CACHE[key]) { setSvg(SVG_CACHE[key]); return; }
    if (ERR_CACHE[key]) { setErr(ERR_CACHE[key]); return; }

    fetchTikz(key).then(() => {
      if (SVG_CACHE[key]) setSvg(SVG_CACHE[key]);
      else if (ERR_CACHE[key]) setErr(ERR_CACHE[key]);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // empty — `key` is captured at mount, we intentionally never re-fetch

  if (err) return (
    <div className="my-4 p-4 bg-red-50 text-red-600 border border-red-200 rounded-xl text-sm">
      <strong>⚠️ 畫圖失敗</strong>
      <details className="mt-2">
        <summary className="text-xs cursor-pointer font-bold bg-red-100 p-2 rounded">
          點我展開錯誤細節
        </summary>
        <pre className="text-xs bg-white p-2 rounded max-h-48 overflow-auto border mt-2 whitespace-pre-wrap">
          {err}
        </pre>
      </details>
    </div>
  );

  if (!svg) return (
    <span className="my-4 p-6 bg-gray-100 rounded-xl text-center text-gray-500 animate-pulse block">
      🎨 老師正在精確繪圖中...
    </span>
  );

  return (
    <span
      className="my-4 flex justify-center bg-white p-4 rounded-xl border shadow-sm block overflow-x-auto"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

/* ─────────────────────────────────────────
   Message segmentation
   Splits content into tikz / markdown chunks
───────────────────────────────────────── */
type Seg = { type: "tikz"; code: string } | { type: "md"; text: string };

function parseSegs(raw: string): Seg[] {
  if (!raw) return [];
  // normalise fences
  let text = raw.replace(/```latex/g, "```tikz");
  // wrap bare tikzpicture blocks that aren't already fenced
  if (text.includes("\\begin{tikzpicture}") && !text.includes("```tikz")) {
    text = text.replace(
      /\\begin\{tikzpicture\}[\s\S]*?\\end\{tikzpicture\}/g,
      (m) => `\n\`\`\`tikz\n${m}\n\`\`\`\n`,
    );
  }

  const segs: Seg[] = [];
  const re = /```tikz\n([\s\S]*?)```/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) segs.push({ type: "md", text: text.slice(last, m.index) });
    segs.push({ type: "tikz", code: m[1].trim() });
    last = m.index + m[0].length;
  }
  if (last < text.length) segs.push({ type: "md", text: text.slice(last) });
  return segs;
}

/* ─────────────────────────────────────────
   MarkdownBlock — memoised, only re-renders
   when its text prop actually changes
───────────────────────────────────────── */
const MarkdownBlock = React.memo(({ text }: { text: string }) => (
  <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
    {text}
  </ReactMarkdown>
));
MarkdownBlock.displayName = "MarkdownBlock";

/* ─────────────────────────────────────────
   MessageBubble — memoised per message
   Typing in the input changes `input` state
   only — none of these props change, so
   React.memo bails out immediately.
───────────────────────────────────────── */
const MessageBubble = React.memo(
  ({
    msg, idx, onSave,
  }: {
    msg: any;
    idx: number;
    onSave: (msg: any, idx: number) => void;
  }) => {
    const segs = useMemo(() => parseSegs(msg.content ?? ""), [msg.content]);

    return (
      <div className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
        <div
          className={`max-w-3xl rounded-3xl p-4 relative group shadow-sm ${
            msg.role === "user"
              ? "bg-blue-600 text-white rounded-tr-none"
              : "bg-white text-gray-800 border rounded-tl-none"
          }`}
        >
          {msg.role === "model" && (
            <button
              onClick={() => onSave(msg, idx)}
              className="absolute -top-3 -right-3 bg-yellow-400 p-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-md hover:scale-110 active:scale-90"
            >
              ⭐
            </button>
          )}

          <div className="markdown-content leading-loose space-y-4 break-words">
            {segs.length === 0 && msg.images?.length > 0 && <em>*(上傳了圖片)*</em>}
            {segs.map((seg, i) =>
              seg.type === "tikz"
                ? <TikzImage key={`tikz-${i}-${seg.code.length}`} code={seg.code} />
                : <MarkdownBlock key={`md-${i}`} text={seg.text} />,
            )}
          </div>

          {msg.images?.map((img: string, i: number) => (
            <img
              key={i}
              src={img}
              className="mt-2 max-h-80 rounded-xl border border-gray-100 shadow-sm"
              alt="uploaded"
            />
          ))}
        </div>
      </div>
    );
  },
  (prev, next) =>
    prev.msg.content === next.msg.content &&
    prev.msg.images  === next.msg.images &&
    prev.idx         === next.idx,
);
MessageBubble.displayName = "MessageBubble";

/* ─────────────────────────────────────────
   Root export
───────────────────────────────────────── */
export default function ThreadChatRoom() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          進入教室中...
        </div>
      }
    >
      <ChatContent />
    </Suspense>
  );
}

/* ─────────────────────────────────────────
   ChatContent
───────────────────────────────────────── */
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
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Mutable ref holding latest state — lets callbacks stay stable
  const live = useRef({ user, messages, knowledgeBaseText, threadId, subject });
  useEffect(() => { live.current = { user, messages, knowledgeBaseText, threadId, subject }; });

  /* ── Auth + initial data load ── */
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (cu) => {
      if (!cu) { router.push("/"); return; }
      setUser(cu);

      try {
        const q   = query(
          collection(db, "chats"),
          where("threadId", "==", threadId),
          orderBy("timestamp", "asc"),
        );
        const snap = await getDocs(q);
        setMessages(snap.docs.map((d) => d.data()));
      } catch (e: any) { console.error("讀取失敗：", e.message); }

      try {
        const kbQ  = query(
          collection(db, `users/${cu.uid}/knowledge_base`),
          where("subject", "==", subject),
        );
        const kbSn = await getDocs(kbQ);
        setKnowledgeBaseText(
          kbSn.docs.map((d) => `[${d.data().title}]\n${d.data().content}`).join("\n\n"),
        );
      } catch (e) { console.error("讀取個人資料庫失敗", e); }
    });
    return () => unsub();
  }, [threadId, router, subject]);

  /* ── Save personal note ── */
  const handleSaveNote = async () => {
    const { user, subject } = live.current;
    if (!noteTitle.trim() || !noteContent.trim() || !user) return;
    try {
      await addDoc(collection(db, `users/${user.uid}/knowledge_base`), {
        subject, title: noteTitle, content: noteContent, timestamp: Date.now(),
      });
      alert("✅ 已加入你的個人 AI 資料庫！");
      setNoteTitle(""); setNoteContent(""); setShowNoteForm(false);
      const kbQ  = query(
        collection(db, `users/${user.uid}/knowledge_base`),
        where("subject", "==", subject),
      );
      const kbSn = await getDocs(kbQ);
      setKnowledgeBaseText(
        kbSn.docs.map((d) => `[${d.data().title}]\n${d.data().content}`).join("\n\n"),
      );
    } catch (e: any) { alert("儲存失敗：" + e.message); }
  };

  /* ── Save to notebook — stable identity via useCallback + live ref ── */
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
  }, []); // stable forever

  /* ── Image resize ── */
  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []) as File[];
    const results = await Promise.all(
      files.map(
        (file) =>
          new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = (ev) => {
              const img = new Image();
              img.onload = () => {
                const MAX = 1024;
                let w = img.width, h = img.height;
                if (w > h) { if (w > MAX) { h = (h * MAX) / w; w = MAX; } }
                else       { if (h > MAX) { w = (w * MAX) / h; h = MAX; } }
                const canvas = document.createElement("canvas");
                canvas.width = w; canvas.height = h;
                canvas.getContext("2d")?.drawImage(img, 0, 0, w, h);
                resolve(canvas.toDataURL("image/jpeg", 0.7));
              };
              img.src = ev.target?.result as string;
            };
            reader.readAsDataURL(file);
          }),
      ),
    );
    setImagesBase64(results);
  };

  /* ── Send message ── */
  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const { user, messages, knowledgeBaseText, threadId, subject } = live.current;
    if (!input.trim() && imagesBase64.length === 0) return;
    if (isSending) return;

    const userPrompt    = input;
    const currentImages = [...imagesBase64];
    const userMsg       = {
      uid: user.uid, userName: user.displayName || "匿名同學",
      subject, role: "user", content: userPrompt,
      images: currentImages, timestamp: Date.now(), threadId,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput(""); setImagesBase64([]); setIsSending(true);

    try {
      await addDoc(collection(db, "chats"), userMsg);
      const res  = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: userPrompt, imagesBase64: currentImages, subject,
          history: messages, threadId,
          userName: user?.displayName, knowledge: knowledgeBaseText,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        const aiMsg = {
          uid: user.uid, role: "model",
          content: data.text, timestamp: Date.now(), threadId,
        };
        setMessages((prev) => [...prev, aiMsg]);
        await addDoc(collection(db, "chats"), aiMsg);
      }
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        { role: "model", content: `❌ 錯誤：${err.message}`, timestamp: Date.now() },
      ]);
    } finally { setIsSending(false); }
  };

  /* ─────────────────────────────────────────
     Render
  ───────────────────────────────────────── */
  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/*
        KaTeX sqrt fix:
        KaTeX renders sqrt with inline `style` on inner vlist spans.
        We can't override those with regular CSS, but we CAN override
        the outer container metrics so the clipping rect is large enough.
        The actual "obscuring" comes from overflow:hidden on .katex
        and cramped line-height — fix both.
      */}
      <style jsx global>{`
        .markdown-content .katex-display {
          overflow-x: auto !important;
          overflow-y: visible !important;
          padding: 1.2rem 0 !important;
          margin: 0.8rem 0 !important;
          line-height: 1 !important;
        }
        /* Inline math */
        .markdown-content .katex {
          overflow-x: visible !important;
          overflow-y: visible !important;
          white-space: nowrap !important;
        }
        /* Every vlist layer must not clip */
        .markdown-content .katex .vlist-t,
        .markdown-content .katex .vlist-t2,
        .markdown-content .katex .vlist-r,
        .markdown-content .katex .vlist,
        .markdown-content .katex .vlist > span,
        .markdown-content .katex .sqrt,
        .markdown-content .katex .sqrt > .vlist-t {
          overflow: visible !important;
        }
        /* The pstrut (phantom strut) inside sqrt sets the row height.
           KaTeX gives it a height via inline style — we add extra padding
           so the vinculum line has breathing room above digits. */
        .markdown-content .katex .sqrt .pstrut {
          padding-top: 0.3em !important;
        }
        /* Ensure the sqrt overline (the horizontal bar) has room */
        .markdown-content .katex .sqrt > .vlist-t > .vlist-r > .vlist {
          overflow: visible !important;
          padding-top: 0.25em !important;
        }
        /* Paragraph spacing around display math */
        .markdown-content p {
          line-height: 1.9 !important;
          margin-bottom: 0.5rem !important;
        }
        .markdown-content .katex .vlist-t2 {
          margin-right: 0 !important;
        }
      `}</style>

      {/* Header */}
      <header
        className={`${subjectInfo.color} text-white px-6 py-4 shadow-md flex justify-between items-center`}
      >
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push(`/chat?subject=${subject}`)}
            className="hover:opacity-80 text-xl"
          >
            🏠
          </button>
          <h1 className="text-xl font-bold">{subjectInfo.name}</h1>
        </div>
        <span className="text-sm opacity-90 font-bold">{user?.displayName} 同學</span>
      </header>

      {/* Knowledge bar */}
      <div className="bg-white border-b px-4 py-2">
        <div className="max-w-4xl mx-auto flex justify-between items-center text-xs">
          <span className="text-gray-400">
            💡 當前已加載{" "}
            {knowledgeBaseText.split("\n\n").filter(Boolean).length}{" "}
            條個人筆記與講義
          </span>
          <button
            onClick={() => setShowNoteForm((v) => !v)}
            className="font-bold text-blue-600 hover:text-blue-800 transition-colors"
          >
            {showNoteForm ? "✖ 關閉介面" : "📝 點我加入個人筆記/解題口訣"}
          </button>
        </div>

        {showNoteForm && (
          <div className="max-w-4xl mx-auto mt-3 p-4 bg-blue-50 rounded-2xl border border-blue-100 space-y-3">
            <h4 className="text-sm font-bold text-blue-800">幫你的 AI 大腦增加記憶：</h4>
            <input
              type="text"
              placeholder="筆記標題 (例如：遇到斜面摩擦力的判斷法)"
              value={noteTitle}
              onChange={(e) => setNoteTitle(e.target.value)}
              className="w-full p-2.5 border rounded-xl text-sm focus:ring-2 focus:ring-blue-400 outline-none"
            />
            <textarea
              placeholder="內容 (例如：只要題目提到『等速運動』，代表合力為零...)"
              value={noteContent}
              onChange={(e) => setNoteContent(e.target.value)}
              className="w-full p-2.5 border rounded-xl text-sm h-24 focus:ring-2 focus:ring-blue-400 outline-none"
            />
            <button
              onClick={handleSaveNote}
              className="w-full bg-blue-600 text-white py-2 rounded-xl text-sm font-bold shadow-md hover:bg-blue-700 active:scale-95 transition-all"
            >
              存入我的個人 AI 大腦
            </button>
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50">
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
      <footer className="p-4 bg-white border-t">
        <form onSubmit={handleSend} className="max-w-4xl mx-auto space-y-2">
          {imagesBase64.length > 0 && (
            <div className="flex gap-2 p-2 bg-gray-50 rounded-xl mb-2">
              {imagesBase64.map((img, i) => (
                <div
                  key={i}
                  className="relative w-16 h-16 border rounded-lg overflow-hidden shadow-inner"
                >
                  <img src={img} className="w-full h-full object-cover" alt="preview" />
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-3">
            <label className="cursor-pointer bg-gray-100 p-3 rounded-full hover:bg-gray-200 transition-colors">
              📷
              <input
                type="file"
                accept="image/*"
                onChange={handleImageChange}
                className="hidden"
              />
            </label>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="flex-1 border rounded-full px-5 py-3 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              placeholder="請輸入問題或拍照..."
            />
            <button
              type="submit"
              disabled={isSending}
              className={`px-6 py-3 rounded-full font-bold shadow-md transition-all ${
                isSending
                  ? "bg-gray-400 text-white cursor-not-allowed"
                  : "bg-blue-600 hover:bg-blue-700 text-white active:scale-95"
              }`}
            >
              {isSending ? "發送中..." : "發送"}
            </button>
          </div>
        </form>
      </footer>
    </div>
  );
}
