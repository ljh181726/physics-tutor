"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { auth, db } from "../../lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { collection, query, where, orderBy, getDocs, addDoc, doc, writeBatch } from "firebase/firestore";

const SUBJECT_MAP = {
  math: { name: "📐 高中數學", color: "bg-red-600" },
  physics: { name: "🍎 高中物理", color: "bg-blue-600" },
  chemistry: { name: "🧪 高中化學", color: "bg-green-600" },
  biology: { name: "🧬 高中生物", color: "bg-purple-600" },
  earth: { name: "🌍 高中地科", color: "bg-amber-600" },
};

export default function ChatPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-500">載入目錄中...</div>}>
      <DashboardContent />
    </Suspense>
  );
}

function DashboardContent() {
    const handleRenameThread = async (e, threadId, oldTitle) => {
    e.stopPropagation(); // 防止點擊時跳轉進房間
    const newTitle = prompt("✏️ 請輸入新的對話標題：", oldTitle);
    if (!newTitle || newTitle.trim() === "" || newTitle === oldTitle) return;

    try {
      await updateDoc(doc(db, "threads", threadId), { title: newTitle });
      // 更新畫面
      setThreads(prev => prev.map(t => t.id === threadId ? { ...t, title: newTitle } : t));
    } catch (err) {
      alert("重新命名失敗：" + err.message);
    }
  };
  const searchParams = useSearchParams();
  const router = useRouter();
  
  const rawSubject = searchParams.get("subject") || "physics";
  const subject = SUBJECT_MAP[rawSubject] ? rawSubject : "physics";
  const subjectInfo = SUBJECT_MAP[subject];

  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [threads, setThreads] = useState([]);

  // 讀取對話目錄
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) return router.push("/");
      setUser(currentUser);
      
      try {
        const q = query(
          collection(db, "threads"),
          where("uid", "==", currentUser.uid),
          where("subject", "==", subject),
          orderBy("timestamp", "desc")
        );
        const querySnapshot = await getDocs(q);
        const history = [];
        querySnapshot.forEach((doc) => history.push({ id: doc.id, ...doc.data() }));
        setThreads(history);
      } catch (err) { 
        console.error("讀取題目目錄失敗：", err.message); 
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [subject, router]);

  // ➕ 建立新題目房間
  const handleOpenNewThread = async () => {
    if (!user) return;
    try {
      const threadRef = await addDoc(collection(db, "threads"), {
        uid: user.uid,
        subject: subject,
        title: `新題目... ${new Date().toLocaleDateString()}`,
        timestamp: Date.now()
      });
      router.push(`/chat/${threadRef.id}?subject=${subject}`);
    } catch (err) { alert("無法建立新題目室：" + err.message); }
  };

  // 🗑️ 核心功能：刪除對話執行緒以及該房間內的所有聊天紀錄
  const handleDeleteThread = async (e, threadId) => {
    // 🚀 關鍵：防止點擊刪除按鈕時，觸發父層卡片的點擊事件（避免跳轉進對話室）
    e.stopPropagation();

    if (!confirm("確定要刪除這個對話嗎？\n此動作將同時清空該題目的所有追問紀錄，且無法復原。")) return;

    try {
      const batch = writeBatch(db);

      // 1. 刪除 threads 集合中的對話卡片文件
      batch.delete(doc(db, "threads", threadId));

      // 2. 撈出對應這個 threadId 的所有 chats 訊息紀錄
      const chatsQuery = query(collection(db, "chats"), where("threadId", "==", threadId));
      const chatsSnapshot = await getDocs(chatsQuery);
      
      // 3. 把所有的訊息也加入刪除批次
      chatsSnapshot.docs.forEach((chatDoc) => {
        batch.delete(doc(db, "chats", chatDoc.id));
      });

      // 執行批次刪除
      await batch.commit();

      // 4. 更新前端 UI 狀態
      setThreads(prev => prev.filter(thread => thread.id !== threadId));
      alert("對話已成功刪除！");

    } catch (err) {
      console.error("刪除失敗:", err);
      alert("刪除失敗：" + err.message);
    }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-gray-50">確認目錄中...</div>;

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <header className={`${subjectInfo.color} text-white px-6 py-4 shadow-md flex justify-between items-center`}>
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/")} className="hover:opacity-80 text-xl">🏠</button>
          <h1 className="text-xl font-bold">{subjectInfo.name} 題目目錄</h1>
        </div>
        <span className="text-sm opacity-90">{user?.displayName} 同學</span>
      </header>

      <div className="flex-1 overflow-y-auto p-6 max-w-4xl mx-auto w-full">
        <button 
          onClick={handleOpenNewThread}
          className="w-full py-4 mb-8 bg-white border-2 border-dashed border-gray-300 text-gray-600 font-bold rounded-2xl hover:border-blue-500 hover:text-blue-600 transition-colors shadow-sm flex items-center justify-center gap-2"
        >
          <span className="text-2xl">➕</span> 開始發問一個新題目
        </button>

        <h2 className="text-lg font-bold text-gray-700 mb-4">過往題目紀錄</h2>
        
        {threads.length === 0 ? (
          <div className="text-center text-gray-400 mt-12">此科目目前還沒有過發問紀錄喔！</div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {threads.map((thread) => (
              <div 
                key={thread.id} 
                onClick={() => router.push(`/chat/${thread.id}?subject=${subject}`)}
                className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 cursor-pointer hover:shadow-md hover:border-blue-200 transition-all flex justify-between items-center group"
              >
                <div>
                  <h3 className="font-bold text-gray-800 text-lg">{thread.title}</h3>
                  <p className="text-sm text-gray-400 mt-1">{new Date(thread.timestamp).toLocaleString()}</p>
                </div>
                
                <div className="flex items-center gap-2 sm:gap-4">
                  {/* ✏️ 重新命名按鈕 */}
                  <button
                    onClick={(e) => handleRenameThread(e, thread.id, thread.title)}
                    className="text-gray-400 hover:text-blue-600 text-sm font-semibold p-2 rounded-xl hover:bg-blue-50 transition-colors opacity-60 group-hover:opacity-100"
                  >
                    ✏️ 改名
                  </button>
                  {/* 🗑️ 刪除按鈕 (平時透明度低，滑鼠移入卡片時變鮮豔) */}
                  <button
                    onClick={(e) => handleDeleteThread(e, thread.id)}
                    className="text-red-400 hover:text-red-600 text-sm font-semibold p-2 rounded-xl hover:bg-red-50 transition-colors opacity-60 group-hover:opacity-100"
                  >
                    🗑️ 刪除對話
                  </button>
                  <div className="text-blue-500 font-bold hidden sm:block">繼續追問 ➔</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
