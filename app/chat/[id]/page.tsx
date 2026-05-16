"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { auth, db } from "../../../lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { collection, addDoc, query, where, orderBy, getDocs, doc, updateDoc } from "firebase/firestore";

import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import 'katex/dist/katex.min.css';

export default function ThreadChatPage() {
  return (
    <Suspense fallback={<div className="h-screen flex items-center justify-center">進入教室中...</div>}>
      <ChatRoom />
    </Suspense>
  );
}

function ChatRoom() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  
  const threadId = params.id;
  const subject = searchParams.get("subject") || "physics";

  const [user, setUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [imagesBase64, setImagesBase64] = useState([]);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) return router.push("/");
      setUser(currentUser);
      
      const q = query(
        collection(db, "chats"),
        where("threadId", "==", threadId),
        orderBy("timestamp", "asc")
      );
      const snapshot = await getDocs(q);
      setMessages(snapshot.docs.map(doc => doc.data()));
    });
    return () => unsubscribe();
  }, [threadId, router]);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim() && imagesBase64.length === 0) return;
    if (isSending) return;

    const userPrompt = input;
    const currentImages = [...imagesBase64];
    const userMessage = {
      uid: user.uid, subject, role: "user", content: userPrompt,
      images: currentImages, timestamp: Date.now(), threadId
    };

    setMessages(prev => [...prev, userMessage]);
    setInput(""); setImagesBase64([]); setIsSending(true);

    try {
      // 🚀 第一句話：自動幫這個討論串設標題
      if (messages.length === 0) {
        await updateDoc(doc(db, "threads", threadId as string), { 
          title: userPrompt.substring(0, 15) + "..." 
        });
      }

      await addDoc(collection(db, "chats"), userMessage);

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: userPrompt, imagesBase64: currentImages, subject, history: messages, threadId })
      });
      
      const data = await response.json();
      if (response.ok) {
        const aiMessage = { uid: user.uid, subject, role: "model", content: data.text, timestamp: Date.now(), threadId };
        setMessages(prev => [...prev, aiMessage]);
        await addDoc(collection(db, "chats"), aiMessage);
      }
    } catch (err) {
      console.error(err);
    } finally { setIsSending(false); }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-900">
      <header className="bg-gray-800 p-4 border-b border-gray-700 flex justify-between items-center text-white">
        <button onClick={() => router.push(`/chat?subject=${subject}`)} className="text-sm bg-gray-700 px-3 py-1 rounded">⬅ 返回目錄</button>
        <h2 className="font-bold">解題追問室</h2>
        <div className="w-10"></div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {messages.map((msg, idx) => (
          <div key={idx} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] p-4 rounded-2xl shadow-lg ${msg.role === "user" ? "bg-blue-600 text-white" : "bg-white text-gray-800"}`}>
              <div className="markdown-content prose prose-slate max-w-none">
                {/* 🚀 關鍵修復：加入 msg.content || "" 防止 indexOf/includes 報錯 */}
                <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex, rehypeRaw]}>
                  {msg.content || ""}
                </ReactMarkdown>
              </div>
              {msg.images && msg.images.map((img, i) => <img key={i} src={img} className="mt-2 rounded-lg max-h-64" />)}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <footer className="p-4 bg-gray-800">
        <form onSubmit={handleSendMessage} className="max-w-4xl mx-auto flex gap-2">
          <input 
            type="text" value={input} onChange={e => setInput(e.target.value)}
            className="flex-1 bg-gray-700 text-white rounded-full px-4 py-2 focus:outline-none"
            placeholder="繼續追問這題..."
          />
          <button type="submit" className="bg-blue-600 text-white px-6 py-2 rounded-full font-bold">發送</button>
        </form>
      </footer>
    </div>
  );
}
