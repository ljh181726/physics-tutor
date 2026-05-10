'use client'; // 標示為前端元件

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import 'katex/dist/katex.min.css'; // 確保 LaTeX 樣式正常顯示

export default function Home() {
  // --- 1. 狀態定義 (必須在函數內部的最上方) ---
  const [password, setPassword] = useState('');
  const [isLocked, setIsLocked] = useState(true);
  const [prompt, setPrompt] = useState('');
  const [imageBase64, setImageBase64] = useState('');
  const [aiResponseText, setAiResponseText] = useState('老師正在等你的問題...');
  const [isLoading, setIsLoading] = useState(false);

  // --- 2. 邏輯處理函數 ---
  
  // 檢查密碼
  const handleLogin = () => {
    // 這裡設定你想要的密碼，例如 "8888"
    if (password === "8888") { 
      setIsLocked(false);
    } else {
      alert("密碼錯誤，請重新輸入！");
    }
  };

  // 處理圖片上傳
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImageBase64(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // 處理表單送出
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setAiResponseText('思考與解題中，請稍候...');

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, imageBase64 }),
      });
      
      const data = await res.json();
      setAiResponseText(data.text || '發生錯誤：' + data.error);
    } catch (error) {
      setAiResponseText('連線失敗，請確認你的網路或 API 狀態。');
    } finally {
      setIsLoading(false);
    }
  };

  // --- 3. 條件式渲染 (如果還沒解鎖，顯示鎖定畫面) ---
  if (isLocked) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4">
        <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md text-center border border-gray-200">
          <div className="text-5xl mb-4">🔒</div>
          <h1 className="text-2xl font-bold mb-6 text-gray-800">私人 AI 物理教學區</h1>
          <p className="text-gray-500 mb-6 text-sm">此為受保護內容，請輸入存取密碼</p>
          <input 
            type="password" 
            placeholder="請輸入密碼"
            className="w-full border border-gray-300 p-3 rounded-lg text-black mb-4 focus:ring-2 focus:ring-blue-500 outline-none"
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleLogin()} // 按下 Enter 也能解鎖
          />
          <button 
            onClick={handleLogin} 
            className="w-full bg-blue-600 text-white font-bold py-3 rounded-lg hover:bg-blue-700 transition duration-200 shadow-md"
          >
            驗證身分並進入
          </button>
        </div>
      </div>
    );
  }

  // --- 4. 正式內容渲染 (解鎖後才會顯示) ---
  return (
    <main className="max-w-4xl mx-auto p-6 font-sans text-gray-800">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-blue-600">AI 物理解惑專區 🤖</h1>
        <button 
          onClick={() => setIsLocked(true)} 
          className="text-xs bg-gray-200 px-2 py-1 rounded hover:bg-gray-300 text-gray-600"
        >
          登出/鎖定
        </button>
      </div>
      
      {/* 提問表單區塊 */}
      <form onSubmit={handleSubmit} className="mb-8 space-y-4 bg-gray-50 p-6 rounded-xl shadow border border-gray-200">
        <div>
          <label className="block mb-2 font-bold text-gray-700">上傳題目圖片 (選填)</label>
          <input 
            type="file" 
            accept="image/*" 
            onChange={handleImageUpload} 
            className="w-full text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" 
          />
        </div>
        
        <div>
          <label className="block mb-2 font-bold text-gray-700">輸入問題</label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="請描述你的問題，例如：這題的摩擦力作功怎麼算？"
            className="w-full border border-gray-300 rounded-lg p-3 h-28 focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          />
        </div>

        <button 
          type="submit" 
          disabled={isLoading} 
          className="w-full bg-blue-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition duration-200"
        >
          {isLoading ? '老師正在解題中...' : '送出問題'}
        </button>
      </form>

      {/* 解答顯示區塊 */}
      <div className="bg-white border border-gray-200 p-8 rounded-xl shadow-lg min-h-[200px]">
        <div className="prose prose-blue max-w-none">
          <ReactMarkdown 
            remarkPlugins={[remarkMath]} 
            rehypePlugins={[rehypeKatex, rehypeRaw]}
          >
            {aiResponseText}
          </ReactMarkdown>
        </div>
      </div>
    </main>
  );
}
