"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "../../../lib/firebase"; // 注意路徑多了一層
import { onAuthStateChanged } from "firebase/auth";
import { collection, addDoc, query, where, orderBy, getDocs, updateDoc, doc } from "firebase/firestore";
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import 'katex/dist/katex.min.css';

export default function ThreadRoom({ params, searchParams }) {
  const router = useRouter();
  // 取得網址上的討論串 ID
  const threadId = params.id; 
  // 這裡為了簡化，科目直接在組件內抓取
  const subject = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get("subject") || "physics" : "physics";

  const [user, setUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [imagesBase64, setImagesBase64] = useState([]);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  useEffect(() => { scrollToBottom(); }, [messages]);

  // 讀取「這個專屬討論串」的歷史訊息
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) return router.push("/");
      setUser(currentUser);
      
      const q = query(
        collection(db, "chats"),
        where("threadId", "==", threadId), // 🚀 關鍵：只抓這個房間的訊息
        orderBy("timestamp", "asc")
      );
      const snapshot = await getDocs(q);
      const history = snapshot.docs.map(doc => doc.data());
      setMessages(history);
    });
    return () => unsubscribe();
  }, [threadId, router]);

  // 儲存錯題本的邏輯 (跟之前一樣)
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
    const files = Array.from(e.target.files);
    Promise.all(files.map(file => new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(file);
    }))).then(setImagesBase64);
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim() && imagesBase64.length === 0) return;
    if (isSending) return;

    const userPrompt = input;
    const currentImages = [...imagesBase64];
    const userMessage = {
      uid: user.uid, subject, role: "user", content: userPrompt, images: currentImages,
      timestamp: Date.now(),
      threadId: threadId // 🚀 紀錄這是屬於哪個討論串的
    };

    setMessages(prev => [...prev, userMessage]);
    setInput(""); setImagesBase64([]); setIsSending(true);

    try {
      // 如果這是第一句話，更新討論串的標題
      if (messages.length === 0) {
        await updateDoc(doc(db, "threads", threadId), { title: userPrompt.substring(0, 20) + "..." });
      }

      await addDoc(collection(db, "chats"), userMessage);

      const response = await fetch("/api/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: userPrompt, imagesBase64: currentImages, subject, history: messages })
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
    <div className="flex flex-col h-screen bg-gray-50">
      <header className="bg-gray-800 text-white px-6 py-4 shadow-md flex justify-between items-center">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push(`/chat?subject=${subject}`)} className="hover:opacity-80 text-xl bg-gray-700 px-3 py-1 rounded-lg">⬅ 返回目錄</button>
          <h1 className="text-lg font-bold">解題追問室</h1>
        </div>
      </header>

      {/* 聊天區塊 (跟原本完全一樣) */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
        {messages.length === 0 && <div className="text-center text-gray-400 mt-10">開始描述你的問題或上傳題目照片吧！</div>}
        {messages.map((msg, index) => (
          <div key={index} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-3xl rounded-2xl p-4 shadow-sm relative group ${msg.role === "user" ? "bg-blue-600 text-white rounded-tr-none" : "bg-white text-gray-800 rounded-tl-none border border-gray-200"}`}>
              {msg.role === "model" && <button onClick={() => saveToNotebook(msg, index)} className="absolute -top-3 -right-3 bg-yellow-400 text-white p-2 rounded-full shadow hover:bg-yellow-500 opacity-0 group-hover:opacity-100 text-xs">⭐</button>}
              <div className="markdown-content prose prose-slate max-w-none">
                <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex, rehypeRaw]}>{msg.content}</ReactMarkdown>
              </div>
              {msg.images && msg.images.map((img, idx) => <img key={idx} src={img} alt="題目" className="mt-2 max-h-80 rounded-lg shadow-sm" />)}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* 輸入區塊 */}
      <footer className="p-4 bg-white border-t border-gray-200">
        <form onSubmit={handleSendMessage} className="max-w-4xl mx-auto space-y-2">
          {imagesBase64.length > 0 && (
            <div className="flex gap-2 p-2 bg-gray-50 rounded-lg">
              {imagesBase64.map((img, idx) => (
                <div key={idx} className="relative">
                  <img src={img} alt="預覽" className="w-16 h-16 object-cover rounded border" />
                  <button type="button" onClick={() => setImagesBase64([])} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 text-xs">×</button>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-3 items-center">
            <label className="cursor-pointer bg-gray-100 p-3 rounded-full hover:bg-gray-200">📷<input type="file" accept="image/*" onChange={handleImageChange} className="hidden" /></label>
            <input type="text" value={input} onChange={(e) => setInput(e.target.value)} placeholder="針對這題繼續追問..." className="flex-1 border border-gray-300 rounded-full px-5 py-3 focus:outline-none focus:border-blue-500" disabled={isSending} />
            <button type="submit" disabled={isSending} className={`px-6 py-3 rounded-full text-white font-medium ${isSending ? "bg-gray-400" : "bg-blue-600"}`}>發問</button>
          </div>
        </form>
      </footer>
    </div>
  );
}
