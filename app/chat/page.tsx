"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { auth, db } from "../../lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { collection, query, where, orderBy, getDocs, addDoc } from "firebase/firestore";

const SUBJECT_MAP = {
  math: { name: "📐 高中數學", color: "bg-red-600", light: "bg-red-50" },
  physics: { name: "🍎 高中物理", color: "bg-blue-600", light: "bg-blue-50" },
  chemistry: { name: "🧪 高中化學", color: "bg-green-600", light: "bg-green-50" },
  biology: { name: "🧬 高中生物", color: "bg-purple-600", light: "bg-purple-50" },
  earth: { name: "🌍 高中地科", color: "bg-amber-600", light: "bg-amber-50" },
};

export default function ChatDashboard() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">載入中...</div>}>
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
  const [threads, setThreads] = useState([]);
  const [loading, setLoading] = useState(true);

  // 讀取該科目的所有「討論串」
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        router.push("/");
      } else {
        setUser(currentUser);
        try {
          // 我們現在讀取的是 threads (討論串) 而不是單筆訊息
          const q = query(
            collection(db, "threads"),
            where("uid", "==", currentUser.uid),
            where("subject", "==", subject),
            orderBy("timestamp", "desc")
          );
          const snapshot = await getDocs(q);
          const history = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          setThreads(history);
        } catch (err) {
          console.error("讀取目錄失敗：", err);
        }
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [subject, router]);

  // 建立新題目
  const handleCreateNewThread = async () => {
    if (!user) return;
    try {
      // 建立一個空的討論串
      const threadRef = await addDoc(collection(db, "threads"), {
        uid: user.uid,
        subject: subject,
        title: "新問題...",
        timestamp: Date.now()
      });
      // 跳轉到這個專屬聊天室
      router.push(`/chat/${threadRef.id}?subject=${subject}`);
    } catch (err) {
      alert("無法建立新問題：" + err.message);
    }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center">載入目錄中...</div>;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className={`${subjectInfo.color} text-white px-6 py-4 shadow-md flex justify-between items-center`}>
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/")} className="hover:opacity-80 text-xl">🏠</button>
          <h1 className="text-xl font-bold">{subjectInfo.name} 題目列表</h1>
        </div>
        <span className="text-sm opacity-90">{user?.displayName}</span>
      </header>

      <div className="flex-1 p-6 max-w-4xl mx-auto w-full">
        {/* 新增問題大按鈕 */}
        <button 
          onClick={handleCreateNewThread}
          className="w-full py-4 mb-8 bg-white border-2 border-dashed border-gray-300 text-gray-600 font-bold rounded-2xl hover:border-blue-500 hover:text-blue-600 transition-colors shadow-sm flex items-center justify-center gap-2"
        >
          <span className="text-2xl">➕</span> 開始發問新題目
        </button>

        <h2 className="text-lg font-bold text-gray-700 mb-4">歷史提問紀錄</h2>
        
        {threads.length === 0 ? (
          <div className="text-center py-10 text-gray-400">目前還沒有問過任何問題喔！</div>
        ) : (
          <div className="grid gap-4">
            {threads.map((thread) => (
              <div 
                key={thread.id} 
                onClick={() => router.push(`/chat/${thread.id}?subject=${subject}`)}
                className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 cursor-pointer hover:shadow-md hover:border-blue-200 transition-all flex justify-between items-center"
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
