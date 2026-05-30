"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { auth, db } from "../../../lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { collection, addDoc, query, where, orderBy, getDocs } from "firebase/firestore";

import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

const SUBJECT_MAP = {
  math: { name: "📐 高中數學", color: "bg-red-600" },
  physics: { name: "🍎 高中物理", color: "bg-blue-600" },
  chemistry: { name: "🧪 高中化學", color: "bg-green-600" },
  biology: { name: "🧬 高中生物", color: "bg-purple-600" },
  earth: { name: "🌍 高中地科", color: "bg-amber-600" },
};

// 🚀 終極渲染器：自帶無敵 LaTeX 外殼 + 拔除中文 + 視覺化除錯
const TikzImage = ({ code }: { code: string }) => {
  const [svgContent, setSvgContent] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [debugCode, setDebugCode] = useState<string>("");

  useEffect(() => {
    async function fetchImage() {
      try {
        // 1. 精準切割出繪圖主體
        let tikzBody = code;
        const match = code.match(/\\begin\{tikzpicture\}[\s\S]*?\\end\{tikzpicture\}/);
        if (match) {
          tikzBody = match[0];
        }

        // 2. 抓出 AI 可能使用的擴充套件
        const libraryMatch = code.match(/\\usetikzlibrary\{[^}]*\}/g);
        const extraLibs = libraryMatch ? libraryMatch.join('\n') : "";

        // 3. 物理超度法：拔除中文，避免 Kroki 伺服器崩潰
        tikzBody = tikzBody.replace(/[\u4e00-\u9fa5]/g, '');

        // 4. 手動組合最穩定的 LaTeX 外殼 (支援複雜物理箭頭如 -stealth)
        const latexLines = [
          "\\documentclass[tikz,border=2mm]{standalone}",
          "\\usepackage{amsmath,amssymb}",
          "\\usepackage{pgfplots}",
          "\\pgfplotsset{compat=1.18}",
          extraLibs,
          "\\begin{document}",
          tikzBody,
          "\\end{document}"
        ];
        const finalLatex = latexLines.join("\n");
        setDebugCode(finalLatex);

        // 5. 使用最穩定的純文字 POST 請求
        const response = await fetch("https://kroki.io/tikz/svg", {
          method: "POST",
          headers: {
            "Content-Type": "text/plain",
          },
          body: finalLatex
        });

        const text = await response.text();

        // 攔截 LaTeX 編譯錯誤
        if (!response.ok || text.includes("LaTeX Error") || text.includes("Undefined control sequence")) {
           throw new Error(text);
        }

        setSvgContent(text);
      } catch (err: any) {
        console.error("TikZ 渲染失敗:", err);
        setError(err.message || "Unknown Error");
      }
    }
    fetchImage();
  }, [code]);

  // 💡 X光除錯模式：清楚告訴你為什麼畫失敗
  if (error) {
    return (
      <div className="my-4 p-4 bg-red-50 text-red-600 border border-red-200 rounded-xl text-sm block w-full overflow-hidden">
        <strong>⚠️ AI 老師畫圖失敗</strong>
        <p className="mt-1 text-xs opacity-80 mb-2">請複製下方「送出的 LaTeX 碼」，直接丟給 AI 說：「這段語法編譯失敗，請修正」</p>
        <details>
          <summary className="text-xs cursor-pointer font-bold bg-red-100 p-2 rounded">點我展開錯誤細節 (工程師除錯用)</summary>
          <div className="mt-2">
            <p className="font-bold text-xs mt-2">伺服器回傳錯誤：</p>
            <pre className="text-xs bg-red-100 p-2 rounded max-h-32 overflow-auto mb-2 whitespace-pre-wrap">{error}</pre>
            <p className="font-bold text-xs">送出的 LaTeX 碼：</p>
            <pre className="text-xs bg-white p-2 rounded max-h-48 overflow-auto border whitespace-pre-wrap">{debugCode}</pre>
          </div>
        </details>
      </div>
    );
  }

  if (!svgContent) {
    return <span className="my-4 p-6 bg-gray-100 rounded-xl text-center text-gray-500 animate-pulse block">🎨 老師正在精確繪圖中...</span>;
  }

  return (
    <span
      className="my-4 flex justify-center bg-white p-4 rounded-xl border shadow-sm block overflow-x-auto"
      dangerouslySetInnerHTML={{ __html: svgContent }}
    />
  );
};

export default function ThreadChatRoom() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-gray-50">進入教室中...</div>}>
      <ChatContent />
    </Suspense>
  );
}

function ChatContent() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const threadId = params.id as string;

  const rawSubject = searchParams.get("subject") || "physics";
  const subject = SUBJECT_MAP[rawSubject as keyof typeof SUBJECT_MAP] ? rawSubject : "physics";
  const subjectInfo = SUBJECT_MAP[subject as keyof typeof SUBJECT_MAP];

  const [user, setUser] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [imagesBase64, setImagesBase64] = useState<string[]>([]);
  const [knowledgeBaseText, setKnowledgeBaseText] = useState("");
  
  const [personalNoteTitle, setPersonalNoteTitle] = useState("");
  const [personalNoteContent, setPersonalNoteContent] = useState("");
  const [showNoteForm, setShowNoteForm] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  useEffect(() => { scrollToBottom(); }, [messages]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) return router.push("/");
      setUser(currentUser);

      try {
        const q = query(
          collection(db, "chats"),
          where("threadId", "==", threadId),
          orderBy("timestamp", "asc")
        );
        const querySnapshot = await getDocs(q);
        setMessages(querySnapshot.docs.map(doc => doc.data()));
      } catch (err: any) { console.error("讀取失敗：", err.message); }

      try {
        const kbQuery = query(collection(db, `users/${currentUser.uid}/knowledge_base`), where("subject", "==", subject));
        const kbSnapshot = await getDocs(kbQuery);
        const kbTexts = kbSnapshot.docs.map(doc => `[${doc.data().title}]\n${doc.data().content}`).join("\n\n");
        setKnowledgeBaseText(kbTexts);
      } catch (err) { console.error("讀取個人資料庫失敗", err); }
      
    });
    return () => unsubscribe();
  }, [threadId, router, subject]);

  const handleSavePersonalNote = async () => {
    if (!personalNoteTitle.trim() || !personalNoteContent.trim() || !user) return;
    try {
      await addDoc(collection(db, `users/${user.uid}/knowledge_base`), {
        subject: subject, title: personalNoteTitle, content: personalNoteContent, timestamp: Date.now()
      });
      alert("✅ 已加入你的個人 AI 資料庫！");
      setPersonalNoteTitle(""); setPersonalNoteContent(""); setShowNoteForm(false);
      
      const kbQuery = query(collection(db, `users/${user.uid}/knowledge_base`), where("subject", "==", subject));
      const kbSnapshot = await getDocs(kbQuery);
      setKnowledgeBaseText(kbSnapshot.docs.map(doc => `[${doc.data().title}]\n${doc.data().content}`).join("\n\n"));
    } catch (err: any) { alert("儲存失敗：" + err.message); }
  };

  const saveToNotebook = async (msg: any, index: number) => {
    if (!user) return;
    const prev = messages[index - 1];
    try {
      const data = {
        uid: user.uid, userName: user.displayName, subject,
        question: prev?.role === "user" ? prev.content : "追問內容",
        answer: msg.content, images: prev?.images || [],
        timestamp: Date.now(), isPublic: true, threadId
      };
      await addDoc(collection(db, `users/${user.uid}/wrong_questions`), data);
      await addDoc(collection(db, "community_vault"), data);
      alert("✅ 已加入錯題本");
    } catch (err) { alert("❌ 儲存失敗"); }
  };

  const handleImageChange = async (e: any) => {
    const files = Array.from(e.target.files) as File[];
    const promises = files.map((file) => {
      return new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = (event) => {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement("canvas");
            const MAX = 1024;
            let w = img.width, h = img.height;
            if (w > h) { if (w > MAX) { h *= MAX / w; w = MAX; } }
            else { if (h > MAX) { w *= MAX / h; h = MAX; } }
            canvas.width = w; canvas.height = h;
            const ctx = canvas.getContext("2d");
            ctx?.drawImage(img, 0, 0, w, h);
            resolve(canvas.toDataURL("image/jpeg", 0.7));
          };
          img.src = event.target?.result as string;
        };
        reader.readAsDataURL(file);
      });
    });
    const results = await Promise.all(promises);
    setImagesBase64(results);
  };

  const handleSendMessage = async (e: any) => {
    e.preventDefault();
    if (!input.trim() && imagesBase64.length === 0) return;
    if (isSending) return;

    const userPrompt = input;
    const currentImages = [...imagesBase64];

    const userMessage = { 
      uid: user.uid, userName: user.displayName || "匿名同學", subject, role: "user", 
      content: userPrompt, images: currentImages, timestamp: Date.now(), threadId 
    };

    setMessages(prev => [...prev, userMessage]);
    setInput(""); setImagesBase64([]); setIsSending(true);

    try {
      await addDoc(collection(db, "chats"), userMessage);
      const response = await fetch("/api/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          prompt: userPrompt, imagesBase64: currentImages, subject, 
          history: messages, threadId, userName: user?.displayName, knowledge: knowledgeBaseText 
        })
      });
      const data = await response.json();
      if (response.ok) {
        const aiMessage = { uid: user.uid, role: "model", content: data.text, timestamp: Date.now(), threadId };
        setMessages(prev => [...prev, aiMessage]);
        await addDoc(collection(db, "chats"), aiMessage);
      }
    } catch (error: any) {
      setMessages(prev => [...prev, { role: "model", content: `❌ 錯誤：${error.message}`, timestamp: Date.now() }]);
    } finally { setIsSending(false); }
  };
  // 🛡️ 最強字串修復：解決 AI 亂打標籤或不穿衣服的狀況
  const formatMessageContent = (text: string) => {
    if (!text) return "";
    let fixedText = text;
    
    // 把 AI 寫錯的 ```latex 等標籤換成我們系統認得的 ```tikz
    fixedText = fixedText.replace(/```latex/g, "```tikz");
    
    return fixedText;
  };
