"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { auth, db } from "../../lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { collection, query, where, orderBy, getDocs, addDoc, doc, writeBatch, updateDoc } from "firebase/firestore";

const SUBJECT_MAP = {
  math: { name: "📐 高中數學", color: "bg-red-600" },
  physics: { name: "🍎 高中物理", color: "bg-blue-600" },
  chemistry: { name: "🧪 高中化學", color: "bg-green-600" },
  biology: { name: "🧬 高中生物", color: "bg-purple-600" },
  earth: { name: "🌍 高中地科", color: "bg-amber-600" },
};

// 🛡️ 將邏輯組件放在外面，確保編譯時能正確初始化
function DashboardContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  
  const rawSubject = searchParams.get("subject") || "physics";
  const subject = SUBJECT_MAP[rawSubject] ? rawSubject : "physics";
  const subjectInfo = SUBJECT_MAP[subject];

  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [threads, setThreads] = useState([]);

  // 🚀 管理員判斷 (請換成你的 Email)
  const isAdmin = user?.uid === "xTpyc18UxKWQFW2gcVxGvIC7rYV2"; 

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
        subject: subject,
        title: `新題目... ${new Date().toLocaleDateString()}`,
        timestamp: Date.now()
      });
      router.push(`/chat/${threadRef.id}?subject=${subject}`);
    } catch (err) { alert("無法建立新對話"); }
  };

  // 🗑️ 刪除對話
  const handleDeleteThread = async (e, threadId) => {
    e.stopPropagation();
    if (!confirm("確定要刪除嗎？這會清空此題目的所有追問。")) return;
    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, "threads", threadId));
      const chatsQ = query(collection(db, "chats"), where("threadId", "==", threadId));
      const snapshot = await getDocs(chatsQ);
      snapshot.docs.forEach((d) => batch.delete(doc(db, "chats", d.id)));
      await batch.commit();
      setThreads(prev => prev.filter(t => t.id !== threadId));
    } catch (err) { alert("刪除失敗"); }
  };

  // ✏️ 重新命名
  const handleRenameThread = async (e, threadId, oldTitle) => {
    e.stopPropagation();
    const newTitle = prompt("請輸入新名稱：", oldTitle);
    if (!newTitle || newTitle.trim() === "" || newTitle === oldTitle) return;
    try {
      await updateDoc(doc(db, "threads", threadId), { title: newTitle });
      setThreads(prev => prev.map(t => t.id === threadId ? { ...t, title: newTitle } : t));
    } catch (err) { alert("改名失敗"); }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-gray-50">載入中...</div>;

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <header className={`${subjectInfo.color} text-white px-6 py-4 shadow-md flex justify-between items-center`}>
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/")} className="hover:opacity-80 text-xl">🏠</button>
          <h1 className="text-xl font-bold">{subjectInfo.name}</h1>
        </div>
        <div className="flex items-center gap-4">
          {/* 🚀 管理員按鈕回歸 */}
          {isAdmin && (
            <button 
              onClick={() => router.push("/admin")} 
              className="bg-white/20 hover:bg-white/40 px-3 py-1 rounded-lg text-sm font-bold border border-white/50"
            >
              ⚙️ 管理後台
            </button>
          )}
          <span className="text-sm opacity-90">{user?.displayName}</span>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6 max-w-4xl mx-auto w-full">
        <button 
          onClick={handleOpenNewThread}
          className="w-full py-4 mb-8 bg-white border-2 border-dashed border-gray-300 text-gray-600 font-bold rounded-2xl hover:border-blue-500 hover:text-blue-600 transition-all flex items-center justify-center gap-2"
        >
          ➕ 開始一個新題目
        </button>

        <div className="space-y-4">
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
              <div className="flex items-center gap-2">
                <button onClick={(e) => handleRenameThread(e, thread.id, thread.title)} className="text-gray-400 hover:text-blue-600 text-sm p-2 opacity-0 group-hover:opacity-100 transition-opacity">✏️ 改名</button>
                <button onClick={(e) => handleDeleteThread(e, thread.id)} className="text-red-300 hover:text-red-600 text-sm p-2 opacity-0 group-hover:opacity-100 transition-opacity">🗑️ 刪除</button>
                <div className="text-blue-500 font-bold ml-2">➔</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// 🎯 Default Export 必須保持簡單，僅包裹 Suspense
export default function ChatPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">載入中...</div>}>
      <DashboardContent />
    </Suspense>
  );
}
