"use client";

import { useRouter } from "next/navigation";

export default function NotebookPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <div className="bg-white p-8 rounded-2xl shadow-xl text-center max-w-md w-full">
        <div className="text-6xl mb-4">📚</div>
        <h1 className="text-2xl font-bold text-gray-800 mb-2">我的錯題本</h1>
        <p className="text-gray-600 mb-6">
          這裡將會存放你所有標記過的難題與 AI 老師的詳解。
          功能開發中，敬請期待！
        </p>
        <button
          onClick={() => router.push("/")}
          className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-colors"
        >
          返回大廳
        </button>
      </div>
    </div>
  );
}
