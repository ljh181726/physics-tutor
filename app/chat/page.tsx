"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { auth, db } from "../../lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { collection, query, where, orderBy, getDocs, addDoc, doc, writeBatch, updateDoc } from "firebase/firestore";

const SUBJECT_MAP = {
  math:      { name: "📐 高中數學", color: "bg-red-600", gradient: "from-rose-500 to-red-600" },
  physics:   { name: "🍎 高中物理", color: "bg-blue-600", gradient: "from-sky-500 to-blue-600" },
  chemistry: { name: "🧪 高中化學", color: "bg-green-600", gradient: "from-emerald-500 to-teal-600" },
  biology:   { name: "🧬 高中生物", color: "bg-purple-600", gradient: "from-purple-500 to-fuchsia-600" },
  earth:     { name: "🌍 高中地科", color: "bg-amber-600", gradient: "from-amber-500 to-orange-600" },
  chinese:   { name: "🏮 高中國文", color: "bg-rose-600", gradient: "from-orange-500 to-rose-600" },
  english:   { name: "🔤 高中英文", color: "bg-indigo-600", gradient: "from-indigo-500 to-violet-600" },
} as const;

function DashboardContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  
  const rawSubject = searchParams.get("subject") || "physics";
  const subject = (rawSubject in SUBJECT_MAP ? rawSubject : "physics") as keyof typeof SUBJECT_MAP;
  const subjectInfo = SUBJECT_MAP[subject];

  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [threads, setThreads] = useState<any[]>([]);

  const isAdmin = user?.email === "ljh181726@gmail.com";

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser: any) => {
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
        const history: any[] = [];
        querySnapshot.forEach((doc: any) => history.push({ id: doc.id, ...doc.data() }));
        setThreads(history);
      } catch (err: any) { 
        console.error("讀取目錄失敗：", err.message); 
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
        userName: user.displayName || "匿名同學",
        subject: subject,
        title: `新問題... ${new Date().toLocaleDateString()}`,
        timestamp: Date.now()
      });
      router.push(`/chat/${threadRef.id}?subject=${subject}`);
    } catch (err) { 
      alert("無法建立新對話"); 
    }
  };

  const handleDeleteThread = async (e: React.MouseEvent, threadId: string) => {
    e.stopPropagation();
    if (!confirm("確定要刪除嗎？這會清空此題目的所有追問。")) return;
    try {
      const batch = writeBatch(db);
      batch.doc = batch.delete(doc(db, "threads", threadId)) as any;
      const chatsQ = query(collection(db, "chats"), where("threadId", "==", threadId));
      const snapshot = await getDocs(chatsQ);
      snapshot.docs.forEach((d: any) => batch.delete(doc(db, "chats", d.id)));
      await batch.commit();
      setThreads((prev: any[]) => prev.filter((t: any) => t.id !== threadId));
    } catch (err) { 
      alert("刪除失敗"); 
    }
  };

  const handleRenameThread = async (e: React.MouseEvent, threadId: string, oldTitle: string) => {
    e.stopPropagation();
    const newTitle = prompt("請輸入新名稱：", oldTitle);
    if (!newTitle || newTitle.trim() === "" || newTitle === oldTitle) return;
    try {
      await updateDoc(doc(db, "threads", threadId), { title: newTitle.trim() });
      setThreads((prev: any[]) => prev.map((t: any) => t.id === threadId ? { ...t, title: newTitle.trim() } : t));
    } catch (err) { 
      alert("改名失敗"); 
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-slate-500 font-bold text-sm">載入討論室中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-slate-50/50">
      <header className={`bg-gradient-to-r ${subjectInfo.gradient} text-white px-6 py-4 shadow-md flex justify-between items-center z-10`}>
        <div className="flex items-center gap-4">
          <button 
            onClick={() => router.push("/")} 
            className="hover:bg-white/20 p-2 rounded-xl text-lg transition-all cursor-pointer flex items-center justify-center"
            title="回到大廳"
          >
            🏠
          </button>
          <div>
            <h1 className="text-lg font-black tracking-tight">{subjectInfo.name} 討論室</h1>
            <p className="text-[10px] opacity-75">雙擊討論區可進行編輯</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {isAdmin && (
            <button 
              onClick={() => router.push("/admin/dashboard")}
              className="bg-white/20 hover:bg-white/30 active:scale-95 px-3 py-1.5 rounded-xl text-xs font-bold border border-white/20 transition-all cursor-pointer"
            >
              ⚙️ 管理後台
            </button>
          )}
          <div className="text-right hidden sm:block">
            <p className="text-xs font-bold">{user?.displayName}</p>
            <p className="text-[9px] opacity-70">高中部學員</p>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto w-full animate-fade-in">
        {/* Banner Card */}
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-lg font-extrabold text-slate-800">歡迎回到 {subjectInfo.name} 教室</h2>
            <p className="text-xs text-slate-400 mt-1">在這裡，您可以發起任何與學科相關的提問。AI 老師將配合圖像與公式為您詳細解惑。</p>
          </div>
          <button 
            onClick={() => router.push("/notebook")}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-all cursor-pointer"
          >
            📓 錯題筆記本
          </button>
        </div>

        <button 
          onClick={handleOpenNewThread}
          className="w-full py-6 mb-6 bg-white border-2 border-dashed border-slate-200 text-slate-500 font-extrabold rounded-3xl hover:border-indigo-500 hover:text-indigo-600 hover:bg-indigo-50/10 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm active:scale-[0.99]"
        >
          <span className="text-lg">➕</span> 開始一個新題目發問
        </button>

        <div className="space-y-3">
          {threads.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-3xl border border-slate-100 text-slate-400 shadow-sm">
              <span className="text-4xl block mb-2">💡</span>
              <p className="font-bold text-sm">目前尚無提問紀錄</p>
              <p className="text-xs text-slate-400 mt-1">點擊上方按鈕開始發問吧！</p>
            </div>
          ) : (
            threads.map((thread: any) => (
              <div 
                key={thread.id} 
                onClick={() => router.push(`/chat/${thread.id}?subject=${subject}`)}
                className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm cursor-pointer hover:shadow-md hover:border-indigo-100 transition-all duration-300 flex justify-between items-center group"
              >
                <div className="flex-1 min-w-0 pr-4">
                  <h3 className="font-bold text-slate-800 text-base truncate group-hover:text-indigo-600 transition-colors">
                    {thread.title}
                  </h3>
                  <div className="flex items-center gap-2 text-slate-400 text-xs mt-1.5 font-semibold">
                    <span>📅 {new Date(thread.timestamp).toLocaleString()}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button 
                    onClick={(e: React.MouseEvent<HTMLButtonElement>) => handleRenameThread(e, thread.id, thread.title)} 
                    className="text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 p-2 rounded-xl text-xs sm:opacity-0 group-hover:opacity-100 transition-all duration-300 cursor-pointer"
                    title="重新命名"
                  >
                    ✏️ 改名
                  </button>
                  <button 
                    onClick={(e: React.MouseEvent<HTMLButtonElement>) => handleDeleteThread(e, thread.id)} 
                    className="text-slate-400 hover:text-rose-600 hover:bg-rose-50 p-2 rounded-xl text-xs sm:opacity-0 group-hover:opacity-100 transition-all duration-300 cursor-pointer"
                    title="刪除對話"
                  >
                    🗑️ 刪除
                  </button>
                  <div className="text-indigo-500 font-black ml-1 group-hover:translate-x-1 transition-transform">➔</div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">載入中...</div>}>
      <DashboardContent />
    </Suspense>
  );
}
