"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { auth, db } from "../../lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { collection, addDoc, query, where, orderBy, getDocs, doc, writeBatch } from "firebase/firestore";

const SUBJECT_MAP = {
  // ... 同之前
};

export default function ChatPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-500">載入目錄中...</div>}>
      <DashboardContent />
    </Suspense>
  );
}

function DashboardContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const subject = searchParams.get("subject") || "physics";
  const subjectInfo = SUBJECT_MAP[subject] || SUBJECT_MAP["physics"];

  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [threads, setThreads] = useState([]);

  // 1. 讀取這個科目下所有的「對話執行緒」
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) return router.push("/");
      setUser(currentUser);
      
      try {
        const q = query(
          collection(db, "threads"), // 我們現在從 threads 集合抓資料
          where("uid", "==", currentUser.uid),
          where("subject", "==", subject),
          orderBy("timestamp", "desc")
        );
        const querySnapshot = await getDocs(q);
        const history = [];
        querySnapshot.forEach((doc) => history.push({ id: doc.id, ...doc.data() }));
        setThreads(history);
      } catch (err) { console.error("讀取題目目錄失敗：", err.message); }
      setLoading= (false);
    });
    return () => unsubscribe();
  }, [subject, router]);

  // 核心功能：開啟新題目
  const handleOpenNewThread = async () => {
    if (!user) return;
    try {
      // 1. 在 Firestore threads 資料集建立一個空白執行緒
      const threadRef = await addDoc(collection(db, "threads"), {
        uid: user.uid,
        subject: subject,
        title: `新題目... ${new Date().toLocaleDateString()}`,
        timestamp: Date.now()
      });
      // 2. 跳轉到這個專屬房間 (注意路徑)
      router.push(`/chat/${threadRef.id}?subject=${subject}`);
    } catch (err) { alert("無法建立新題目室：" + err.message); }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center">確認目錄中...</div>;

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <header className={`${subjectInfo.color} text-white px-6 py-4 shadow-md flex justify-between items-center`}>
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/")} className="hover:opacity-80 text-xl">🏠</button>
          <h1 className="text-xl font-bold">{subjectInfo.name} 題目目錄</h1>
        </div>
        <span className="text-sm opacity-90">{user?.displayName} 同學</span>
      </header>

      {/* 題目目錄區 */}
      <div className="flex-1 overflow-y-auto p-6 max-w-4xl mx-auto w-full">
        {/* 開啟新題目按鈕 */}
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
                className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 cursor-pointer hover:shadow-md hover:border-blue-200 transition-all flex justify-between items-center"
              >
                <div>
                  <h3 className="font-bold text-gray-800 text-lg">{thread.title}</h3>
                  <p className="text-sm text-gray-400 mt-1">{new Date(thread.timestamp).toLocaleString()}</p>
                </div>
                <div className="text-blue-500 font-bold">繼續追問 ➔</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
