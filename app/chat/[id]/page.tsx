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

  // 🛡️ 路由參數防禦
  const rawSubject = searchParams.get("subject") || "physics";
  const subject = SUBJECT_MAP[rawSubject] ? rawSubject : "physics";
  const subjectInfo = SUBJECT_MAP[subject];

  // 狀態管理
  const [user, setUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [imagesBase64, setImagesBase64] = useState([]);
  const [knowledgeBaseText, setKnowledgeBaseText] = useState("");
  
  // 🚀 學生個人筆記輸入狀態
  const [personalNoteTitle, setPersonalNoteTitle] = useState("");
  const [personalNoteContent, setPersonalNoteContent] = useState("");
  const [showNoteForm, setShowNoteForm] = useState(false);

  const messagesEndRef = useRef(null);
  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  useEffect(() => { scrollToBottom(); }, [messages]);

  // 初始化：監聽登入狀態、讀取對話與個人知識庫
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) return router.push("/");
      setUser(currentUser);

      // 1. 讀取歷史訊息
      try {
        const q = query(
          collection(db, "chats"),
          where("threadId", "==", threadId),
          orderBy("timestamp", "asc")
        );
        const querySnapshot = await getDocs(q);
        setMessages(querySnapshot.docs.map(doc => doc.data()));
      } catch (err) { console.error("讀取失敗：", err.message); }

      // 2. 🚀 核心：抓取該學生「個人專屬」的講義庫
      try {
        const kbQuery = query(collection(db, `users/${currentUser.uid}/knowledge_base`), where("subject", "==", subject));
        const kbSnapshot = await getDocs(kbQuery);
        const kbTexts = kbSnapshot.docs.map(doc => `[${doc.data().title}]\n${doc.data().content}`).join("\n\n");
        setKnowledgeBaseText(kbTexts);
      } catch (err) { console.error("讀取個人資料庫失敗", err); }
      
    });
    return () => unsubscribe();
  }, [threadId, router, subject]);

  // 📝 儲存個人筆記功能
  const handleSavePersonalNote = async () => {
    if (!personalNoteTitle.trim() || !personalNoteContent.trim() || !user) return;
    try {
      await addDoc(collection(db, `users/${user.uid}/knowledge_base`), {
        subject: subject,
        title: personalNoteTitle,
        content: personalNoteContent,
        timestamp: Date.now()
      });
      alert("✅ 已加入你的個人 AI 資料庫！AI 之後會參考這份筆記教你。");
      setPersonalNoteTitle("");
      setPersonalNoteContent("");
      setShowNoteForm(false);
      
      // 立即更新本地知識庫，讓下次發問馬上生效
      const kbQuery = query(collection(db, `users/${user.uid}/knowledge_base`), where("subject", "==", subject));
      const kbSnapshot = await getDocs(kbQuery);
      setKnowledgeBaseText(kbSnapshot.docs.map(doc => `[${doc.data().title}]\n${doc.data().content}`).join("\n\n"));
    } catch (err) { alert("儲存失敗：" + err.message); }
  };

  // ⭐ 儲存錯題本
  const saveToNotebook = async (msg, index) => {
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

  // 📷 圖片壓縮處理
  const handleImageChange = async (e) => {
    const files = Array.from(e.target.files);
    const promises = files.map((file) => {
      return new Promise((resolve) => {
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
            ctx.drawImage(img, 0, 0, w, h);
            resolve(canvas.toDataURL("image/jpeg", 0.7));
          };
          img.src = event.target.result as string;
        };
        reader.readAsDataURL(file);
      });
    });
    const results = await Promise.all(promises);
    setImagesBase64(results);
  };

  // ✉️ 發送訊息
  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim() && imagesBase64.length === 0) return;
    if (isSending) return;

    const userPrompt = input;
    const currentImages = [...imagesBase64];

    const userMessage = { 
      uid: user.uid, 
      userName: user.displayName || "匿名同學", 
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
          knowledge: knowledgeBaseText 
        })
      });
      const data = await response.json();
      if (response.ok) {
        const aiMessage = { uid: user.uid, role: "model", content: data.text, timestamp: Date.now(), threadId };
        setMessages(prev => [...prev, aiMessage]);
        await addDoc(collection(db, "chats"), aiMessage);
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
        <span className="text-sm opacity-90 font-bold">{user?.displayName} 同學</span>
      </header>

      {/* 🚀 學生個人筆記/心法注入介面 */}
      <div className="bg-white border-b px-4 py-2">
        <div className="max-w-4xl mx-auto flex justify-between items-center text-xs">
          <span className="text-gray-400">💡 當前已加載 {knowledgeBaseText.split('\n\n').filter(t => t).length} 條個人筆記與講義</span>
          <button 
            onClick={() => setShowNoteForm(!showNoteForm)}
            className="font-bold text-blue-600 hover:text-blue-800 transition-colors"
          >
            {showNoteForm ? "✖ 關閉介面" : "📝 點我加入個人筆記/解題口訣"}
          </button>
        </div>
        
        {showNoteForm && (
          <div className="max-w-4xl mx-auto mt-3 p-4 bg-blue-50 rounded-2xl border border-blue-100 space-y-3 animate-in fade-in slide-in-from-top-2">
            <h4 className="text-sm font-bold text-blue-800">幫你的 AI 大腦增加記憶：</h4>
            <input 
              type="text" 
              placeholder="筆記標題 (例如：遇到斜面摩擦力的判斷法)" 
              value={personalNoteTitle}
              onChange={e => setPersonalNoteTitle(e.target.value)}
              className="w-full p-2.5 border rounded-xl text-sm focus:ring-2 focus:ring-blue-400 outline-none"
            />
            <textarea 
              placeholder="內容 (例如：只要題目提到『等速運動』，代表合力為零...)" 
              value={personalNoteContent}
              onChange={e => setPersonalNoteContent(e.target.value)}
              className="w-full p-2.5 border rounded-xl text-sm h-24 focus:ring-2 focus:ring-blue-400 outline-none"
            />
            <button 
              onClick={handleSavePersonalNote}
              className="w-full bg-blue-600 text-white py-2 rounded-xl text-sm font-bold shadow-md hover:bg-blue-700 active:scale-95 transition-all"
            >
              存入我的個人 AI 大腦
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50">
        {messages.map((msg, idx) => (
          <div key={idx} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-3xl rounded-3xl p-4 relative group shadow-sm ${msg.role === "user" ? "bg-blue-600 text-white rounded-tr-none" : "bg-white text-gray-800 border rounded-tl-none"}`}>
              {msg.role === "model" && <button onClick={() => saveToNotebook(msg, idx)} className="absolute -top-3 -right-3 bg-yellow-400 p-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-md hover:scale-110 active:scale-90">⭐</button>}
              
              <div className="markdown-content">
                <ReactMarkdown
                  remarkPlugins={[remarkMath]}
                  rehypePlugins={[rehypeRaw, rehypeKatex]} // 🚀 補上 LaTeX 公式與原生 HTML 支持
                  components={{
                    // 🚀 程式碼攔截器
                    code({ node, inline, className, children, ...props }) {
                      const match = /language-(\w+)/.exec(className || '');
                      const codeString = String(children).replace(/\n$/, '');

                      // 如果是 xml/html 且裡面有 svg 標籤，就直接畫出圖形！
                      if (!inline && (match?.[1] === 'xml' || match?.[1] === 'html') && codeString.includes('<svg')) {
                        return (
                          <div 
                            className="my-4 w-full overflow-hidden rounded-lg shadow-sm"
                            dangerouslySetInnerHTML={{ __html: codeString }} 
                          />
                        );
                      }

                      // 其他普通程式碼維持原樣
                      return inline ? (
                        <code className={className} {...props}>
                          {children}
                        </code>
                      ) : (
                        <pre className="bg-gray-800 text-gray-100 p-4 rounded-md overflow-x-auto text-sm my-2">
                          <code className={className} {...props}>
                            {children}
                          </code>
                        </pre>
                      );
                    },
                  }}
                >
                  {msg.content} {/* 🚀 修正：從 message.content 改回 msg.content */}
                </ReactMarkdown>
              </div>
              {msg.images && msg.images.map((img, i) => <img key={i} src={img} className="mt-2 max-h-80 rounded-xl border border-gray-100 shadow-sm" alt="Student question" />)}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <footer className="p-4 bg-white border-t">
        <form onSubmit={handleSendMessage} className="max-w-4xl mx-auto space-y-2">
          {imagesBase64.length > 0 && (
            <div className="flex gap-2 p-2 bg-gray-50 rounded-xl mb-2">
              {imagesBase64.map((img, i) => (
                <div key={i} className="relative w-16 h-16 border rounded-lg overflow-hidden shadow-inner"><img src={img} className="w-full h-full object-cover" alt="upload preview" /></div>
              ))}
            </div>
          )}
          <div className="flex gap-3">
            <label className="cursor-pointer bg-gray-100 p-3 rounded-full hover:bg-gray-200 transition-colors">
              📷<input type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
            </label>
            <input 
              type="text" 
              value={input} 
              onChange={e => setInput(e.target.value)} 
              className="flex-1 border rounded-full px-5 py-3 focus:ring-2 focus:ring-blue-500 outline-none transition-all" 
              placeholder="請輸入問題或拍照..." 
            />
            <button 
              type="submit" 
              disabled={isSending}
              className={`px-6 py-3 rounded-full font-bold shadow-md transition-all ${isSending ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-700 text-white active:scale-95'}`}
            >
              {isSending ? "發送中..." : "發送"}
            </button>
          </div>
        </form>
      </footer>
    </div>
  );
}
