"use client";

import { useState, useEffect } from "react";
import { auth, googleProvider, signInWithPopup, signOut } from "../lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { useRouter } from "next/navigation";

export default function Home() {
  const [user, setUser] = useState(null);
  const router = useRouter();

  // 監聽使用者的登入狀態
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  // Google 登入功能
  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("登入失敗：", error);
      alert("登入失敗，請稍後再試！");
    }
  };

  // 登出功能
  const handleLogout = async () => {
    await signOut(auth);
  };

  // 點擊科目卡片後，跳轉到對應的聊天室
  const enterClassroom = (subject) => {
    router.push(`/chat?subject=${subject}`);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center py-12 px-4 sm:px-6 lg:px-8">
      {/* 標題區 */}
      <div className="max-w-md w-full text-center mb-8">
        <h1 className="text-4xl font-extrabold text-gray-900 mb-2">
          AI 智慧教育平台
        </h1>
        <p className="text-lg text-gray-600">你的專屬全科家教，隨時在線。</p>
      </div>

      {/* 登入與導覽區塊 */}
      {!user ? (
        <div className="bg-white p-8 rounded-xl shadow-lg max-w-sm w-full text-center">
          <p className="mb-6 text-gray-600">請先登入以保存你的對話與錯題本</p>
          <button
            onClick={handleLogin}
            className="w-full flex justify-center items-center py-3 px-4 border border-transparent rounded-md shadow-sm text-lg font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none"
          >
            使用 Google 帳號登入
          </button>
        </div>
      ) : (
        <div className="w-full max-w-4xl">
          <div className="flex justify-between items-center mb-8 bg-white p-4 rounded-lg shadow">
            <div className="flex items-center gap-4">
              <img src={user.photoURL} alt="大頭貼" className="w-12 h-12 rounded-full" />
              <div>
                <p className="text-lg font-bold text-gray-900">{user.displayName}</p>
                <p className="text-sm text-gray-500">{user.email}</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="text-red-600 hover:text-red-800 font-medium"
            >
              登出
            </button>
          </div>

          <h2 className="text-2xl font-bold text-gray-800 mb-6 text-center">請選擇今天的輔導科目</h2>
          
          {/* 科目選擇卡片 */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <SubjectCard title="📐 高中數學" color="bg-red-100 text-red-700" onClick={() => enterClassroom('math')} />
            <SubjectCard title="🍎 高中物理" color="bg-blue-100 text-blue-700" onClick={() => enterClassroom('physics')} />
            <SubjectCard title="🧪 高中化學" color="bg-green-100 text-green-700" onClick={() => enterClassroom('chemistry')} />
            <SubjectCard title="🧬 高中生物" color="bg-purple-100 text-purple-700" onClick={() => enterClassroom('biology')} />
          </div>

          <div className="mt-12 text-center">
            <button 
              onClick={() => alert('錯題本功能正在建置中！')}
              className="px-8 py-4 bg-gray-800 text-white font-bold rounded-full hover:bg-gray-700 shadow-lg transition-transform hover:scale-105"
            >
              📚 進入我的錯題本
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// 產生科目卡片的獨立小元件
function SubjectCard({ title, color, onClick }) {
  return (
    <div 
      onClick={onClick}
      className={`${color} p-6 rounded-xl shadow-md cursor-pointer transform transition-transform hover:-translate-y-2 hover:shadow-xl text-center`}
    >
      <h3 className="text-xl font-bold">{title}</h3>
      <p className="mt-2 text-sm opacity-80">點擊進入教室</p>
    </div>
  );
}
