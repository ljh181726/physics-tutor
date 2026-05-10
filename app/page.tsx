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
  // 🟢 重點：改成複數陣列
  const [imagesBase64, setImagesBase64] = useState<string[]>([]);
  const [aiResponseText, setAiResponseText] = useState('老師正在等你的問題...');
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = () => {
    if (password === "8888") {
      setIsLocked(false);
    } else {
      alert("密碼錯誤！");
    }
  };

  // 🟢 重點：處理多張圖片上傳
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

      Promise.all(promises).then((base64Strings) => {
        setImagesBase64(base64Strings);
      });
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
        // 🟢 重點：傳送圖片陣列
        body: JSON.stringify({ prompt, imagesBase64 }),
      });
      
      const data = await res.json();
      setAiResponseText(data.text || '發生錯誤：' + data.error);
    } catch (error) {
      setAiResponseText('連線失敗，請確認網路狀態。');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLocked) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-6">
        <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-sm text-center border border-gray-200">
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

  return (
    <main className="max-w-4xl mx-auto p-4 md:p-8 font-sans text-gray-800">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl md:text-3xl font-bold text-blue-600">AI 物理解惑 🤖</h1>
        <button onClick={() => { setIsLocked(true); setImagesBase64([]); }} className="text-xs bg-gray-200 px-2 py-1 rounded text-gray-500">鎖定</button>
      </div>
      
      <form onSubmit={handleSubmit} className="mb-8 space-y-4 bg-gray-50 p-4 md:p-6 rounded-xl shadow border border-gray-100">
        <div>
          <label className="block mb-2 text-sm font-bold text-gray-700">題目照片 (可選多張)</label>
          <input 
            type="file" 
            accept="image/*" 
            multiple // 🟢 重點：加入 multiple 屬性
            onChange={handleImageUpload} 
            className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:bg-blue-50 file:text-blue-700" 
          />
          {imagesBase64.length > 0 && (
            <p className="mt-2 text-xs text-blue-600">已選取 {imagesBase64.length} 張照片</p>
          )}
        </div>
        
        <div>
          <label className="block mb-2 text-sm font-bold text-gray-700">描述你的問題</label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="w-full border border-gray-300 rounded-lg p-3 h-24 focus:ring-2 focus:ring-blue-500 outline-none"
            placeholder="可以上傳多張題目與算式，讓老師幫你檢查。"
            required
          />
        </div>

        <button type="submit" disabled={isLoading} className="w-full bg-blue-600 text-white font-bold py-3 rounded-lg disabled:bg-gray-300">
          {isLoading ? '老師正在閱卷解題中...' : '送出提問'}
        </button>
      </form>

      <div className="bg-white border border-gray-200 p-4 md:p-8 rounded-xl shadow-lg min-h-[200px] w-full overflow-hidden">
        <div className="prose prose-blue max-w-none overflow-x-auto">
          <ReactMarkdown 
            remarkPlugins={[remarkMath]} 
            rehypePlugins={[rehypeKatex, rehypeRaw]}
            components={{
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
