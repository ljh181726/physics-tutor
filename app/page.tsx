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

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
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
      Promise.all(promises).then((base64Strings) => setImagesBase64(base64Strings));
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
      setAiResponseText('連線失敗，請稍後再試。');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLocked) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-white p-6">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-bold mb-6 text-center text-gray-800">🔒 私人物理教學專區</h1>
          <input 
            type="password" 
            placeholder="請輸入解鎖密碼"
            className="w-full border-b-2 border-blue-500 p-3 mb-6 outline-none text-center text-xl"
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
          />
          <button onClick={handleLogin} className="w-full bg-blue-600 text-white py-3 rounded-full shadow-lg">進入</button>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 pb-20">
      {/* 頂部標題 */}
      <div className="bg-white border-b px-4 py-6 sticky top-0 z-10 shadow-sm">
        <div className="max-w-3xl mx-auto flex justify-between items-center">
          <h1 className="text-xl font-bold text-blue-600">AI 物理家教</h1>
          <button onClick={() => setIsLocked(true)} className="text-gray-400 text-sm">鎖定</button>
        </div>
      </div>

      <div className="max-w-3xl mx-auto p-4 space-y-6">
        {/* 輸入區域 */}
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl p-5 shadow-sm space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-500 mb-2 block">上傳題目 (多張可)</label>
            <input type="file" accept="image/*" multiple onChange={handleImageUpload} className="w-full text-sm" />
          </div>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="w-full bg-gray-50 rounded-xl p-4 h-32 outline-none focus:ring-2 focus:ring-blue-100 transition"
            placeholder="請輸入你的物理疑問..."
            required
          />
          <button 
            type="submit" 
            disabled={isLoading} 
            className="w-full bg-blue-600 text-white font-bold py-4 rounded-xl disabled:bg-blue-300 shadow-md active:scale-95 transition"
          >
            {isLoading ? '老師正在分析中...' : '送出提問'}
          </button>
        </form>

        {/* 解答區域 - 這裡針對你的排版需求做了大幅優化 */}
        <div className="bg-white rounded-2xl p-6 md:p-10 shadow-sm overflow-hidden min-h-[400px]">
          <div className="prose prose-slate max-w-none 
            prose-p:leading-relaxed prose-p:mb-6 
            prose-li:my-2
            prose-headings:text-blue-700
            overflow-x-auto text-gray-700">
            <ReactMarkdown 
              remarkPlugins={[remarkMath]} 
              rehypePlugins={[rehypeKatex, rehypeRaw]}
              components={{
                // 修正 SVG 與圖片排版
                img: ({node, ...props}) => (
                  <div className="my-8 flex justify-center w-full">
                    <img {...props} className="max-w-full h-auto rounded-lg" style={{ display: 'block' }} />
                  </div>
                ),
                // 針對 rehype-raw 渲染出的標籤進行樣式注入
                // 我們無法直接在這裡攔截 SVG 標籤，但透過 prose 的 CSS 可以控制
              }}
            >
              {aiResponseText}
            </ReactMarkdown>
          </div>
        </div>
      </div>

      {/* 底部 CSS 注入：強制修正 SVG 與公式寬度，不影響文字 */}
      <style jsx global>{`
        .prose svg {
          max-width: 100% !important;
          height: auto !important;
          margin: 2rem auto !important;
          display: block !important;
        }
        .prose .katex-display {
          margin: 1.5rem 0 !important;
          padding: 1rem 0;
          overflow-x: auto;
          overflow-y: hidden;
        }
        /* 增加一般文字的易讀性 */
        .prose p {
          font-size: 1.05rem;
          letter-spacing: 0.02em;
        }
      `}</style>
    </main>
  );
}
