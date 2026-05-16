"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "../../../lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { collection, query, getDocs, orderBy } from "firebase/firestore";

// 🚀 一樣，這裡要填入你的 UID 當作雙重保險
const ADMIN_UID = "YOUR_ADMIN_UID_請替換成你的";

export default function AdminDashboard() {
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);
  const [vaultData, setVaultData] = useState([]);
  const [loading, setLoading] = useState(true);

  // 1. 嚴格驗證身分
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user || user.uid !== ADMIN_UID) {
        alert("權限不足！");
        router.push("/");
      } else {
        setIsAdmin(true);
        await fetchCommunityVault();
      }
    });
    return () => unsubscribe();
  }, [router]);

  // 2. 抓取全校的錯題資料
  const fetchCommunityVault = async () => {
    try {
      const q = query(collection(db, "community_vault"), orderBy("timestamp", "desc"));
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setVaultData(data);
    } catch (err) {
      console.error("無法讀取全校數據：", err);
    } finally {
      setLoading(false);
    }
  };

  if (!isAdmin || loading) return <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">驗證安全憑證中...</div>;

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 py-10 px-4 sm:px-6">
      <div className="max-w-6xl mx-auto">
        <header className="flex justify-between items-center mb-10 border-b border-gray-700 pb-6">
          <div>
            <h1 className="text-3xl font-black text-white flex items-center gap-3">
              🛡️ 平台總管理中心
            </h1>
            <p className="text-gray-400 mt-2">上帝視角：查看全校學生的學習盲點與錯題庫。</p>
          </div>
          <button onClick={() => router.push("/")} className="px-5 py-2 bg-gray-800 hover:bg-gray-700 text-white font-medium rounded-lg transition-colors border border-gray-600">
            返回大廳
          </button>
        </header>

        {/* 總覽數據小卡 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
          <div className="bg-gray-800 p-6 rounded-2xl border border-gray-700 shadow-lg">
            <p className="text-gray-400 font-medium mb-1">全校累計錯題總數</p>
            <p className="text-5xl font-black text-blue-400">{vaultData.length}</p>
          </div>
        </div>

        {/* 錯題清單表格 */}
        <div className="bg-gray-800 rounded-2xl shadow-xl border border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-950 text-gray-400 text-sm tracking-wider uppercase">
                  <th className="p-4 font-semibold">時間</th>
                  <th className="p-4 font-semibold">學生姓名</th>
                  <th className="p-4 font-semibold">科目</th>
                  <th className="p-4 font-semibold w-1/3">原始問題</th>
                  <th className="p-4 font-semibold text-center">附圖</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700 text-gray-300">
                {vaultData.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-750 transition-colors">
                    <td className="p-4 whitespace-nowrap text-sm text-gray-400">
                      {new Date(item.timestamp).toLocaleDateString()}
                    </td>
                    <td className="p-4 font-medium text-white flex items-center gap-2">
                      👤 {item.userName}
                    </td>
                    <td className="p-4">
                      <span className="px-3 py-1 bg-gray-700 text-xs rounded-full border border-gray-600 font-semibold">
                        {item.subject}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="max-w-xs truncate" title={item.question}>
                        {item.question}
                      </div>
                    </td>
                    <td className="p-4 text-center">
                      {item.images && item.images.length > 0 ? "📷 有" : "-"}
                    </td>
                  </tr>
                ))}
                {vaultData.length === 0 && (
                  <tr>
                    <td colSpan="5" className="p-10 text-center text-gray-500">
                      目前社群庫還沒有任何錯題紀錄喔！
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
