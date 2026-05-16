"use client";

import { useState, useEffect, useRef, Suspense } from "react";
// 注意：動態路由需要從 params 抓取 [id]
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { auth, db } from "../../../lib/firebase"; // 注意路徑多了一層
import { onAuthStateChanged } from "firebase/auth";
import { collection, addDoc, query, where, orderBy, getDocs } from "firebase/firestore";

// --- Markdown 與 數學公式渲染套件保持不變 ---
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import 'katex/dist/katex.min.css';

const SUBJECT_MAP = {
  // ... 同之前
};

export default function ThreadChatRoom() {
  // 🚀 關鍵：在 App Router 模式下，使用 `<Suspense>` 包裹 useSearchParams()
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-500">教室準備中...</div>}>
      <ChatContent />
    </Suspense>
  );
}

function ChatContent() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  
  // 🚀 核心：抓取討論串的獨立 ID
  const threadId = params.id;
  const subject = searchParams.get("subject") || "physics";
  const subjectInfo = SUBJECT_MAP[subject] || SUBJECT_MAP["physics"];

  const [user, setUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [imagesBase64, setImagesBase64] = useState([]);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  useEffect(() => { scrollToBottom(); }, [messages]);

  // 1. 驗證登入並讀取「這個特定執行緒」的歷史紀錄
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) return router.push("/");
      setUser(currentUser);
      
      // 我們只讀取這個房間的 chats
      try {
        const q = query(
          collection(db, "chats"),
          where("threadId", "==", threadId), // 🚀 關鍵：只抓這個 thread 的訊息
          orderBy("timestamp", "asc")
        );
        const querySnapshot = await getDocs(q);
        const history = [];
        querySnapshot.forEach((doc) => history.push(doc.data()));
        setMessages(history);
      } catch (err) { console.error("讀取獨立對話失敗：", err.message); }
    });
    return () => unsubscribe();
  }, [threadId, router]);

  // 儲存錯題邏輯 (跟之前完全一樣，不需要改)
  const saveToNotebook = async (msg, index) => {
    if (!user) return;
    const previousMessage = messages[index - 1];
    const questionText = previousMessage?.role === "user" ? previousMessage.content : "續問或補充說明";
    const questionImages = previousMessage?.role === "user" ? (previousMessage.images || []) : [];

    try {
      const notebookData = {
        uid: user.uid, userName: user.displayName, subject: subject,
        question: questionText, answer: msg.content, images: questionImages,
        timestamp: Date.now(), isPublic: true
      };
      await addDoc(collection(db, `users/${user.uid}/wrong_questions`), notebookData);
      await addDoc(collection(db, "community_vault"), notebookData);
      alert("✅ 已成功加入錯題本！");
    } catch (err) { alert("❌ 儲存失敗"); }
  };

  const handleImageChange = (e) => {
    // ... 跟之前一樣 ...
  };

  // 發送訊息 (需要加入 threadId 標記)
  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim() && imagesBase64.length === 0) return;
    if (isSending) return;

    const userPrompt = input;
    const currentImages = [...imagesBase64];
    const userMessage = {
      uid: user.uid, subject, role: "user", content: userPrompt, images: currentImages,
      timestamp: Date.now(),
      threadId: threadId // 🚀 關鍵：把這個訊息標記為來自哪個執行緒
    };

    setMessages(prev => [...prev, userMessage]);
    setInput(""); setImagesBase64([]); setIsSending(true);

    try {
      await addDoc(collection(db, "chats"), userMessage);
      const response = await fetch("/api/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        // 🚀 新增：傳送 threadId 給 API 端做 Discord 顯示用
        body: JSON.stringify({ prompt: userPrompt, imagesBase64: currentImages, subject, history: messages, threadId: threadId })
      });
      const data = await response.json();

      if (response.ok) {
        const aiMessage = { uid: user.uid, subject, role: "model", content: data.text, timestamp: Date.now(), threadId: threadId };
        setMessages(prev => [...prev, aiMessage]);
        await addDoc(collection(db, "chats"), aiMessage);
      } else throw new Error(data.error);
    } catch (error) {
      setMessages(prev => [...prev, { role: "model", content: `❌ 錯誤：${error.message}`, timestamp: Date.now() }]);
    } finally { setIsSending(false); }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50 markdown-container">
      {/* 上方導覽列不變，但返回按鈕指回學科大廳 */}
      <header className={`${subjectInfo.color} text-white px-6 py-4 shadow-md flex justify-between items-center`}>
        <div className="flex items-center gap-3">
          <button onClick={() => router.push(`/chat?subject=${subject}`)} className="hover:opacity-80 text-xl">🏠</button>
          <h1 className="text-xl font-bold">{subjectInfo.name} 解題教室</h1>
        </div>
        <span className="text-sm opacity-90">{user?.displayName} 同學</span>
      </header>

      {/* 聊天區塊 (跟之前完全一樣) */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
        {messages.map((msg, index) => (
          <div key={index} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-3xl rounded-2xl p-4 shadow-sm relative group ${msg.role === "user" ? "bg-blue-600 text-white rounded-tr-none" : "bg-white text-gray-800 rounded-tl-none border border-gray-200"}`}>
              {msg.role === "model" && <button onClick={() => saveToNotebook(msg, index)} className="absolute -top-3 -right-3 bg-yellow-400 text-white p-2 rounded-full shadow hover:bg-yellow-500 hover:scale-110 transition-transform opacity-0 group-hover:opacity-100 z-10 text-xs">⭐</button>}
              <div className="whitespace-pre-wrap break-words">
                {/* 🚀 安全修復： Cannot read properties of undefined... */}
                <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex, rehypeRaw]}>{msg.content || ""}</ReactMarkdown>
              </div>
              {msg.images && msg.images.map((img, idx) => <img key={idx} src={img} alt="題目" className="mt-2 max-h-80 rounded-lg shadow-sm border border-white/20" />)}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* 下方控制區不變 */}
      <footer className="p-4 bg-white border-t border-gray-200">
        <form onSubmit={handleSendMessage} className="max-w-4xl mx-auto space-y-2">
          {/* ... 輸入控制 ... */}
        </form>
      </footer>
    </div>
  );
}
