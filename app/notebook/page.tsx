"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "../../lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { collection, query, getDocs, orderBy } from "firebase/firestore";

export default function NotebookPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [wrongQuestions, setWrongQuestions] = useState([]);
  const [loading, setLoading] = useState(true);

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
      const q = query(
        collection(db, `users/${uid}/wrong_questions`),
        orderBy("timestamp", "desc")
      );
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setWrongQuestions(data);
    } catch (err) {
      console.error("讀取錯題本失敗：", err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center">載入個人資料中...</div>;

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-4xl mx-auto">
        <header className="flex justify-between items-center mb-10">
          <div>
            <h1 className="text-3xl font-extrabold text-gray-900">📚 {user?.displayName} 的個人錯題本</h1>
            <p className="text-gray-500 mt-2">記錄每一題挑戰，讓學習更有跡可循。</p>
          </div>
          <button onClick={() => router.push("/")} className="px-5 py-2.5 bg-white border border-gray-300 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 shadow-sm transition-all">🏠 返回大廳</button>
        </header>

        {wrongQuestions.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-3xl shadow-sm border border-gray-100">
            <span className="text-6xl">🌟</span>
            <h2 className="text-xl font-bold text-gray-700 mt-6">這裡還是空的唷！</h2>
            <p className="text-gray-400 mt-2">在聊天室點擊星星按鈕，即可將重要的題目存入這裡。</p>
          </div>
        ) : (
          <div className="grid gap-8">
            {wrongQuestions.map((item) => (
              <div key={item.id} className="bg-white rounded-3xl shadow-sm border border-gray-200 overflow-hidden flex flex-col">
                {/* 卡片標題：科目與時間 */}
                <div className="px-6 py-4 bg-gray-50 border-b border-gray-100 flex justify-between items-center">
                  <span className="text-sm font-bold px-3 py-1 bg-blue-100 text-blue-700 rounded-full">
                    {item.subject === 'physics' ? '高中物理' : item.subject === 'math' ? '高中數學' : item.subject}
                  </span>
                  <span className="text-xs text-gray-400 font-mono">
                    {new Date(item.timestamp).toLocaleString()}
                  </span>
                </div>

                <div className="p-6 space-y-6">
                  {/* 使用者提問部分 */}
                  <section>
                    <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3">我的提問</h3>
                    <div className="text-gray-800 font-medium leading-relaxed">
                      {item.question}
                    </div>
                    {item.images && item.images.map((img, i) => (
                      <img key={i} src={img} alt="題目照片" className="mt-4 rounded-xl max-h-64 border border-gray-100 shadow-sm" />
                    ))}
                  </section>

                  <hr className="border-gray-100" />

                  {/* AI 老師解答部分 */}
                  <section>
                    <h3 className="text-xs font-black text-blue-400 uppercase tracking-widest mb-3">AI 老師詳解</h3>
                    <div className="text-gray-700 leading-relaxed whitespace-pre-wrap">
                      {item.answer && item.answer.includes("<svg") ? (
                        <div dangerouslySetInnerHTML={{ __html: item.answer }} className="py-2" />
                      ) : (
                        item.answer
                      )}
                    </div>
                  </section>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
