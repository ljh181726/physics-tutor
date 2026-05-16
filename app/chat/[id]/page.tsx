"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { auth, db } from "../../../lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { collection, addDoc, query, where, orderBy, getDocs } from "firebase/firestore";

import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import 'katex/dist/katex.min.css';

const SUBJECT_MAP = {
  math: { name: "📐 高中數學", color: "bg-red-600" },
  physics: { name: "🍎 高中物理", color: "bg-blue-600" },
  chemistry: { name: "🧪 高中化學", color: "bg-green-600" },
  biology: { name: "🧬 高中生物", color: "bg-purple-600" },
  earth: { name: "🌍 高中地科", color: "bg-amber-600" },
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
  
  // 🛡️ 雙重防禦防護
  const rawSubject = searchParams.get("subject") || "physics";
  const subject = SUBJECT_MAP[rawSubject] ? rawSubject : "physics";
  const subjectInfo = SUBJECT_MAP[subject];

  const [user, setUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [imagesBase64, setImagesBase64] = useState([]);
  // 🚀 修正：State 必須寫在組件內部
  const [knowledgeBaseText, setKnowledgeBaseText] = useState("");
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  useEffect(() => { scrollToBottom(); }, [messages]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) return router.push("/");
      setUser(currentUser);

      // 讀取歷史訊息
      try {
        const q = query(
          collection(db, "chats"),
          where("threadId", "==", threadId),
          orderBy("timestamp", "asc")
        );
        const querySnapshot = await getDocs(q);
        setMessages(querySnapshot.docs.map(doc => doc.data()));
      } catch (err) { console.error("讀取失敗：", err.message); }

      // 🚀 核心修改：改為抓取該學生「個人專屬」的講義庫
      try {
        const kbQuery = query(collection(db, `users/${currentUser.uid}/knowledge_base`));
        const kbSnapshot = await getDocs(kbQuery);
        const kbTexts = kbSnapshot.docs.map(doc => `[${doc.data().title}]\n${doc.data().content}`).join("\n\n");
        setKnowledgeBaseText(kbTexts);
      } catch (err) { console.error("讀取個人知識庫失敗", err); }
      
    });
    return () => unsubscribe();
  }, [threadId, router, subject]);

  const saveToNotebook = async (msg, index) => {
    if (!user) return;
    const prev = messages[index - 1];
    try {
      const data = {
        uid: user.uid, userName: user.displayName, subject,
        question: prev?.role === "user" ? prev.content : "追問內容",
        answer: msg.content, images: prev?.images || [],
        timestamp: Date.now(), isPublic: true,
        threadId: threadId // 🚀 關鍵新增：把房間 ID 一起存進錯題本
      };
      await addDoc(collection(db, `users/${user.uid}/wrong_questions`), data);
      await addDoc(collection(db, "community_vault"), data);
      alert("✅ 已加入錯題本");
    } catch (err) { alert("❌ 儲存失敗"); }
  };

  // 🚀 升級版：加入圖片自動壓縮功能
  const handleImageChange = async (e) => {
    const files = Array.from(e.target.files);
    
    const promises = files.map((file) => {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (event) => {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement("canvas");
            
            const MAX_WIDTH = 1024;
            const MAX_HEIGHT = 1024;
            let width = img.width;
            let height = img.height;

            if (width > height) {
              if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; }
            } else {
              if (height > MAX_HEIGHT) { width *= MAX_HEIGHT / height; height = MAX_HEIGHT; }
            }

            canvas.width = width;
            canvas.height = height;
            
            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0, width, height);

            const compressedBase64 = canvas.toDataURL("image/jpeg", 0.7);
            resolve(compressedBase64);
          };
          img.src = event.target.result;
        };
        reader.readAsDataURL(file);
      });
    });

    const results = await Promise.all(promises);
    setImagesBase64(results);
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim() && imagesBase64.length === 0) return;
    if (isSending) return;

    const userPrompt = input;
    const currentImages = [...imagesBase64];
    const userMessage = { uid: user.uid, subject, role: "user", content: userPrompt, images: currentImages, timestamp: Date.now(), threadId };
    const userMessage = { 
      uid: user.uid, 
      userName: user.displayName || "匿名同學", // 👈 就是漏了這一行！
      subject, 
      role: "user", 
      content: userPrompt, 
      images: currentImages, 
      timestamp: Date.now(), 
      threadId 
    };
    setMessages(prev => [...prev, userMessage]);
    setInput(""); setImagesBase64([]); setIsSending(true);

    try {
      await addDoc(collection(db, "chats"), userMessage);
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          prompt: userPrompt, 
          imagesBase64: currentImages, 
          subject, 
          history: messages, 
          threadId,
          userName: user?.displayName,
          knowledge: knowledgeBaseText // 🚀 將講義庫一起帶過去
        })
      });
      const data = await response.json();
      if (response.ok) {
        const aiMessage = { uid: user.uid, subject, role: "model", content: data.text, timestamp: Date.now(), threadId };
        setMessages(prev => [...prev, aiMessage]);
        await addDoc(collection(db, "chats"), aiMessage);
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      setMessages(prev => [...prev, { role: "model", content: `❌ 錯誤：${error.message}`, timestamp: Date.now() }]);
    } finally { setIsSending(false); }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <header className={`${subjectInfo.color} text-white px-6 py-4 shadow-md flex justify-between items-center`}>
        <div className="flex items-center gap-3">
          <button onClick={() => router.push(`/chat?subject=${subject}`)} className="hover:opacity-80 text-xl">🏠</button>
          <h1 className="text-xl font-bold">{subjectInfo.name}</h1>
        </div>
        <span className="text-sm opacity-90">{user?.displayName}</span>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, idx) => (
          <div key={idx} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-3xl rounded-2xl p-4 relative group ${msg.role === "user" ? "bg-blue-600 text-white" : "bg-white text-gray-800 border"}`}>
              {msg.role === "model" && <button onClick={() => saveToNotebook(msg, idx)} className="absolute -top-3 -right-3 bg-yellow-400 p-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">⭐</button>}
              <div className="markdown-content">
                <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex, rehypeRaw]}>{msg.content || ""}</ReactMarkdown>
              </div>
              {msg.images && msg.images.map((img, i) => <img key={i} src={img} className="mt-2 max-h-80 rounded-lg" />)}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <footer className="p-4 bg-white border-t">
        <form onSubmit={handleSendMessage} className="max-w-4xl mx-auto space-y-2">
          {imagesBase64.length > 0 && (
            <div className="flex gap-2 p-2 bg-gray-50 rounded">
              {imagesBase64.map((img, i) => (
                <div key={i} className="relative w-16 h-16"><img src={img} className="w-full h-full object-cover rounded" /></div>
              ))}
            </div>
          )}
          <div className="flex gap-3">
            <label className="cursor-pointer bg-gray-100 p-3 rounded-full">📷<input type="file" onChange={handleImageChange} className="hidden" /></label>
            <input type="text" value={input} onChange={e => setInput(e.target.value)} className="flex-1 border rounded-full px-5 py-3" placeholder="請輸入問題..." />
            <button type="submit" className="bg-blue-600 text-white px-6 py-3 rounded-full">發送</button>
          </div>
        </form>
      </footer>
    </div>
  );
}
