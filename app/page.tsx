"use client";

import { useState, useEffect } from "react";
import { auth, googleProvider, signInWithPopup, signOut } from "../lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { useRouter } from "next/navigation";

// 🚀 關鍵：把這裡換成你剛剛在 Firebase 複製的 UID
const ADMIN_UID = "xTpyc18UxKWQFW2gcVxGvIC7rYV2";

export default function Home() {
  const [user, setUser] = useState(null);
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("登入失敗：", error);
      alert("登入失敗，請稍後再試！");
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
  };

  const enterClassroom = (subject) => {
    router.push(`/chat?subject=${subject}`);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full text-center mb-8">
        <h1 className="text-4xl font-extrabold text-gray-900 mb-2">AI 智慧教育平台</h1>
        <p className="text-lg text-gray-600">你的專屬全科ai，隨時在線。</p>
      </div>

      {!user ? (
        <div className="bg-white p-8 rounded-xl shadow-lg max-w-sm w-full text-center">
          <p className="mb-6 text-gray-600">請先登入以保存你的對話與錯題本</p>
          <button onClick={handleLogin} className="w-full flex justify-center items-center py-3 px-4 border border-transparent rounded-md shadow-sm text-lg font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none">
            使用 Google 帳號登入
          </button>
        </div>
      ) : (
        <div className="w-full max-w-4xl">
          <div className="flex justify-between items-center mb-8 bg-white p-4 rounded-lg shadow border border-gray-100">
            <div className="flex items-center gap-4">
              <img src={user.photoURL} alt="大頭貼" className="w-12 h-12 rounded-full border-2 border-gray-200" />
              <div>
                <p className="text-lg font-bold text-gray-900">{user.displayName}</p>
                <p className="text-sm text-gray-500">{user.email}</p>
              </div>
            </div>
            <button onClick={handleLogout} className="text-red-600 hover:text-red-800 font-medium px-4 py-2 bg-red-50 rounded-lg">登出</button>
          </div>

          <h2 className="text-2xl font-bold text-gray-800 mb-6 text-center">請選擇今天想提問科目</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <SubjectCard title="📐 高中數學" color="bg-red-50 text-red-700 border-red-200" onClick={() => enterClassroom('math')} />
            <SubjectCard title="🍎 高中物理" color="bg-blue-50 text-blue-700 border-blue-200" onClick={() => enterClassroom('physics')} />
            <SubjectCard title="🧪 高中化學" color="bg-green-50 text-green-700 border-green-200" onClick={() => enterClassroom('chemistry')} />
            <SubjectCard title="🧬 高中生物" color="bg-purple-50 text-purple-700 border-purple-200" onClick={() => enterClassroom('biology')} />
          </div>

          <div className="mt-12 text-center space-x-4">
            <button onClick={() => router.push('/notebook')} className="px-8 py-4 bg-gray-800 text-white font-bold rounded-xl hover:bg-gray-700 shadow-lg transition-transform hover:scale-105">
              📚 進入我的錯題本
            </button>
            
            {/* 🛡️ 隱藏的門：只有你的 UID 會看到這個按鈕 */}
            {user.uid === ADMIN_UID && (
              <button onClick={() => router.push('/admin/dashboard')} className="px-8 py-4 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 shadow-lg transition-transform hover:scale-105 border-2 border-red-800">
                🛡️ 進入管理員數據中心
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SubjectCard({ title, color, onClick }) {
  return (
    <div onClick={onClick} className={`${color} p-6 border-2 rounded-2xl cursor-pointer transform transition-all hover:-translate-y-1 hover:shadow-md text-center`}>
      <h3 className="text-xl font-bold">{title}</h3>
      <p className="mt-2 text-sm font-medium opacity-80">點擊進入教室</p>
    </div>
  );
}
