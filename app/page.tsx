'use client';

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import 'katex/dist/katex.min.css';

export default function Home() {
  const [password, setPassword] = useState('');
  const [isLocked, setIsLocked] = useState(true);
  const [prompt, setPrompt] = useState('');
  const [imagesBase64, setImagesBase64] = useState<string[]>([]);
  const [aiResponseText, setAiResponseText] = useState('老師正在等你的問題...');
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = () => {
    if (password === "8888") setIsLocked(false);
    else alert("密碼錯誤！");
  };

  // --- 關鍵：圖片壓縮與縮放功能 ---
  const compressImage = (base64Str: string): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = base64Str;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        const MAX_WIDTH = 1024; // 限制最大寬度為 1024px，足以讓 AI 看清題目

        if (width > MAX_WIDTH) {
          height = (MAX_WIDTH / width) * height;
          width = MAX_WIDTH;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        // 壓縮品質設為 0.7，大幅減小體積
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      };
    });
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      const fileArray = Array.from(files);
      const promises = fileArray.map((file) => {
        return new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        });
      });

      const base64Strings = await Promise.all(promises);
      // 對每張圖片進行壓縮
      const compressedImages = await Promise.all(base64Strings.map(img => compressImage(img)));
      setImagesBase64(compressedImages);
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
        body: JSON.stringify({ prompt, imagesBase64 }),
      });
      const data = await res.json();
      setAiResponseText(data.text || '發生錯誤：' + data.error);
    } catch (error) {
      setAiResponseText('連線失敗。可能是照片過大或網路超時，請試著減少照片數量。');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLocked) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-6">
        <div className="w-full max-w-sm bg-white p-8 rounded-3xl shadow-lg border border-gray-100 text-center">
          <h1 className="text-2xl font-bold mb-6 text-gray-800">🔐 私人教學區</h1>
          <input 
            type="password" 
            placeholder="請輸入密碼"
            className="w-full border-2 border-gray-200 rounded-xl p-3 mb-6 outline-none text-center text-xl text-black focus:border-blue-500 transition"
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
          />
          <button onClick={handleLogin} className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold active:scale-95 transition">解鎖進入</button>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 pb-12">
      <div className="bg-white border-b px-6 py-6 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto flex justify-between items-center">
          <h1 className="text-xl font-extrabold text-blue-600 tracking-tight">AI 物理AI</h1>
          <button onClick={() => {setIsLocked(true); setImagesBase64([]);}} className="text-gray-400 text-sm font-medium">登出</button>
        </div>
      </div>

      <div className="max-w-3xl mx-auto p-4 space-y-6">
        <form onSubmit={handleSubmit} className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 space-y-5">
          <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100">
            <label className="text-xs font-bold text-blue-600 mb-2 block uppercase tracking-wider">上傳照片 (多張可)</label>
            <input type="file" accept="image/*" multiple onChange={handleImageUpload} className="w-full text-sm text-gray-600" />
            {imagesBase64.length > 0 && <p className="text-xs text-blue-500 mt-2">已壓縮處理 {imagesBase64.length} 張圖片</p>}
          </div>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="w-full bg-gray-50 rounded-2xl p-4 h-36 outline-none focus:ring-2 focus:ring-blue-100 transition text-black border border-gray-100"
            placeholder="描述你的問題..."
            required
          />
          <button 
            type="submit" 
            disabled={isLoading} 
            className="w-full bg-blue-600 text-white font-bold py-4 rounded-2xl shadow-lg active:scale-95 disabled:bg-blue-300 transition"
          >
            {isLoading ? '老師正在分析中...' : '送出提問'}
          </button>
        </form>

        <div className="bg-white rounded-3xl p-6 md:p-10 shadow-sm border border-gray-100 min-h-[400px]">
          <div className="prose prose-slate max-w-none prose-p:leading-relaxed prose-p:mb-8 prose-li:my-3 prose-headings:text-blue-700 text-gray-700">
            <ReactMarkdown 
              remarkPlugins={[remarkMath]} 
              rehypePlugins={[rehypeKatex, rehypeRaw]}
              components={{
                img: ({node, ...props}) => (
                  <div className="my-10 flex justify-center w-full">
                    <img {...props} className="max-w-full h-auto rounded-2xl shadow-md" style={{ display: 'block' }} />
                  </div>
                ),
              }}
            >
              {aiResponseText}
            </ReactMarkdown>
          </div>
        </div>
      </div>

      <style jsx global>{`
        .prose svg {
          max-width: 100% !important;
          height: auto !important;
          margin: 2.5rem auto !important;
          display: block !important;
        }
        .prose .katex-display {
          margin: 2rem 0 !important;
          padding: 1.5rem 0;
          overflow-x: auto;
          overflow-y: hidden;
          background: #f8fafc;
          border-radius: 12px;
        }
      `}</style>
    </main>
  );
}
