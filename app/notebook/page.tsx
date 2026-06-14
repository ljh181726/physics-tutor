"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "../../lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { collection, query, getDocs, orderBy, deleteDoc, doc, writeBatch } from "firebase/firestore";

import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import "katex/dist/katex.min.css";

const SUBJECT_MAP = {
  math:      { name: "📐 高中數學", color: "bg-red-50 text-red-700 border-red-200" },
  physics:   { name: "🍎 高中物理", color: "bg-blue-50 text-blue-700 border-blue-200" },
  chemistry: { name: "🧪 高中化學", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  biology:   { name: "🧬 高中生物", color: "bg-purple-50 text-purple-700 border-purple-200" },
  earth:     { name: "🌍 高中地科", color: "bg-amber-50 text-amber-700 border-amber-200" },
  chinese:   { name: "🏮 高中國文", color: "bg-rose-50 text-rose-700 border-rose-200" },
  english:   { name: "🔤 高中英文", color: "bg-indigo-50 text-indigo-700 border-indigo-200" },
} as const;

export default function NotebookPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [wrongQuestions, setWrongQuestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // 搜尋與篩選狀態
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<string>("all");

  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [studyMode, setStudyMode] = useState<"notebook" | "flashcards" | "planner">("notebook");
  const [flashcards, setFlashcards] = useState<any[]>([]);
  const [newCardFront, setNewCardFront] = useState("");
  const [newCardBack, setNewCardBack] = useState("");
  const [showCreateCardModal, setShowCreateCardModal] = useState(false);
  const [activeCardIndex, setActiveCardIndex] = useState(0);
  const [cardFlipped, setCardFlipped] = useState(false);
  const [isGeneratingCards, setIsGeneratingCards] = useState(false);
  const [aiCardTopic, setAiCardTopic] = useState("");
  const [aiCardSubject, setAiCardSubject] = useState<string>("physics");

  const [studyGoals, setStudyGoals] = useState<any[]>([]);
  const [showCreateGoalModal, setShowCreateGoalModal] = useState(false);
  const [newGoalTitle, setNewGoalTitle] = useState("");
  const [newGoalSubject, setNewGoalSubject] = useState("physics");
  const [newGoalHours, setNewGoalHours] = useState(2);

  const [totalPomoCount, setTotalPomoCount] = useState(0);
  const [quizCompletedCount, setQuizCompletedCount] = useState(0);
  const [socratesCount, setSocratesCount] = useState(0);
  const [focusStreak, setFocusStreak] = useState(0);

  useEffect(() => {
    const localCards = localStorage.getItem("flashcards");
    if (localCards) {
      setFlashcards(JSON.parse(localCards));
    }
  }, []);

  useEffect(() => {
    // load goals
    const localGoals = localStorage.getItem("study_goals");
    if (localGoals) setStudyGoals(JSON.parse(localGoals));

    // calculate total pomo sessions
    let pomoSum = 0;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith("pomo_sessions_")) {
          pomoSum += parseInt(localStorage.getItem(key) || "0");
        }
      }
    } catch (e) {
      console.error(e);
    }
    setTotalPomoCount(pomoSum);

    // load quiz completed count
    const qCount = parseInt(localStorage.getItem("quiz_completed_count") || "0");
    setQuizCompletedCount(qCount);

    // load socrates count
    const sCount = parseInt(localStorage.getItem("pomo_socrates_count") || "0");
    setSocratesCount(sCount);

    // load focus streak
    const streak = parseInt(localStorage.getItem("pomo_streak") || "0");
    setFocusStreak(streak);
  }, [studyMode]);

  const saveGoals = (newGoals: any[]) => {
    setStudyGoals(newGoals);
    localStorage.setItem("study_goals", JSON.stringify(newGoals));
  };

  const handleAddGoal = () => {
    if (!newGoalTitle.trim()) return;
    const newGoal = {
      id: "goal-" + Date.now(),
      title: newGoalTitle.trim(),
      subject: newGoalSubject,
      targetHours: newGoalHours,
      loggedHours: 0,
      completed: false,
      timestamp: Date.now()
    };
    saveGoals([newGoal, ...studyGoals]);
    setNewGoalTitle("");
    setShowCreateGoalModal(false);
  };

  const handleLogHours = (goalId: string, hours: number) => {
    const updated = studyGoals.map(g => {
      if (g.id === goalId) {
        const newLogged = Math.min(g.targetHours, Math.max(0, g.loggedHours + hours));
        return {
          ...g,
          loggedHours: newLogged,
          completed: newLogged >= g.targetHours ? true : g.completed
        };
      }
      return g;
    });
    saveGoals(updated);
  };

  const handleToggleGoalCompleted = (goalId: string) => {
    const updated = studyGoals.map(g => {
      if (g.id === goalId) {
        const completed = !g.completed;
        return {
          ...g,
          completed,
          loggedHours: completed ? g.targetHours : 0
        };
      }
      return g;
    });
    saveGoals(updated);
  };

  const handleDeleteGoal = (goalId: string) => {
    if (!confirm("確定要刪除這個學習計畫嗎？")) return;
    const updated = studyGoals.filter(g => g.id !== goalId);
    saveGoals(updated);
  };

  const saveCards = (newCards: any[]) => {
    setFlashcards(newCards);
    localStorage.setItem("flashcards", JSON.stringify(newCards));
  };

  const handleAddCard = () => {
    if (!newCardFront.trim() || !newCardBack.trim()) return;
    const newCard = {
      id: "card-" + Date.now(),
      front: newCardFront.trim(),
      back: newCardBack.trim(),
      subject: activeTab === "all" ? "physics" : activeTab,
      interval: 1,
      ease: 2.5,
      reps: 0,
      dueDate: Date.now()
    };
    saveCards([newCard, ...flashcards]);
    setNewCardFront("");
    setNewCardBack("");
    setShowCreateCardModal(false);
  };

  const handleAIGenerateCards = async () => {
    if (!aiCardTopic.trim()) { alert("請輸入生成主題！"); return; }
    setIsGeneratingCards(true);
    const prompt = `請針對高中「${SUBJECT_MAP[aiCardSubject as keyof typeof SUBJECT_MAP]?.name || aiCardSubject}」科目中的「${aiCardTopic.trim()}」單元，設計 10 張極具學習價值的記憶卡（包含定義、公式或重要觀念，可含 LaTeX 公式）。
請【嚴格】僅回傳符合以下 JSON 格式的內容，切勿包含任何前言、後記、引號包裝或說明：
[
  {
    "front": "正面內容（問題、術語、公式左半部）",
    "back": "背面內容（詳細定義、解答、解析，可使用 LaTeX，$ 符號包圍）"
  }
]`;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          subject: aiCardSubject,
          history: [],
          threadId: "cards-generation",
          userName: user?.displayName,
          knowledge: ""
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "連線失敗");
      
      let cleanText = data.text.trim();
      if (cleanText.includes("```")) {
        cleanText = cleanText.replace(/```(?:json)?/g, "").trim();
      }
      
      const parsed = JSON.parse(cleanText);
      if (Array.isArray(parsed)) {
        const newCards = parsed.map((c: any, index: number) => ({
          id: `card-ai-${Date.now()}-${index}`,
          front: c.front,
          back: c.back,
          subject: aiCardSubject,
          interval: 1,
          ease: 2.5,
          reps: 0,
          dueDate: Date.now()
        }));
        saveCards([...newCards, ...flashcards]);
        setAiCardTopic("");
        alert("🎉 AI 已成功為您生成 10 張記憶卡！");
      } else {
        throw new Error("回傳格式非 JSON 陣列");
      }
    } catch (err: any) {
      alert("生成失敗，請重試！\n錯誤資訊：" + err.message);
    } finally {
      setIsGeneratingCards(false);
    }
  };

  const handleReviewCard = (quality: "again" | "hard" | "good" | "easy") => {
    const card = dueCards[activeCardIndex];
    if (!card) return;
    
    let { interval, ease, reps } = card;
    if (quality === "again") {
      reps = 0;
      interval = 1;
      ease = Math.max(1.3, ease - 0.2);
    } else if (quality === "hard") {
      reps = reps + 1;
      interval = Math.max(1, interval * 1.2);
      ease = Math.max(1.3, ease - 0.15);
    } else if (quality === "good") {
      reps = reps + 1;
      interval = reps === 1 ? 5 : interval * ease;
    } else if (quality === "easy") {
      reps = reps + 1;
      interval = reps === 1 ? 10 : interval * ease * 1.2;
      ease = ease + 0.15;
    }
    
    const dueDate = Date.now() + interval * 60 * 1000;
    const updatedCards = flashcards.map(c => 
      c.id === card.id ? { ...c, interval, ease, reps, dueDate } : c
    );
    saveCards(updatedCards);
    
    setCardFlipped(false);
    if (activeCardIndex >= dueCards.length - 1) {
      setActiveCardIndex(0);
    }
  };

  const handleDeleteCard = (cardId: string) => {
    if (!confirm("確定要刪除這張記憶卡嗎？")) return;
    const updated = flashcards.filter(c => c.id !== cardId);
    saveCards(updated);
    if (activeCardIndex >= Math.max(1, dueCards.length - 1)) {
      setActiveCardIndex(0);
    }
  };

  const dueCards = flashcards.filter(c => {
    const matchSubject = activeTab === "all" || c.subject === activeTab;
    const isDue = c.dueDate <= Date.now();
    return matchSubject && isDue;
  });

  const totalSubjectCards = flashcards.filter(c => activeTab === "all" || c.subject === activeTab).length;

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser: any) => {
      if (!currentUser) {
        router.push("/");
      } else {
        setUser(currentUser);
        await fetchNotebook(currentUser.uid);
      }
    });
    return () => unsubscribe();
  }, [router]);

  const fetchNotebook = async (uid: string) => {
    try {
      const q = query(collection(db, `users/${uid}/wrong_questions`), orderBy("timestamp", "desc"));
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
      setWrongQuestions(data);
    } catch (err) {
      console.error("讀取失敗：", err);
    } finally {
      setLoading(false);
    }
  };

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) newSelected.delete(id);
    else newSelected.add(id);
    setSelectedIds(newSelected);
  };

  const deleteSelected = async () => {
    if (selectedIds.size === 0 || !user) return;
    if (!confirm(`確定要刪除這 ${selectedIds.size} 個題目嗎？刪除後無法復原。`)) return;

    try {
      const batch = writeBatch(db);
      selectedIds.forEach((id: string) => {
        const docRef = doc(db, `users/${user.uid}/wrong_questions`, id);
        batch.delete(docRef);
      });
      await batch.commit();
      setWrongQuestions((prev: any[]) => prev.filter((item: any) => !selectedIds.has(item.id)));
      setSelectedIds(new Set());
      setIsEditMode(false);
      alert("已成功刪除！");
    } catch (err: any) {
      alert("刪除失敗：" + err.message);
    }
  };

  const deleteSingle = async (id: string) => {
    if (!user) return;
    if (!confirm("確定要刪除這一題嗎？")) return;
    try {
      await deleteDoc(doc(db, `users/${user.uid}/wrong_questions`, id));
      setWrongQuestions((prev: any[]) => prev.filter((item: any) => item.id !== id));
      alert("已刪除！");
    } catch (err) {
      alert("刪除失敗");
    }
  };

  const startFollowUp = (item: any) => {
    if (item.threadId) {
      router.push(`/chat/${item.threadId}?subject=${item.subject}`);
    } else {
      alert("這題是較早儲存的舊錯題，沒有記錄到原始房間，請回到大廳另開房間發問！");
    }
  };

  // 📝 過濾邏輯：學科頁籤 + 搜尋關鍵字
  const filteredQuestions = wrongQuestions.filter((item: any) => {
    const matchTab = activeTab === "all" || item.subject === activeTab;
    const matchQuery = 
      item.question?.toLowerCase().includes(searchQuery.toLowerCase()) || 
      item.answer?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchTab && matchQuery;
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-slate-500 font-bold text-sm">載入錯題筆記中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50/50 py-10 px-4 sm:px-6 lg:px-8">
      {/* CSS 補丁，優化 Markdown 公式渲染 */}
      <style>{`
        .markdown-content .katex svg {
          display: inline !important;
        }
        .markdown-content .katex-display {
          overflow-x: auto !important;
          margin: 1em 0 !important;
        }
        .flashcard-container {
          perspective: 1000px;
        }
        .flashcard-inner {
          transition: transform 0.6s;
          transform-style: preserve-3d;
        }
        .flashcard-inner.flipped {
          transform: rotateY(180deg);
        }
        .backface-hidden {
          backface-visibility: hidden;
          -webkit-backface-visibility: hidden;
        }
        .flashcard-front {
          z-index: 2;
          transform: rotateY(0deg);
        }
        .flashcard-back {
          transform: rotateY(180deg);
        }
      `}</style>

      <div className="max-w-4xl mx-auto animate-fade-in">
        {/* Header Section */}
        <header className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4 bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-800 flex items-center gap-2">
              <span>📚</span> 我的錯題本
            </h1>
            <p className="text-xs text-slate-400 mt-1.5 font-semibold">
              收集您在教室中標記 ⭐ 的所有錯題，支援直接點擊「追問」返回原始房間。
            </p>
          </div>
          <div className="flex gap-2">
            {!isEditMode ? (
              <>
                <button 
                  onClick={() => setIsEditMode(true)} 
                  className="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold rounded-xl text-xs cursor-pointer transition-all active:scale-95"
                >
                  批次編輯
                </button>
                <button 
                  onClick={() => router.push("/")} 
                  className="px-4 py-2 bg-slate-900 hover:bg-indigo-600 text-white font-bold rounded-xl text-xs cursor-pointer transition-all shadow-sm active:scale-95"
                >
                  🏠 返回大廳
                </button>
              </>
            ) : (
              <>
                <button 
                  onClick={deleteSelected} 
                  disabled={selectedIds.size === 0} 
                  className={`px-4 py-2 font-bold rounded-xl text-xs cursor-pointer transition-all active:scale-95 text-white ${
                    selectedIds.size > 0 ? 'bg-rose-600 hover:bg-rose-700' : 'bg-slate-300 cursor-not-allowed'
                  }`}
                >
                  刪除選取 ({selectedIds.size})
                </button>
                <button 
                  onClick={() => { setIsEditMode(false); setSelectedIds(new Set()); }} 
                  className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl text-xs cursor-pointer transition-all active:scale-95"
                >
                  取消
                </button>
              </>
            )}
          </div>
        </header>

        {/* Header Tab Selector */}
        <div className="flex gap-4 mb-6 border-b border-slate-200">
          <button
            onClick={() => setStudyMode("notebook")}
            className={`pb-3 px-4 text-sm font-bold border-b-2 transition-all cursor-pointer ${studyMode === "notebook" ? "border-indigo-600 text-indigo-600 font-extrabold" : "border-transparent text-slate-500 hover:text-slate-700"}`}
          >
            📚 錯題整理 ({wrongQuestions.length})
          </button>
          <button
            onClick={() => setStudyMode("flashcards")}
            className={`pb-3 px-4 text-sm font-bold border-b-2 transition-all cursor-pointer ${studyMode === "flashcards" ? "border-indigo-600 text-indigo-600 font-extrabold" : "border-transparent text-slate-500 hover:text-slate-700"}`}
          >
            🗂️ 學習記憶卡 ({flashcards.length})
          </button>
          <button
            onClick={() => setStudyMode("planner")}
            className={`pb-3 px-4 text-sm font-bold border-b-2 transition-all cursor-pointer ${studyMode === "planner" ? "border-indigo-600 text-indigo-600 font-extrabold" : "border-transparent text-slate-500 hover:text-slate-700"}`}
          >
            🎯 學習計畫與成就
          </button>
        </div>

        {studyMode === "notebook" && (
          <>
            {/* 🔍 搜尋與篩選列 */}
            <div className="bg-white p-4 rounded-3xl border border-slate-100 shadow-sm mb-6 space-y-4">
          <div className="relative">
            <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400 text-sm">🔍</span>
            <input 
              type="text" 
              placeholder="搜尋關鍵字 (例如：平移、加速度、氧化還原...)" 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-50 hover:bg-slate-100/60 focus:bg-white border border-slate-200 rounded-2xl pl-9 pr-4 py-2.5 text-xs outline-none focus:border-indigo-500 transition-all"
            />
          </div>

          {/* 🏷️ 科目篩選頁籤 */}
          <div className="flex flex-wrap gap-1.5 border-t border-slate-50 pt-3">
            <button 
              onClick={() => setActiveTab("all")} 
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === "all" 
                  ? "bg-slate-900 text-white" 
                  : "bg-slate-50 text-slate-600 hover:bg-slate-100"
              }`}
            >
              全部 ({wrongQuestions.length})
            </button>
            {Object.entries(SUBJECT_MAP).map(([key, info]) => {
              const count = wrongQuestions.filter((item: any) => item.subject === key).length;
              return (
                <button 
                  key={key} 
                  onClick={() => setActiveTab(key)} 
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    activeTab === key 
                      ? "bg-indigo-600 text-white shadow-sm" 
                      : "bg-slate-50 text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {info.name.split(" ")[1]} ({count})
                </button>
              );
            })}
          </div>
        </div>

        {/* 錯題卡片清單 */}
        {filteredQuestions.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-3xl border border-slate-100 shadow-sm">
            <span className="text-5xl block mb-3">🌟</span>
            <h2 className="text-base font-extrabold text-slate-600">無符合條件的錯題</h2>
            <p className="text-xs text-slate-400 mt-1">更換篩選條件，或是回到教室標記新錯題！</p>
          </div>
        ) : (
          <div className="grid gap-5">
            {filteredQuestions.map((item: any) => {
              const subInfo = SUBJECT_MAP[item.subject as keyof typeof SUBJECT_MAP];
              return (
                <div 
                  key={item.id} 
                  onClick={() => isEditMode && toggleSelect(item.id)}
                  className={`bg-white rounded-3xl shadow-sm border-2 transition-all duration-300 overflow-hidden relative group ${
                    isEditMode ? 'cursor-pointer select-none' : ''
                  } ${selectedIds.has(item.id) ? 'border-indigo-500 ring-4 ring-indigo-100' : 'border-slate-100'}`}
                >
                  {/* 🚀 追問按鈕：滑鼠移上去才會出現 */}
                  {!isEditMode && (
                    <button 
                      onClick={(e: React.MouseEvent<HTMLButtonElement>) => { e.stopPropagation(); startFollowUp(item); }}
                      className="absolute -top-3 -right-3 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-full shadow-lg hover:scale-105 active:scale-95 transition-transform opacity-0 group-hover:opacity-100 z-10 text-xs font-black cursor-pointer"
                    >
                      🔍 針對這題追問
                    </button>
                  )}

                  <div className="px-6 py-3.5 bg-slate-50/70 border-b border-slate-100 flex justify-between items-center relative z-0">
                    <div className="flex items-center gap-3">
                      {isEditMode && (
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${selectedIds.has(item.id) ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300 bg-white'}`}>
                          {selectedIds.has(item.id) && <span className="text-white text-[10px]">✓</span>}
                        </div>
                      )}
                      <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-md border ${subInfo?.color || "bg-slate-100 text-slate-600 border-slate-200"}`}>
                        {subInfo?.name || item.subject}
                      </span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-[10px] text-slate-400 font-mono font-bold">{new Date(item.timestamp).toLocaleDateString()}</span>
                      {!isEditMode && (
                        <button 
                          onClick={(e: React.MouseEvent<HTMLButtonElement>) => { e.stopPropagation(); deleteSingle(item.id); }} 
                          className="text-slate-400 hover:text-rose-600 text-xs font-semibold cursor-pointer"
                        >
                          🗑️ 刪除
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="p-6">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">我的提問</h4>
                    <div className="text-slate-800 font-bold text-sm leading-relaxed mb-4 whitespace-pre-wrap">{item.question}</div>
                    
                    {item.images && item.images.map((img: string, i: number) => (
                      <img key={i} src={img} alt="題目圖片" className="mt-2 mb-4 rounded-xl max-h-56 border border-slate-100 shadow-sm object-contain" />
                    ))}

                    <hr className="my-4 border-slate-100" />
                    <h4 className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1.5">老師詳解</h4>
                    
                    <div className="text-slate-700 text-xs leading-relaxed markdown-content">
                      <ReactMarkdown
                        remarkPlugins={[remarkMath]}
                        rehypePlugins={[rehypeKatex, rehypeRaw]} 
                      >
                        {item.answer || ""}
                      </ReactMarkdown>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        </>
        )}

        {/* 🗂️ 記憶卡學習模式 */}
        {studyMode === "flashcards" && (
          <div className="animate-fade-in flex flex-col gap-6">
            
            {/* AI Flashcard Generator & Custom Card Panel */}
            <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
              <div>
                <h3 className="font-extrabold text-sm text-slate-700">🗂️ 學科記憶卡與間隔重複系統</h3>
                <p className="text-xs text-slate-400 mt-1">藉由主動回想與時間間隔重複記憶，將知識寫入長期記憶。</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateCardModal(true)}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm active:scale-95 cursor-pointer"
                >
                  ➕ 新增自訂字卡
                </button>
                <div className="flex gap-1 bg-slate-50 border border-slate-200/50 rounded-xl p-1 items-center">
                  <input
                    type="text"
                    placeholder="AI 生成主題 (e.g. 國文修辭)"
                    value={aiCardTopic}
                    onChange={(e) => setAiCardTopic(e.target.value)}
                    className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs outline-none focus:border-indigo-500 w-36 sm:w-44"
                  />
                  <select
                    value={aiCardSubject}
                    onChange={(e) => setAiCardSubject(e.target.value)}
                    className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs outline-none focus:border-indigo-500"
                  >
                    {Object.entries(SUBJECT_MAP).map(([key, info]) => (
                      <option key={key} value={key}>{info.name.split(" ")[1]}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleAIGenerateCards}
                    disabled={isGeneratingCards}
                    className="px-3 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-xs font-bold transition-all disabled:opacity-50 cursor-pointer active:scale-95"
                  >
                    {isGeneratingCards ? "生成中..." : "AI 生成 10 張"}
                  </button>
                </div>
              </div>
            </div>

            {/* Custom Create Modal */}
            {showCreateCardModal && (
              <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-[2px] z-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-2xl max-w-md w-full flex flex-col gap-4 animate-scale-in">
                  <h3 className="font-extrabold text-sm text-slate-800">➕ 建立自訂學習記憶卡</h3>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">正面 (問題/公式名稱/單字)</label>
                    <input
                      type="text"
                      placeholder="例如：F = ma"
                      value={newCardFront}
                      onChange={(e) => setNewCardFront(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">背面 (解答/詳細定義/公式含義)</label>
                    <textarea
                      placeholder="例如：牛頓第二運動定律，力 = 質量 * 加速度"
                      value={newCardBack}
                      onChange={(e) => setNewCardBack(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs h-24 outline-none focus:border-indigo-500 resize-none"
                    />
                  </div>
                  <div className="flex justify-end gap-2 mt-2">
                    <button
                      type="button"
                      onClick={() => setShowCreateCardModal(false)}
                      className="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-xs font-bold cursor-pointer"
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      onClick={handleAddCard}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold cursor-pointer shadow-sm"
                    >
                      確認新增
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Study Container */}
            {dueCards.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-3xl border border-slate-100 shadow-sm flex flex-col items-center gap-2">
                <span className="text-5xl">🎉</span>
                <h2 className="text-base font-extrabold text-slate-600">目前沒有需要複習的卡片</h2>
                <p className="text-xs text-slate-400 max-w-xs">
                  {totalSubjectCards > 0 
                    ? `本學科共有 ${totalSubjectCards} 張卡片，但皆未到複習時間。` 
                    : "本學科目前沒有任何卡片，請在上方自訂或讓 AI 為您生成！"}
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-6 max-w-md mx-auto w-full">
                
                {/* 3D Flip Card */}
                <div className="w-full h-80 flashcard-container cursor-pointer select-none">
                  <div 
                    onClick={() => setCardFlipped(!cardFlipped)}
                    className={`w-full h-full relative rounded-3xl shadow-md border border-slate-200/50 flashcard-inner ${cardFlipped ? "flipped" : ""}`}
                  >
                    {/* Front */}
                    <div className="absolute inset-0 bg-white rounded-3xl p-8 flex flex-col justify-between items-center backface-hidden flashcard-front">
                      <span className="text-[10px] font-black tracking-widest text-indigo-500 uppercase self-start">正面 (問題/卡號 {activeCardIndex + 1}/{dueCards.length})</span>
                      <div className="text-center text-slate-800 font-extrabold text-lg flex-1 flex items-center justify-center p-4">
                        <div className="markdown-content">
                          <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                            {dueCards[activeCardIndex].front}
                          </ReactMarkdown>
                        </div>
                      </div>
                      <span className="text-[10px] text-slate-400 font-extrabold">👆 點擊卡片以翻面觀看答案</span>
                    </div>

                    {/* Back */}
                    <div className="absolute inset-0 bg-indigo-900 rounded-3xl p-8 flex flex-col justify-between items-center backface-hidden flashcard-back text-white">
                      <span className="text-[10px] font-black tracking-widest text-indigo-300 uppercase self-start">背面 (答案)</span>
                      <div className="text-center font-bold text-sm overflow-y-auto flex-1 flex items-center justify-center p-4">
                        <div className="markdown-content text-indigo-50">
                          <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex, rehypeRaw]}>
                            {dueCards[activeCardIndex].back}
                          </ReactMarkdown>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleDeleteCard(dueCards[activeCardIndex].id); }}
                        className="text-[9px] font-bold text-indigo-300 hover:text-rose-400 bg-transparent border-none cursor-pointer underline"
                      >
                        🗑️ 刪除此記憶卡
                      </button>
                    </div>
                  </div>
                </div>

                {/* Spaced Repetition Quality Buttons */}
                {cardFlipped && (
                  <div className="grid grid-cols-4 gap-2 w-full animate-fade-in">
                    <button
                      type="button"
                      onClick={() => handleReviewCard("again")}
                      className="py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 font-extrabold border border-rose-200 rounded-xl text-xs active:scale-95 transition-all cursor-pointer flex flex-col items-center gap-0.5"
                    >
                      <span>Again</span>
                      <span className="text-[9px] text-rose-500 font-normal">重學 (1m)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleReviewCard("hard")}
                      className="py-2.5 bg-orange-50 hover:bg-orange-100 text-orange-700 font-extrabold border border-orange-200 rounded-xl text-xs active:scale-95 transition-all cursor-pointer flex flex-col items-center gap-0.5"
                    >
                      <span>Hard</span>
                      <span className="text-[9px] text-orange-500 font-normal">吃力 (2m)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleReviewCard("good")}
                      className="py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-extrabold border border-emerald-200 rounded-xl text-xs active:scale-95 transition-all cursor-pointer flex flex-col items-center gap-0.5"
                    >
                      <span>Good</span>
                      <span className="text-[9px] text-emerald-500 font-normal">掌握 (5m)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleReviewCard("easy")}
                      className="py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-extrabold border border-indigo-200 rounded-xl text-xs active:scale-95 transition-all cursor-pointer flex flex-col items-center gap-0.5"
                    >
                      <span>Easy</span>
                      <span className="text-[9px] text-indigo-500 font-normal">簡單 (10m)</span>
                    </button>
                  </div>
                )}
                
                <span className="text-[10px] text-slate-400 font-bold">目前佇列中剩餘： {dueCards.length} 張字卡</span>
              </div>
            )}
          </div>
        )}

        {/* 🎯 學習計畫與成就模式 */}
        {studyMode === "planner" && (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-8 animate-fade-in">
            {/* Left: Goals Panel */}
            <div className="md:col-span-7 flex flex-col gap-6">
              <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
                <div className="flex justify-between items-center mb-6">
                  <div>
                    <h3 className="font-extrabold text-base text-slate-800 flex items-center gap-2">
                      <span>🎯</span> 每週學習計畫
                    </h3>
                    <p className="text-xs text-slate-400 mt-1 font-semibold">為不同學科設定專注時數目標，妥善分配學習時間。</p>
                  </div>
                  <button
                    onClick={() => setShowCreateGoalModal(true)}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm active:scale-95 cursor-pointer"
                  >
                    ➕ 新增計畫
                  </button>
                </div>

                {studyGoals.length === 0 ? (
                  <div className="text-center py-12 flex flex-col items-center gap-2">
                    <span className="text-4xl">🗓️</span>
                    <p className="text-xs font-bold text-slate-400">目前尚無每週學習計畫，點擊右上角新增一個吧！</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {studyGoals.map((g) => {
                      const subInfo = SUBJECT_MAP[g.subject as keyof typeof SUBJECT_MAP];
                      const progressPct = Math.round((g.loggedHours / g.targetHours) * 100);
                      return (
                        <div 
                          key={g.id}
                          className={`p-5 rounded-2xl border transition-all ${
                            g.completed 
                              ? "bg-slate-50/50 border-slate-200" 
                              : "bg-white border-slate-100 hover:shadow-md"
                          }`}
                        >
                          <div className="flex justify-between items-start mb-3 gap-2">
                            <div className="flex items-center gap-2">
                              <span className={`text-[10px] font-black px-2 py-0.5 rounded-md border ${subInfo?.color || "bg-slate-100 text-slate-600 border-slate-200"}`}>
                                {subInfo?.name.split(" ")[1] || g.subject}
                              </span>
                              <span className={`font-bold text-xs ${g.completed ? "text-slate-400 line-through" : "text-slate-800"}`}>
                                {g.title}
                              </span>
                            </div>
                            <button
                              onClick={() => handleDeleteGoal(g.id)}
                              className="text-[10px] text-slate-400 hover:text-rose-600 font-bold transition-colors cursor-pointer border-none bg-transparent"
                            >
                              ✕ 刪除
                            </button>
                          </div>

                          {/* Progress bar */}
                          <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden mb-3.5 relative">
                            <div 
                              style={{ width: `${progressPct}%` }}
                              className="bg-indigo-600 h-full rounded-full transition-all duration-500"
                            />
                          </div>

                          <div className="flex justify-between items-center">
                            <span className="text-[10px] font-bold text-slate-500">
                              進度：{g.loggedHours} / {g.targetHours} 小時 ({progressPct}%)
                            </span>
                            <div className="flex gap-1.5 items-center">
                              <button
                                onClick={() => handleLogHours(g.id, -0.5)}
                                disabled={g.loggedHours <= 0}
                                className="w-7 h-7 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-lg text-xs font-bold flex items-center justify-center cursor-pointer border border-slate-200/50 disabled:opacity-50"
                              >
                                -
                              </button>
                              <button
                                onClick={() => handleLogHours(g.id, 0.5)}
                                disabled={g.completed}
                                className="w-7 h-7 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-lg text-xs font-bold flex items-center justify-center cursor-pointer border border-slate-200/50 disabled:opacity-50"
                              >
                                +
                              </button>
                              <button
                                onClick={() => handleToggleGoalCompleted(g.id)}
                                className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold cursor-pointer transition-all ${
                                  g.completed 
                                    ? "bg-emerald-100 hover:bg-emerald-200 text-emerald-800 border border-emerald-200" 
                                    : "bg-slate-900 hover:bg-indigo-600 text-white"
                                }`}
                              >
                                {g.completed ? "✓ 已完成" : "✓ 點擊完成"}
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Right: Achievements Panel */}
            <div className="md:col-span-5 flex flex-col gap-6">
              <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
                <h3 className="font-extrabold text-base text-slate-800 mb-2 flex items-center gap-2">
                  <span>🏆</span> 學習成就系統
                </h3>
                <p className="text-xs text-slate-400 mb-6 font-semibold">達成日常學習里程碑，解鎖專屬榮譽徽章！</p>

                <div className="space-y-4">
                  {/* Badge 1: Focus King */}
                  {(() => {
                    const req = 5;
                    const val = totalPomoCount;
                    const unlocked = val >= req;
                    return (
                      <div className={`p-4 rounded-2xl border flex items-center gap-4 transition-all ${
                        unlocked 
                          ? "bg-orange-50/45 border-orange-200/60 shadow-sm" 
                          : "bg-slate-50/50 border-slate-200/50 grayscale opacity-60"
                      }`}>
                        <span className="text-3xl">🔥</span>
                        <div className="flex-1">
                          <div className="flex justify-between items-center">
                            <h4 className="font-bold text-xs text-slate-800">專注王者 (Focus King)</h4>
                            {unlocked && <span className="text-[9px] font-bold text-orange-600 bg-orange-100 px-1.5 py-0.5 rounded">已解鎖</span>}
                          </div>
                          <p className="text-[10px] text-slate-400 mt-0.5 font-semibold">累計完成 5 回番茄專注時段</p>
                          <div className="flex items-center gap-2 mt-2">
                            <div className="flex-1 bg-slate-200/60 h-1.5 rounded-full overflow-hidden">
                              <div style={{ width: `${Math.min(100, (val / req) * 100)}%` }} className="bg-orange-500 h-full rounded-full" />
                            </div>
                            <span className="text-[9px] font-bold text-slate-500 font-mono">{val} / {req}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Badge 2: Quiz Master */}
                  {(() => {
                    const req = 3;
                    const val = quizCompletedCount;
                    const unlocked = val >= req;
                    return (
                      <div className={`p-4 rounded-2xl border flex items-center gap-4 transition-all ${
                        unlocked 
                          ? "bg-indigo-50/45 border-indigo-200/60 shadow-sm" 
                          : "bg-slate-50/50 border-slate-200/50 grayscale opacity-60"
                      }`}>
                        <span className="text-3xl">🎯</span>
                        <div className="flex-1">
                          <div className="flex justify-between items-center">
                            <h4 className="font-bold text-xs text-slate-800">模擬考達人 (Quiz Master)</h4>
                            {unlocked && <span className="text-[9px] font-bold text-indigo-600 bg-indigo-100 px-1.5 py-0.5 rounded">已解鎖</span>}
                          </div>
                          <p className="text-[10px] text-slate-400 mt-0.5 font-semibold">累計完成 3 次 AI 模擬測驗</p>
                          <div className="flex items-center gap-2 mt-2">
                            <div className="flex-1 bg-slate-200/60 h-1.5 rounded-full overflow-hidden">
                              <div style={{ width: `${Math.min(100, (val / req) * 100)}%` }} className="bg-indigo-500 h-full rounded-full" />
                            </div>
                            <span className="text-[9px] font-bold text-slate-500 font-mono">{val} / {req}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Badge 3: Memory Master */}
                  {(() => {
                    const req = 30;
                    const val = flashcards.length;
                    const unlocked = val >= req;
                    return (
                      <div className={`p-4 rounded-2xl border flex items-center gap-4 transition-all ${
                        unlocked 
                          ? "bg-emerald-50/45 border-emerald-200/60 shadow-sm" 
                          : "bg-slate-50/50 border-slate-200/50 grayscale opacity-60"
                      }`}>
                        <span className="text-3xl">🗂️</span>
                        <div className="flex-1">
                          <div className="flex justify-between items-center">
                            <h4 className="font-bold text-xs text-slate-800">記憶大師 (Memory Master)</h4>
                            {unlocked && <span className="text-[9px] font-bold text-emerald-600 bg-emerald-100 px-1.5 py-0.5 rounded">已解鎖</span>}
                          </div>
                          <p className="text-[10px] text-slate-400 mt-0.5 font-semibold">累計建立 30 張學習記憶卡</p>
                          <div className="flex items-center gap-2 mt-2">
                            <div className="flex-1 bg-slate-200/60 h-1.5 rounded-full overflow-hidden">
                              <div style={{ width: `${Math.min(100, (val / req) * 100)}%` }} className="bg-emerald-500 h-full rounded-full" />
                            </div>
                            <span className="text-[9px] font-bold text-slate-500 font-mono">{val} / {req}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Badge 4: Socrates Disciple */}
                  {(() => {
                    const req = 10;
                    const val = socratesCount;
                    const unlocked = val >= req;
                    return (
                      <div className={`p-4 rounded-2xl border flex items-center gap-4 transition-all ${
                        unlocked 
                          ? "bg-purple-50/45 border-purple-200/60 shadow-sm" 
                          : "bg-slate-50/50 border-slate-200/50 grayscale opacity-60"
                      }`}>
                        <span className="text-3xl">🔍</span>
                        <div className="flex-1">
                          <div className="flex justify-between items-center">
                            <h4 className="font-bold text-xs text-slate-800">問到底學霸 (Socrates Disciple)</h4>
                            {unlocked && <span className="text-[9px] font-bold text-purple-600 bg-purple-100 px-1.5 py-0.5 rounded">已解鎖</span>}
                          </div>
                          <p className="text-[10px] text-slate-400 mt-0.5 font-semibold">在啟發引導模式累計發問 10 次</p>
                          <div className="flex items-center gap-2 mt-2">
                            <div className="flex-1 bg-slate-200/60 h-1.5 rounded-full overflow-hidden">
                              <div style={{ width: `${Math.min(100, (val / req) * 100)}%` }} className="bg-purple-500 h-full rounded-full" />
                            </div>
                            <span className="text-[9px] font-bold text-slate-500 font-mono">{val} / {req}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Badge 5: Consistent Learner */}
                  {(() => {
                    const req = 3;
                    const val = focusStreak;
                    const unlocked = val >= req;
                    return (
                      <div className={`p-4 rounded-2xl border flex items-center gap-4 transition-all ${
                        unlocked 
                          ? "bg-teal-50/45 border-teal-200/60 shadow-sm" 
                          : "bg-slate-50/50 border-slate-200/50 grayscale opacity-60"
                      }`}>
                        <span className="text-3xl">🗓️</span>
                        <div className="flex-1">
                          <div className="flex justify-between items-center">
                            <h4 className="font-bold text-xs text-slate-800">勤學不輟 (Consistent Learner)</h4>
                            {unlocked && <span className="text-[9px] font-bold text-teal-600 bg-teal-100 px-1.5 py-0.5 rounded">已解鎖</span>}
                          </div>
                          <p className="text-[10px] text-slate-400 mt-0.5 font-semibold">連續專注達 3 天以上</p>
                          <div className="flex items-center gap-2 mt-2">
                            <div className="flex-1 bg-slate-200/60 h-1.5 rounded-full overflow-hidden">
                              <div style={{ width: `${Math.min(100, (val / req) * 100)}%` }} className="bg-teal-500 h-full rounded-full" />
                            </div>
                            <span className="text-[9px] font-bold text-slate-500 font-mono">{val} / {req}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>

            {/* Create Goal Modal */}
            {showCreateGoalModal && (
              <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-[2px] z-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-2xl max-w-sm w-full flex flex-col gap-4 animate-scale-in">
                  <h3 className="font-extrabold text-sm text-slate-800">➕ 新增每週學習計畫</h3>
                  
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">計畫主題/任務描述</label>
                    <input
                      type="text"
                      placeholder="例如：完成力學平衡講義重點整理"
                      value={newGoalTitle}
                      onChange={(e) => setNewGoalTitle(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:border-indigo-500 font-bold"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">學習科目</label>
                    <select
                      value={newGoalSubject}
                      onChange={(e) => setNewGoalSubject(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:border-indigo-500 font-bold"
                    >
                      {Object.entries(SUBJECT_MAP).map(([key, info]) => (
                        <option key={key} value={key}>{info.name.split(" ")[1]}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">每週目標專注時數 (小時)</label>
                    <input
                      type="number"
                      min="0.5"
                      step="0.5"
                      value={newGoalHours}
                      onChange={(e) => setNewGoalHours(parseFloat(e.target.value) || 1)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:border-indigo-500 font-bold"
                    />
                  </div>

                  <div className="flex justify-end gap-2 mt-2">
                    <button
                      type="button"
                      onClick={() => setShowCreateGoalModal(false)}
                      className="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-xs font-bold cursor-pointer"
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      onClick={handleAddGoal}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold cursor-pointer shadow-sm shadow-indigo-100"
                    >
                      新增計畫
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
