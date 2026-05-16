"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { auth, db } from "../../lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { collection, query, where, orderBy, getDocs, addDoc } from "firebase/firestore";

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
  const searchParams = useSearchParams();
  const router = useRouter();
  
  // 🛡️ 防禦防護：如果參數是空的，或者亂打，一律強制當作物理 physics
  const rawSubject = searchParams.get("subject") || "physics";
  const subject = SUBJECT_MAP[rawSubject] ? rawSubject : "physics";
  const subjectInfo = SUBJECT_MAP[subject];

  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [threads, setThreads] = useState([]);

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
