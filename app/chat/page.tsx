"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { auth, db } from "../../lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { collection, addDoc, query, where, orderBy, getDocs } from "firebase/firestore";

// 科目中英文對照表
const SUBJECT_MAP = {
  math: { name: "📐 高中數學", color: "bg-red-600" },
  physics: { name: "🍎 高中物理", color: "bg-blue-600" },
  chemistry: { name: "🧪 高中化學", color: "bg-green-600" },
  biology: { name: "🧬 高中生物", color: "bg-purple-600" },
};

// 1. 主頁面元件（負責提供 Next.js 的安全編譯邊界）
export default function ChatPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-500">教室準備中...</div>}>
      <ChatRoom />
    </Suspense>
  );
}

// 2. 實際的聊天室內核
function ChatRoom() {
  // 1. 在 ChatRoom 函式頂端加入這段儲存邏輯
const saveToNotebook = async (msg) => {
  if (!user) return;

  try {
    const notebookData = {
      uid: user.uid,
      userName: user.displayName,
      subject: subject,
      // 因為訊息紀錄是一來一往，所以要抓取上一個使用者的提問
      question: "已儲存的提問內容", // 這裡待會會用更精確的方式抓
      answer: msg.content,
      timestamp: Date.now(),
      isPublic: true // 預設分享給全網
    };

    // 存入使用者的錯題本
    await addDoc(collection(db, `users/${user.uid}/wrong_questions`), notebookData);
    
    // 如果同意，同時存入社群庫
    if (notebookData.isPublic) {
      await addDoc(collection(db, "community_vault"), notebookData);
    }
    
    alert("✅ 成功加入錯題本！");
  } catch (err) {
    console.error("儲存失敗：", err);
    alert("❌ 儲存失敗");
  }
};
  const searchParams = useSearchParams();
  const router = useRouter();
  const subject = searchParams.get("subject") || "physics"; // 預設物理
  const subjectInfo = SUBJECT_MAP[subject] || SUBJECT_MAP["physics"];

  const [user, setUser] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [imagesBase64, setImagesBase64] = useState([]);

  const messagesEndRef = useRef(null);

  // 自動捲動到最下方
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // 驗證登入狀態，並讀取該科目的歷史紀錄
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        // 未登入，導回首頁
        router.push("/");
      } else {
        setUser(currentUser);
        // 從 Firestore 讀取過去的聊天紀錄
        try {
          const q = query(
            collection(db, "chats"),
            where("uid", "==", currentUser.uid),
            where("subject", "==", subject),
            orderBy("timestamp", "asc")
          );
          const querySnapshot = await getDocs(q);
          const history = [];
          querySnapshot.forEach((doc) => {
            history.push(doc.data());
          });
          setMessages(history);
        } catch (err) {
          console.error("讀取歷史紀錄失敗：", err);
        }
      }
      setLoadingAuth(false);
    });

    return () => unsubscribe();
  }, [subject, router]);

  // 處理前端選取圖片
  const handleImageChange = (e) => {
    const files = Array.from(e.target.files);
    const promises = files.map((file) => {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(file);
      });
    });

    Promise.all(promises).then((results) => {
      setImagesBase64(results);
    });
  };

  // 發送訊息
  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim() && imagesBase64.length === 0) return;
    if (isSending) return;

    const userPrompt = input;
    const currentImages = [...imagesBase64];

    // 1. 建立使用者訊息物件
    const userMessage = {
      uid: user.uid,
      subject: subject,
      role: "user",
      content: userPrompt,
      images: currentImages,
      timestamp: Date.now()
    };

    // 更新 UI 畫面並清空輸入框
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setImagesBase64([]);
    setIsSending(true);

    // 同步把使用者訊息寫入 Firebase
    try {
      await addDoc(collection(db, "chats"), userMessage);
    } catch (err) {
      console.error("儲存使用者訊息失敗：", err);
    }

    // 2. 呼叫後端 API
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: userPrompt,
          imagesBase64: currentImages,
          subject: subject // 告訴後端這次是什麼科目
        })
      });

      const data = await response.json();

      if (response.ok) {
        const aiMessage = {
          uid: user.uid,
          subject: subject,
          role: "model",
          content: data.text,
          images: [],
          timestamp: Date.now()
        };

        // 更新 UI 畫面
        setMessages((prev) => [...prev, aiMessage]);

        // 同步把 AI 回應寫入 Firebase 存檔
        await addDoc(collection(db, "chats"), aiMessage);
      } else {
        throw new Error(data.error || "連線錯誤");
      }

    } catch (error) {
      setMessages((prev) => [
        ...prev,
        { role: "model", content: `❌ 老師壞了：${error.message}`, timestamp: Date.now() }
      ]);
    } finally {
      setIsSending(false);
    }
  };

  if (loadingAuth) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-50">確認學生身分中...</div>;
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* 上方導覽列 */}
      <header className={`${subjectInfo.color} text-white px-6 py-4 shadow-md flex justify-between items-center`}>
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/")} className="hover:opacity-80 text-xl">🏠</button>
          <h1 className="text-xl font-bold">{subjectInfo.name} 輔導教室</h1>
        </div>
        <span className="text-sm opacity-90">{user?.displayName} 同學</span>
      </header>

      {/* 聊天紀錄顯示區 */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.length === 0 && (
          <div className="text-center text-gray-400 mt-12">
            這裡是空白的筆記本。輸入問題或上傳講義照片開始發問吧！
          </div>
        )}

        {messages.map((msg, index) => (
          <div key={index} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-2xl rounded-2xl p-4 shadow-sm ${msg.role === "user" ? "bg-blue-600 text-white rounded-tr-none" : "bg-white text-gray-800 rounded-tl-none border border-gray-200"}`}>
              {/* 渲染文字內容 */}
              <div className="whitespace-pre-wrap break-words">{msg.content}</div>
              
              {/* 渲染附帶的圖片 */}
              {msg.images && msg.images.map((img, imgIdx) => (
                <img key={imgIdx} src={img} alt="上傳題目" className="mt-2 max-h-60 rounded-lg shadow border" />
              ))}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* 下方控制輸入區 */}
      <footer className="p-4 bg-white border-t border-gray-200">
        <form onSubmit={handleSendMessage} className="max-w-4xl mx-auto space-y-2">
          {/* 圖片預覽縮圖 */}
          {imagesBase64.length > 0 && (
            <div className="flex gap-2 p-2 bg-gray-100 rounded-lg">
              {imagesBase64.map((img, idx) => (
                <div key={idx} className="relative">
                  <img src={img} alt="預覽" className="w-16 h-16 object-cover rounded border" />
                  <button type="button" onClick={() => setImagesBase64([])} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center">×</button>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-3 items-center">
            {/* 上傳按鈕 */}
            <label className="cursor-pointer bg-gray-100 p-3 rounded-full hover:bg-gray-200 transition-colors">
              📷
              <input type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
            </label>

            {/* 文字輸入框 */}
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={`${subjectInfo.name}老師正在聆聽你的問題...`}
              className="flex-1 border border-gray-300 rounded-full px-5 py-3 focus:outline-none focus:border-blue-500 bg-gray-50 text-gray-900"
              disabled={isSending}
            />

            {/* 送出按鈕 */}
            <button
              type="submit"
              disabled={isSending}
              className={`px-6 py-3 rounded-full text-white font-medium transition-colors ${isSending ? "bg-gray-400" : "bg-blue-600 hover:bg-blue-700"}`}
            >
              {isSending ? "思考中..." : "發問"}
            </button>
          </div>
        </form>
      </footer>
    </div>
  );
}
