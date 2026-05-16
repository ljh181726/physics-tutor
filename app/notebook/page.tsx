"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "../../lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { collection, query, getDocs, orderBy, deleteDoc, doc, writeBatch } from "firebase/firestore";

export default function NotebookPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [wrongQuestions, setWrongQuestions] = useState([]);
  const [loading, setLoading] = useState(true);

  // --- 新增：選取模式相關狀態 ---
  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        router.push("/");
      } else {
        setUser(currentUser);
        await fetchNotebook(currentUser.uid);
      }
    });
    return () => unsubscribe();
  }, [router]);

  const fetchNotebook = async (uid) => {
    try {
      const q = query(collection(db, `users/${uid}/wrong_questions`), orderBy("timestamp", "desc"));
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setWrongQuestions(data);
    } catch (err) {
      console.error("讀取失敗：", err);
    } finally {
      setLoading(false);
    }
  };

  // --- 核心功能：切換選取狀態 ---
  const toggleSelect = (id) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  // --- 核心功能：刪除選取的題目 ---
  const deleteSelected = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`確定要刪除這 ${selectedIds.size} 個題目嗎？刪除後無法復原。`)) return;

    try {
      const batch = writeBatch(db);
      selectedIds.forEach((id) => {
        const docRef = doc(db, `users/${user.uid}/wrong_questions`, id);
        batch.delete(docRef);
      });
      
      await batch.commit();

      // 更新本地 UI
      setWrongQuestions(prev => prev.filter(item => !selectedIds.has(item.id)));
      setSelectedIds(new Set());
      setIsEditMode(false);
      alert("已成功刪除！");
    } catch (err) {
      alert("刪除失敗：" + err.message);
    }
  };

  // --- 核心功能：單題刪除 ---
  const deleteSingle = async (id) => {
    if (!confirm("確定要刪除這一題嗎？")) return;
    try {
      await deleteDoc(doc(db, `users/${user.uid}/wrong_questions`, id));
      setWrongQuestions(prev => prev.filter(item => item.id !== id));
      alert("已刪除！");
    } catch (err) {
      alert("刪除失敗");
    }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center">載入中...</div>;

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-4xl mx-auto">
        
        {/* 上方標題與按鈕區 */}
        <header className="flex flex-col md:flex-row md:items-end justify-between mb-10 gap-4">
          <div>
            <h1 className="text-3xl font-extrabold text-gray-900">📚 我的錯題本</h1>
            <p className="text-gray-500 mt-2">點擊「編輯」可進行批次刪除。</p>
          </div>
          <div className="flex gap-3">
            {!isEditMode ? (
              <>
                <button onClick={() => setIsEditMode(true)} className="px-5 py-2.5 bg-white border border-gray-300 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 shadow-sm">編輯</button>
                <button onClick={() => router.push("/")} className="px-5 py-2.5 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 shadow-sm">🏠 返回大廳</button>
              </>
            ) : (
              <>
                <button onClick={deleteSelected} disabled={selectedIds.size === 0} className={`px-5 py-2.5 font-semibold rounded-xl text-white ${selectedIds.size > 0 ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-300'}`}>刪除已選 ({selectedIds.size})</button>
                <button onClick={() => { setIsEditMode(false); setSelectedIds(new Set()); }} className="px-5 py-2.5 bg-gray-200 text-gray-700 font-semibold rounded-xl hover:bg-gray-300">取消</button>
              </>
            )}
          </div>
        </header>

        {wrongQuestions.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-3xl shadow-sm border border-gray-100">
            <span className="text-6xl">🌟</span>
            <h2 className="text-xl font-bold text-gray-700 mt-6">沒有錯題囉！</h2>
          </div>
        ) : (
          <div className="grid gap-6">
            {wrongQuestions.map((item) => (
              <div 
                key={item.id} 
                onClick={() => isEditMode && toggleSelect(item.id)}
                className={`bg-white rounded-3xl shadow-sm border-2 transition-all overflow-hidden ${
                  isEditMode ? 'cursor-pointer' : ''
                } ${selectedIds.has(item.id) ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-100'}`}
              >
                <div className="px-6 py-4 bg-gray-50 border-b border-gray-100 flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    {/* 選擇框 */}
                    {isEditMode && (
                      <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${selectedIds.has(item.id) ? 'bg-blue-600 border-blue-600' : 'border-gray-300 bg-white'}`}>
                        {selectedIds.has(item.id) && <span className="text-white text-xs">✓</span>}
                      </div>
                    )}
                    <span className="text-sm font-bold px-3 py-1 bg-blue-100 text-blue-700 rounded-full">{item.subject}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-xs text-gray-400 font-mono">{new Date(item.timestamp).toLocaleDateString()}</span>
                    {!isEditMode && (
                      <button onClick={(e) => { e.stopPropagation(); deleteSingle(item.id); }} className="text-red-400 hover:text-red-600 text-sm">🗑️ 刪除</button>
                    )}
                  </div>
                </div>

                <div className="p-6">
                  <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-2">我的提問</h3>
                  <div className="text-gray-800 font-medium mb-4">{item.question}</div>
                  <hr className="my-4 border-gray-50" />
                  <h3 className="text-xs font-black text-blue-400 uppercase tracking-widest mb-2">老師詳解</h3>
                  <div className="text-gray-700 whitespace-pre-wrap text-sm leading-relaxed">
                    {item.answer}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
