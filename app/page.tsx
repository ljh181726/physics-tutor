'use client';

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import 'katex/dist/katex.min.css'; // 務必引入 LaTeX 樣式

export default function Home() {
  // --- 狀態定義 ---
  const [password, setPassword] = useState('');
  const [isLocked, setIsLocked] = useState(true);
  const [prompt, setPrompt] = useState('');
  const [imageBase64, setImageBase64] = useState('');
  const [aiResponseText, setAiResponseText] = useState('老師正在等你的問題...');
  const [isLoading, setIsLoading] = useState(false);

  // --- 邏輯處理 ---
  const handleLogin = () => {
    if (password === "8888") { // 👈 在這裡更改你的密碼
      setIsLocked(false);
    } else {
      alert("密碼錯誤！");
    }
  };

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
      setAiResponseText('連線失敗，請確認你的網路狀態。');
    } finally {
      setIsLoading(false);
    }
  };

  // --- 鎖定畫面 ---
  if (isLocked) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-6 text-center">
        <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-sm border border-gray-200">
          <div className="text-4xl mb-4">🔐</div>
          <h1 className="text-xl font-bold mb-6">私人 AI 物理教學區</h1>
          <input 
            type="password" 
            placeholder="輸入存取密碼"
            className="w-full border border-gray-300 p-3 rounded-lg text-black mb-4 outline-none focus:ring-2 focus:ring-blue-500"
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
          />
          <button onClick={handleLogin} className="w-full bg-blue-600 text-white font-bold py-3 rounded-lg hover:bg-blue-700 transition">
            驗證進入
          </button>
        </div>
      </div>
    );
  }

  // --- 正式內容 (優化手機排版) ---
  return (
    <main className="max-w-4xl mx-auto p-4 md:p-8 font-sans text-gray-800">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl md:text-3xl font-bold text-blue-600">AI 物理解惑 🤖</h1>
        <button onClick={() => setIsLocked(true)} className="text-xs bg-gray-200 px-2 py-1 rounded text-gray-500">鎖定</button>
      </div>
      
      <form onSubmit={handleSubmit} className="mb-8 space-y-4 bg-gray-50 p-4 md:p-6 rounded-xl shadow border border-gray-100">
        <div>
          <label className="block mb-2 text-sm font-bold text-gray-700">題目圖片 (選填)</label>
          <input type="file" accept="image/*" onChange={handleImageUpload} className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:bg-blue-50 file:text-blue-700" />
        </div>
        
        <div>
          <label className="block mb-2 text-sm font-bold text-gray-700">描述你的問題</label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="w-full border border-gray-300 rounded-lg p-3 h-24 focus:ring-2 focus:ring-blue-500 outline-none"
            required
          />
        </div>

        <button type="submit" disabled={isLoading} className="w-full bg-blue-600 text-white font-bold py-3 rounded-lg disabled:bg-gray-300">
          {isLoading ? '老師正在思考中...' : '送出提問'}
        </button>
      </form>

      {/* 解答顯示區塊：重點在於 overflow-x-auto */}
      <div className="bg-white border border-gray-200 p-4 md:p-8 rounded-xl shadow-lg min-h-[200px] w-full overflow-hidden">
        <div className="prose prose-blue max-w-none overflow-x-auto">
          <ReactMarkdown 
            remarkPlugins={[remarkMath]} 
            rehypePlugins={[rehypeKatex, rehypeRaw]}
            components={{
              // 強制讓圖片與 SVG 不會超出寬度
              img: ({node, ...props}) => <img {...props} style={{maxWidth: '100%', height: 'auto'}} />,
            }}
          >
            {aiResponseText}
          </ReactMarkdown>
        </div>
      </div>
    </main>
  );
}
