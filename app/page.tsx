"use client";

import { useState, useEffect } from "react";
import { auth, googleProvider, signInWithPopup, signOut } from "../lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { useRouter } from "next/navigation";

// 🚀 關鍵：保留 Firebase 管理員 UID
const ADMIN_UID = "xTpyc18UxKWQFW2gcVxGvIC7rYV2";

export default function Home() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser: any) => {
      setUser(currentUser);
      setLoading(false);
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

  const enterClassroom = (subject: string) => {
    router.push(`/chat?subject=${subject}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-slate-500 font-bold text-sm">正在載入智慧大廳...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-100 flex flex-col justify-between py-12 px-4 sm:px-6 lg:px-8">
      {/* SEO Title & Meta tags inside Next.js are typically in layout, but let's use document title as well */}
      <title>AI 智慧全科教育平台 - 專屬AI家教</title>

      <div className="max-w-5xl w-full mx-auto flex-1 flex flex-col justify-center">
        {/* Header Hero Area */}
        <div className="text-center mb-10 animate-fade-in">
          <span className="px-3 py-1 bg-indigo-50 text-indigo-700 rounded-full text-xs font-bold uppercase tracking-wider border border-indigo-200">
            🤖 NextGen AI Tutor
          </span>
          <h1 id="main-title" className="text-4xl sm:text-5xl font-black text-slate-900 mt-4 mb-2 tracking-tight">
            AI 智慧教育大廳
          </h1>
          <p className="text-base sm:text-lg text-slate-500 max-w-lg mx-auto">
            專為高中生打造的 24H 隨身智慧家教。點選科目，即可進入獨立課堂發問與繪圖。
          </p>
        </div>

        {!user ? (
          /* Login Card */
          <div className="w-full max-w-md mx-auto bg-white/80 backdrop-blur-md p-8 rounded-3xl shadow-xl border border-slate-100/50 text-center animate-fade-in">
            <div className="mb-6">
              <span className="text-5xl">🎓</span>
            </div>
            <h3 className="text-xl font-extrabold text-slate-800 mb-2">開始你的個人化學習</h3>
            <p className="text-sm text-slate-500 mb-6">
              使用 Google 帳號登入後，系統將自動記錄您的對話、錯題本，並根據您的學習弱點投放專屬心法。
            </p>
            <button
              id="btn-login-google"
              onClick={handleLogin}
              className="w-full flex justify-center items-center gap-3 py-3.5 px-4 rounded-2xl shadow-md text-base font-bold text-white bg-slate-900 hover:bg-indigo-600 active:scale-95 transition-all cursor-pointer"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M12.24 10.285V14.4h6.887c-.275 1.565-1.88 4.604-6.887 4.604-4.33 0-7.866-3.577-7.866-8s3.536-8 7.866-8c2.46 0 4.105 1.025 5.047 1.926l3.227-3.107C18.29 1.845 15.547 1 12.24 1 5.922 1 1 5.92 1 12.2s4.922 11.2 11.24 11.2c6.6 0 11-4.64 11-11.2 0-.756-.08-1.333-.178-1.915H12.24Z"
                />
              </svg>
              使用 Google 帳號登入
            </button>
          </div>
        ) : (
          /* Main Dashboard */
          <div className="w-full space-y-8 animate-fade-in">
            {/* User Profile Bar */}
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-white/70 backdrop-blur-md p-4 sm:p-6 rounded-3xl shadow-sm border border-slate-100">
              <div className="flex items-center gap-4">
                <img
                  src={user.photoURL || "https://api.dicebear.com/7.x/adventurer/svg"}
                  alt="大頭貼"
                  className="w-14 h-14 rounded-full border-2 border-indigo-100 shadow-inner"
                />
                <div className="text-center sm:text-left">
                  <div className="flex items-center gap-2 justify-center sm:justify-start">
                    <p className="text-lg font-bold text-slate-800">{user.displayName || "同學"}</p>
                    <span className="bg-indigo-50 text-indigo-700 text-xs px-2.5 py-0.5 rounded-full font-bold">正式學員</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">{user.email}</p>
                </div>
              </div>
              <button
                id="btn-logout"
                onClick={handleLogout}
                className="text-slate-400 hover:text-rose-600 font-bold px-4 py-2 hover:bg-rose-50 rounded-xl transition-all cursor-pointer text-sm"
              >
                安全登出
              </button>
            </div>

            {/* Subject Selector Header */}
            <div>
              <h2 className="text-xl font-extrabold text-slate-800 mb-5 flex items-center gap-2">
                <span>🏫</span> 點選科目進入專屬教室
              </h2>

              {/* Subject Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                <SubjectCard
                  title="📐 高中數學"
                  desc="函數、幾何、微積分與機率"
                  color="bg-red-50/80 hover:bg-red-100/90 text-red-700 border-red-200"
                  icon="📐"
                  gradient="from-rose-400 to-red-500"
                  onClick={() => enterClassroom("math")}
                />
                <SubjectCard
                  title="🍎 高中物理"
                  desc="力學、電磁、熱學與光路分析"
                  color="bg-blue-50/80 hover:bg-blue-100/90 text-blue-700 border-blue-200"
                  icon="🍎"
                  gradient="from-sky-400 to-blue-500"
                  onClick={() => enterClassroom("physics")}
                />
                <SubjectCard
                  title="🧪 高中化學"
                  desc="平衡、能階、電池與有機反應"
                  color="bg-emerald-50/80 hover:bg-emerald-100/90 text-emerald-700 border-emerald-200"
                  icon="🧪"
                  gradient="from-emerald-400 to-teal-500"
                  onClick={() => enterClassroom("chemistry")}
                />
                <SubjectCard
                  title="🧬 高中生物"
                  desc="細胞構造、生理機制與遺傳圖譜"
                  color="bg-purple-50/80 hover:bg-purple-100/90 text-purple-700 border-purple-200"
                  icon="🧬"
                  gradient="from-purple-400 to-fuchsia-500"
                  onClick={() => enterClassroom("biology")}
                />
                <SubjectCard
                  title="🌍 高中地科"
                  desc="天球坐標、板塊構造與氣候變遷"
                  color="bg-amber-50/80 hover:bg-amber-100/90 text-amber-700 border-amber-200"
                  icon="🌍"
                  gradient="from-amber-400 to-orange-500"
                  onClick={() => enterClassroom("earth")}
                />
                <SubjectCard
                  title="🏮 高中國文"
                  desc="文言文解讀、古詩詞意與作文指引"
                  color="bg-rose-50/80 hover:bg-rose-100/90 text-rose-700 border-rose-200"
                  icon="🏮"
                  gradient="from-orange-400 to-rose-600"
                  onClick={() => enterClassroom("chinese")}
                />
                <SubjectCard
                  title="🔤 高中英文"
                  desc="句型文法、單字剖析與閱讀理解"
                  color="bg-indigo-50/80 hover:bg-indigo-100/90 text-indigo-700 border-indigo-200"
                  icon="🔤"
                  gradient="from-indigo-400 to-violet-600"
                  onClick={() => enterClassroom("english")}
                />
              </div>
            </div>

            {/* Quick Actions Footer */}
            <div className="pt-6 border-t border-slate-100 flex flex-wrap gap-4 justify-center">
              <button
                id="btn-notebook"
                onClick={() => router.push("/notebook")}
                className="flex items-center gap-2 px-8 py-4 bg-slate-900 text-white font-bold rounded-2xl hover:bg-indigo-600 active:scale-95 transition-all shadow-md cursor-pointer text-sm"
              >
                <span>📚</span> 進入我的錯題本
              </button>

              {/* 🛡️ 隱藏的門：只有你的 UID 會看到這個按鈕 */}
              {user.uid === ADMIN_UID && (
                <button
                  id="btn-admin-dashboard"
                  onClick={() => router.push("/admin/dashboard")}
                  className="flex items-center gap-2 px-8 py-4 bg-rose-600 text-white font-bold rounded-2xl hover:bg-rose-700 active:scale-95 transition-all shadow-md border border-rose-700 cursor-pointer text-sm"
                >
                  <span>🛡️</span> 進入導師數據大盤
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer Branding */}
      <footer className="text-center text-xs text-slate-400 mt-12">
        <p>© 2026 AI 智慧全科教育平台. All rights reserved.</p>
        <p className="mt-1">結合 Kroki TikZ 精準渲染與 Gemini 3.1 核心理解引擎</p>
      </footer>
    </div>
  );
}

interface SubjectCardProps {
  title: string;
  desc: string;
  color: string;
  icon: string;
  gradient: string;
  onClick: () => void;
}

function SubjectCard({ title, desc, color, icon, gradient, onClick }: SubjectCardProps) {
  return (
    <div
      onClick={onClick}
      className={`${color} p-5 border rounded-2xl cursor-pointer transform transition-all duration-300 hover:-translate-y-1 hover:shadow-lg flex flex-col justify-between h-36`}
    >
      <div className="flex justify-between items-start">
        <span className={`w-8 h-8 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center text-white shadow-sm text-sm`}>
          {icon}
        </span>
        <span className="text-[10px] uppercase font-bold tracking-wider opacity-60">進入教室</span>
      </div>
      <div>
        <h3 className="text-lg font-black">{title}</h3>
        <p className="text-xs font-semibold opacity-75 mt-1 line-clamp-1">{desc}</p>
      </div>
    </div>
  );
}
