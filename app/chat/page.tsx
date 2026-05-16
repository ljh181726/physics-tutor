"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { auth, db } from "../../lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { collection, addDoc, query, where, orderBy, getDocs } from "firebase/firestore";

// --- Markdown 與 數學公式渲染套件 ---
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

export default function ChatPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-500">教室準備中...</div>}>
      <ChatRoom />
    </Suspense>
  );
}

function ChatRoom() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const subject = searchParams.get("subject") || "physics";
  const subjectInfo = SUBJECT_MAP[subject] || SUBJECT_MAP["physics"];

  const [user, setUser] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [imagesBase64, setImagesBase64] = useState([]);

  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        router.push("/");
      } else {
        setUser(currentUser);
        try {
          const q = query(
            collection(db, "chats"),
            where("uid", "==", currentUser.uid),
            where("subject", "==", subject),
            orderBy("timestamp", "asc")
          );
          const querySnapshot = await getDocs(q);
          const history = [];
          querySnapshot.forEach((doc) => history.push(doc.data()));
          setMessages(history);
        } catch (err) {
          console.error("讀取歷史紀錄失敗：", err);
        }
      }
      setLoadingAuth(false);
    });
    return () => unsubscribe();
  }, [subject, router]);

  const saveToNotebook = async (msg, index) => {
    if (!user) return;
    const previousMessage = messages[index - 1];
    const questionText = previousMessage?.role === "user" ? previousMessage.content : "續問或補充說明";
    const questionImages = previousMessage?.role === "user" ? (previousMessage.images || []) : [];

    try {
      const notebookData = {
        uid: user.uid,
        userName: user.displayName,
        subject: subject,
        question: questionText,
        answer: msg.content,
        images: questionImages,
        timestamp: Date.now(),
        isPublic: true
      };
      await addDoc(collection(db, `users/${user.uid}/wrong_questions`), notebookData);
      await addDoc(collection(db, "community_vault"), notebookData);
      alert("✅ 已成功加入錯題本！");
    } catch (err) {
      alert("❌ 儲存失敗");
    }
  };

  const handleImageChange = (e) => {
    const files = Array.from(e.target.files);
    const promises = files.map((file) => {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(file);
      });
    });
    Promise.all(promises).then((results) => setImagesBase64(results));
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim() && imagesBase64.length === 0) return;
    if (isSending) return;

    const userPrompt = input;
    const currentImages = [...imagesBase64];
    const userMessage = {
      uid: user.uid,
      subject: subject,
      role: "user",
      content: userPrompt,
      images: currentImages,
      timestamp: Date.now()
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setImagesBase64([]);
    setIsSending(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          prompt: userPrompt, 
          imagesBase64: currentImages, 
          subject: subject,
          history: messages 
        })
      });
      const data = await response.json();

      if (response.ok) {
        const aiMessage = {
          uid: user.uid,
          subject: subject,
          role: "model",
          content: data.text,
          timestamp: Date.now()
        };
        setMessages((prev) => [...prev, aiMessage]);
        await addDoc(collection(db, "chats"), aiMessage);
      } else {
        throw new Error(data.error || "連線錯誤");
      }
    } catch (error) {
      setMessages((prev) => [...prev, { role: "model", content: `❌ 錯誤：${error.message}`, timestamp: Date.now() }]);
    } finally {
      setIsSending(false);
    }
  };

  if (loadingAuth) return <div className="min-h-screen flex items-center justify-center bg-gray-50">載入中...</div>;

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <header className={`${subjectInfo.color} text-white px-6 py-4 shadow-md flex justify-between items-center`}>
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/")} className="hover:opacity-80 text-xl">🏠</button>
          <h1 className="text-xl font-bold">{subjectInfo.name} 輔導教室</h1>
        </div>
        <span className="text-sm opacity-90">{user?.displayName} 同學</span>
      </header>

      {/* 聊天紀錄顯示區 */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
        {messages.map((msg, index) => (
          <div key={index} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-3xl rounded-2xl p-4 shadow-sm relative group ${msg.role === "user" ? "bg-blue-600 text-white rounded-tr-none" : "bg-white text-gray-800 rounded-tl-none border border-gray-200"}`}>
              
              {/* ⭐ 錯題儲存按鈕 */}
              {msg.role === "model" && (
                <button onClick={() => saveToNotebook(msg, index)} className="absolute -top-3 -right-3 bg-yellow-400 text-white p-2 rounded-full shadow hover:bg-yellow-500 hover:scale-110 transition-transform opacity-0 group-hover:opacity-100 z-10 text-xs">⭐</button>
              )}

              {/* 渲染文字、數學公式與 SVG */}
              <div className="markdown-content prose prose-slate max-w-none prose-p:leading-relaxed">
                <ReactMarkdown
                  remarkPlugins={[remarkMath]}
                  rehypePlugins={[rehypeKatex, rehypeRaw]}
                >
                  {msg.content}
                </ReactMarkdown>
              </div>

              {/* 圖片渲染 */}
              {msg.images && msg.images.map((img, imgIdx) => (
                <img key={imgIdx} src={img} alt="題目" className="mt-2 max-h-80 rounded-lg shadow-sm border border-white/20" />
              ))}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <footer className="p-4 bg-white border-t border-gray-200">
        <form onSubmit={handleSendMessage} className="max-w-4xl mx-auto space-y-2">
          {imagesBase64.length > 0 && (
            <div className="flex gap-2 p-2 bg-gray-50 rounded-lg border border-dashed border-gray-300">
              {imagesBase64.map((img, idx) => (
                <div key={idx} className="relative">
                  <img src={img} alt="預覽" className="w-16 h-16 object-cover rounded border" />
                  <button type="button" onClick={() => setImagesBase64([])} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 text-xs">×</button>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-3 items-center">
            <label className="cursor-pointer bg-gray-100 p-3 rounded-full hover:bg-gray-200 transition-colors">
              📷<input type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
            </label>
            <input type="text" value={input} onChange={(e) => setInput(e.target.value)} placeholder="輸入問題..." className="flex-1 border border-gray-300 rounded-full px-5 py-3 focus:outline-none focus:border-blue-500" disabled={isSending} />
            <button type="submit" disabled={isSending} className={`px-6 py-3 rounded-full text-white font-medium ${isSending ? "bg-gray-400" : "bg-blue-600 hover:bg-blue-700"}`}>{isSending ? "思考中" : "發問"}</button>
          </div>
        </form>
      </footer>
    </div>
  );
}
