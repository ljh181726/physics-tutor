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

  const rawSubject = searchParams.get("subject") || "physics";
  const subject = SUBJECT_MAP[rawSubject] ? rawSubject : "physics";
  const subjectInfo = SUBJECT_MAP[subject];

  const [user, setUser] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [imagesBase64, setImagesBase64] = useState<string[]>([]);
  const [knowledgeBaseText, setKnowledgeBaseText] = useState("");
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [personalNoteTitle, setPersonalNoteTitle] = useState("");
  const [personalNoteContent, setPersonalNoteContent] = useState("");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  useEffect(() => { scrollToBottom(); }, [messages, isSending]);

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

        const kbQuery = query(collection(db, `users/${currentUser.uid}/knowledge_base`), where("subject", "==", subject));
        const kbSnapshot = await getDocs(kbQuery);
        setKnowledgeBaseText(kbSnapshot.docs.map(doc => `[${doc.data().title}]\n${doc.data().content}`).join("\n\n"));
      } catch (err: any) { console.error("初始化失敗：", err.message); }
    });
    return () => unsubscribe();
  }, [threadId, subject, router]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!input.trim() && imagesBase64.length === 0) || isSending || !user) return;

    const userPrompt = input;
    const currentImages = [...imagesBase64];
    const userMessage = { 
      uid: user.uid, userName: user.displayName || "同學", 
      subject, role: "user", content: userPrompt, images: currentImages, 
      timestamp: Date.now(), threadId 
    };

    setMessages(prev => [...prev, userMessage]);
    setInput(""); setImagesBase64([]); setIsSending(true);

    try {
      await addDoc(collection(db, "chats"), userMessage);
      
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          prompt: userPrompt, imagesBase64: currentImages, subject, 
          history: [...messages, userMessage], // 🚀 傳入包含當前問題的完整歷史
          threadId, userName: user?.displayName, knowledge: knowledgeBaseText 
        })
      });

      const data = await response.json();

      if (response.ok && data.text) {
        const aiMessage = { uid: user.uid, role: "model", content: data.text, timestamp: Date.now(), threadId };
        setMessages(prev => [...prev, aiMessage]);
        await addDoc(collection(db, "chats"), aiMessage);
      } else {
        // 🚀 關鍵修正：當 API 報錯時（如 503），在畫面上顯示錯誤訊息
        const errorText = data.error || "AI 老師目前塞車中，請稍等幾秒後再試一次！";
        setMessages(prev => [...prev, { role: "model", content: `❌ ${errorText}`, timestamp: Date.now() }]);
      }
    } catch (error: any) {
      setMessages(prev => [...prev, { role: "model", content: `❌ 連線失敗：${error.message}`, timestamp: Date.now() }]);
    } finally { setIsSending(false); }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50 overflow-hidden">
      <header className={`${subjectInfo.color} text-white px-6 py-4 shadow-md flex justify-between items-center shrink-0`}>
        <div className="flex items-center gap-3">
          <button onClick={() => router.push(`/chat?subject=${subject}`)} className="text-xl">🏠</button>
          <h1 className="text-xl font-bold">{subjectInfo.name}</h1>
        </div>
        <span className="text-sm font-bold">{user?.displayName} 同學</span>
      </header>

      {/* 知識庫導覽列 */}
      <div className="bg-white border-b px-4 py-2 shrink-0">
        <div className="max-w-4xl mx-auto flex justify-between items-center text-xs">
          <span className="text-gray-400">💡 個人知識庫已加載</span>
          <button onClick={() => setShowNoteForm(!showNoteForm)} className="text-blue-600 font-bold">
            {showNoteForm ? "✖ 關閉" : "📝 加入筆記"}
          </button>
        </div>
      </div>

      {/* 訊息展示區 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6 bg-slate-50">
        <div className="max-w-4xl mx-auto space-y-6">
          {messages.map((msg, idx) => (
            <div key={idx} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] rounded-2xl p-4 shadow-sm relative ${
                msg.role === "user" ? "bg-blue-600 text-white rounded-tr-none" : "bg-white text-gray-800 border rounded-tl-none"
              }`}>
                <div className="markdown-content leading-relaxed">
                  <ReactMarkdown
                    remarkPlugins={[remarkMath]}
                    rehypePlugins={[rehypeRaw, rehypeKatex]}
                    components={{
                      code({ inline, className, children, ...props }) {
                        const match = /language-(\w+)/.exec(className || '');
                        const codeString = String(children).replace(/\n$/, '');
                        if (!inline && (match?.[1] === 'xml' || codeString.includes('<svg'))) {
                          return <div className="my-2" dangerouslySetInnerHTML={{ __html: codeString }} />;
                        }
                        return <code className={className} {...props}>{children}</code>;
                      }
                    }}
                  >
                    {msg.content || (msg.images?.length > 0 ? "*(上傳了圖片)*" : "")}
                  </ReactMarkdown>
                </div>
                {msg.images?.map((img: string, i: number) => (
                  <img key={i} src={img} className="mt-3 rounded-lg border border-white/20 max-h-96" alt="content" />
                ))}
              </div>
            </div>
          ))}
          
          {/* 🚀 思考中動畫：讓學生知道 AI 正在工作 */}
          {isSending && (
            <div className="flex justify-start animate-pulse">
              <div className="bg-white border rounded-2xl rounded-tl-none p-4 text-gray-400 text-sm">
                AI 老師正在解題中... ⏳
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <footer className="p-4 bg-white border-t shrink-0">
        <form onSubmit={handleSendMessage} className="max-w-4xl mx-auto flex gap-2">
          <input 
            type="text" value={input} onChange={e => setInput(e.target.value)} 
            className="flex-1 border rounded-full px-5 py-3 focus:ring-2 focus:ring-blue-500 outline-none" 
            placeholder="輸入問題..." 
          />
          <button 
            type="submit" disabled={isSending}
            className={`px-6 py-2 rounded-full font-bold text-white transition-all ${isSending ? 'bg-gray-300' : 'bg-blue-600'}`}
          >
            {isSending ? "..." : "發送"}
          </button>
        </form>
      </footer>
    </div>
  );
}
