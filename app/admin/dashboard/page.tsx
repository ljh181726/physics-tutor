"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "../../../lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { collection, addDoc, query, orderBy, getDocs, deleteDoc, doc, where } from "firebase/firestore";

export default function AdminPage() {
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);
  const [knowledgeList, setKnowledgeList] = useState([]);
  
  // 表單狀態
  const [subject, setSubject] = useState("physics");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      // 🚀 關鍵修改：改成用 UID 判斷
      const ADMIN_UID = "你的管理員UID_請貼在這裡"; 
      
      if (!currentUser || currentUser.uid !== ADMIN_UID) {
        alert("無權限訪問！");
        return router.push("/");
      }
      setIsAdmin(true);
      fetchKnowledge();
    });
    return () => unsubscribe();
  }, [router]);

  const fetchKnowledge = async () => {
    try {
      const q = query(collection(db, "knowledge_base"), orderBy("timestamp", "desc"));
      const snapshot = await getDocs(q);
      setKnowledgeList(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    } catch (err) { console.error("讀取知識庫失敗", err); }
  };

  const handleSaveKnowledge = async (e) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return alert("標題和內容不能為空");
    setIsSaving(true);
    try {
      await addDoc(collection(db, "knowledge_base"), {
        subject, title, content, timestamp: Date.now()
      });
      alert("✅ 講義知識已存入！");
      setTitle(""); setContent("");
      fetchKnowledge();
    } catch (err) {
      alert("❌ 儲存失敗：" + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("確定刪除這筆知識點嗎？")) return;
    try {
      await deleteDoc(doc(db, "knowledge_base", id));
      setKnowledgeList(prev => prev.filter(k => k.id !== id));
    } catch (err) { alert("刪除失敗"); }
  };

  if (!isAdmin) return <div className="min-h-screen flex items-center justify-center">驗證身分中...</div>;

  return (
    <div className="min-h-screen bg-gray-50 p-6 md:p-12">
      <div className="max-w-5xl mx-auto">
        <header className="flex justify-between items-center mb-10">
          <h1 className="text-3xl font-extrabold text-gray-800">⚙️ 老師的專屬大腦 (講義庫)</h1>
          <button onClick={() => router.push("/")} className="bg-gray-800 text-white px-4 py-2 rounded-lg">返回大廳</button>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* 左側：新增知識表單 */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 h-fit">
            <h2 className="text-xl font-bold mb-4">➕ 新增知識點</h2>
            <form onSubmit={handleSaveKnowledge} className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">科目</label>
                <select value={subject} onChange={e => setSubject(e.target.value)} className="w-full border rounded-lg p-2">
                  <option value="physics">🍎 物理</option>
                  <option value="math">📐 數學</option>
                  <option value="chemistry">🧪 化學</option>
                  <option value="biology">🧬 生物</option>
                  <option value="earth">🌍 地科</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">知識點標題 (例如：摩擦力解題三步驟)</label>
                <input type="text" value={title} onChange={e => setTitle(e.target.value)} className="w-full border rounded-lg p-2" placeholder="輸入標題..." />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">講義內容 / 解題心法</label>
                <textarea value={content} onChange={e => setContent(e.target.value)} className="w-full border rounded-lg p-2 h-48" placeholder="例如：遇到斜面問題，第一步先畫力圖，第二步分解重力..." />
              </div>
              <button type="submit" disabled={isSaving} className="w-full bg-blue-600 text-white font-bold py-3 rounded-lg hover:bg-blue-700 transition-colors">
                {isSaving ? "儲存中..." : "存入 AI 大腦"}
              </button>
            </form>
          </div>

          {/* 右側：已儲存的知識庫 */}
          <div className="lg:col-span-2 space-y-4">
            <h2 className="text-xl font-bold mb-4">📚 已載入的知識 ({knowledgeList.length} 筆)</h2>
            {knowledgeList.map(item => (
              <div key={item.id} className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex flex-col gap-2">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-xs font-bold px-2 py-1 bg-blue-100 text-blue-700 rounded mr-2">{item.subject}</span>
                    <span className="font-bold text-gray-800">{item.title}</span>
                  </div>
                  <button onClick={() => handleDelete(item.id)} className="text-red-400 hover:text-red-600 text-sm">🗑️</button>
                </div>
                <p className="text-sm text-gray-600 line-clamp-3 mt-2 whitespace-pre-wrap">{item.content}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
