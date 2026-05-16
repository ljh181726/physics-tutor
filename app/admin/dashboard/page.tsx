"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "../../../lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { collection, addDoc, query, orderBy, getDocs, deleteDoc, doc } from "firebase/firestore";

export default function AdminDashboard() {
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  // 統計數據狀態
  const [studentsData, setStudentsData] = useState({}); // 存放每個學生的統計資料
  
  // 當前選中的學生
  const [selectedUid, setSelectedUid] = useState("");
  const [selectedName, setSelectedName] = useState("");

  // 選中學生的詳細資料
  const [studentWrongQuestions, setStudentWrongQuestions] = useState([]);
  const [studentKnowledge, setStudentKnowledge] = useState([]);

  // 新增講義表單狀態
  const [subject, setSubject] = useState("physics");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      // 🚀 鎖定管理員 Email
      if (!currentUser || currentUser.email !== "ljh181726@gmail.com") {
        alert("無權限訪問！");
        return router.push("/");
      }
      setIsAdmin(true);
      await calculateAnalytics();
      setLoading(false);
    });
    return () => unsubscribe();
  }, [router]);

  // 📊 核心演算法：撈取全系統資料並計算學生提問數據大盤
  const calculateAnalytics = async () => {
    try {
      // 撈取所有的對話房間，用來解析有哪些學生以及他們的科目
      const threadsSnapshot = await getDocs(collection(db, "threads"));
      
      // 撈取所有的聊天訊息，用來計算真正的「發問次數」
      const chatsSnapshot = await getDocs(collection(db, "chats"));
      
      const analytics = {};

      // 1. 先建立學生基本房間與科目對照
      threadsSnapshot.docs.forEach((docData) => {
        const data = docData.data();
        const uid = data.uid;
        if (!uid) return;

        if (!analytics[uid]) {
          analytics[uid] = {
            uid: uid,
            name: "未知學生",
            totalQuestions: 0,
            subjects: { physics: 0, math: 0, chemistry: 0, biology: 0, earth: 0 }
          };
        }
      });

      // 2. 計算每個學生在各科目的實際發問次數 (role === 'user')
      chatsSnapshot.docs.forEach((docData) => {
        const data = docData.data();
        const uid = data.uid;
        const role = data.role;
        const sub = data.subject || "physics";

        if (uid && role === "user" && analytics[uid]) {
          analytics[uid].totalQuestions += 1;
          if (analytics[uid].subjects[sub] !== undefined) {
            analytics[uid].subjects[sub] += 1;
          }
          // 順便把有記錄到的最新學生名字蓋上去
          if (data.userName) {
            analytics[uid].name = data.userName;
          }
        }
      });

      setStudentsData(analytics);
    } catch (err) {
      console.error("數據統計失敗:", err);
    }
  };

  // 🔍 點擊學生時，撈取該生專屬的錯題本與個人講義庫
  const handleSelectStudent = async (uid, name) => {
    setSelectedUid(uid);
    setSelectedName(name);
    try {
      // 1. 撈取該學生的錯題本
      const wqSnapshot = await getDocs(query(collection(db, `users/${uid}/wrong_questions`), orderBy("timestamp", "desc")));
      setStudentWrongQuestions(wqSnapshot.docs.map(d => ({ id: d.id, ...d.data() })));

      // 2. 撈取該學生的個人專屬講義庫
      const kbSnapshot = await getDocs(query(collection(db, `users/${uid}/knowledge_base`), orderBy("timestamp", "desc")));
      setStudentKnowledge(kbSnapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error("撈取學生詳細資料失敗", err);
    }
  };

  // ➕ 幫特定學生新增講義 (因材施教)
  const handleAddStudentKnowledge = async (e) => {
    e.preventDefault();
    if (!selectedUid) return alert("請先從左側選擇一位學生");
    if (!title.trim() || !content.trim()) return alert("標題與心法內容不能為空");

    setIsSaving(true);
    try {
      // 🚀 關鍵路徑：存入該選中學生的專屬 subcollection
      await addDoc(collection(db, `users/${selectedUid}/knowledge_base`), {
        subject, title, content, timestamp: Date.now()
      });
      alert(`✅ 已成功將講義放入【${selectedName}】的個人大腦中！`);
      setTitle(""); setContent("");
      // 重新整理講義列表
      handleSelectStudent(selectedUid, selectedName);
    } catch (err) {
      alert("儲存失敗：" + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // 🗑️ 刪除該學生的某條講義
  const handleDeleteKnowledge = async (id) => {
    if (!confirm("確定要移除這位學生的這條講義心法嗎？")) return;
    try {
      await deleteDoc(doc(db, `users/${selectedUid}/knowledge_base`, id));
      setStudentKnowledge(prev => prev.filter(k => k.id !== id));
    } catch (err) { alert("刪除失敗"); }
  };

  if (loading || !isAdmin) return <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-500">正在生成全班數據大盤...</div>;

  return (
    <div className="min-h-screen bg-gray-100 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        
        <header className="bg-white p-6 rounded-3xl shadow-sm border flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-black text-gray-800">📊 導師精準教學決策大盤</h1>
            <p className="text-sm text-gray-400 mt-1">即時監控每位學生的學習狀況，實施因材施教</p>
          </div>
          <button onClick={() => router.push("/")} className="bg-gray-800 text-white px-5 py-2 rounded-xl font-bold hover:bg-gray-700 transition-all shadow-sm">返回大廳</button>
        </header>

        {/* 區塊一：全班學習數據分析矩陣 */}
        <div className="bg-white p-6 rounded-3xl shadow-sm border">
          <h2 className="text-lg font-bold text-gray-700 mb-4">👥 全班學生學習活躍度與科目分佈</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b text-gray-400 text-sm">
                  <th className="pb-3 pl-2">學生姓名</th>
                  <th className="pb-3 text-center">總發問次數</th>
                  <th className="pb-3 text-center">🍎 物理</th>
                  <th className="pb-3 text-center">📐 數學</th>
                  <th className="pb-3 text-center">🧪 化學</th>
                  <th className="pb-3 text-center">🧬 生物</th>
                  <th className="pb-3 text-center">🌍 地科</th>
                  <th className="pb-3 text-right pr-2">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y text-gray-700 font-medium">
                {Object.values(studentsData).map((student: any) => (
                  <tr key={student.uid} className={`hover:bg-blue-50/50 transition-colors ${selectedUid === student.uid ? 'bg-blue-50' : ''}`}>
                    <td className="py-4 pl-2 font-bold text-gray-900">{student.name}</td>
                    <td className="py-4 text-center"><span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-xs font-bold">{student.totalQuestions} 次</span></td>
                    <td className="py-4 text-center text-blue-600">{student.subjects.physics}</td>
                    <td className="py-4 text-center text-red-600">{student.subjects.math}</td>
                    <td className="py-4 text-center text-green-600">{student.subjects.chemistry}</td>
                    <td className="py-4 text-center text-purple-600">{student.subjects.biology}</td>
                    <td className="py-4 text-center text-amber-600">{student.subjects.earth}</td>
                    <td className="py-4 text-right pr-2">
                      <button 
                        onClick={() => handleSelectStudent(student.uid, student.name)}
                        className="bg-blue-600 text-white text-xs px-3 py-1.5 rounded-lg font-bold hover:bg-blue-700 transition-colors"
                      >
                        調閱學生檔案 ➔
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 區塊二：當前選中學生的追蹤面板 */}
        {selectedUid ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* 左：因材施教——專屬講義投放區 */}
            <div className="bg-white p-6 rounded-3xl shadow-sm border h-fit space-y-4">
              <h3 className="text-lg font-bold text-gray-800">🎯 針對【{selectedName}】投放專屬心法</h3>
              <form onSubmit={handleAddStudentKnowledge} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-1">強化科目</label>
                  <select value={subject} onChange={e => setSubject(e.target.value)} className="w-full border rounded-xl p-2.5 bg-gray-50 font-semibold text-gray-700">
                    <option value="physics">🍎 高中物理</option>
                    <option value="math">📐 高中數學</option>
                    <option value="chemistry">🧪 高中化學</option>
                    <option value="biology">🧬 高中生物</option>
                    <option value="earth">🌍 高中地科</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-1">知識點/弱點標題</label>
                  <input type="text" value={title} onChange={e => setTitle(e.target.value)} className="w-full border rounded-xl p-2.5 bg-gray-50" placeholder="例如：針對平面向量拆解..." />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-1">給該學生的專屬解題秘笈</label>
                  <textarea value={content} onChange={e => setContent(e.target.value)} className="w-full border rounded-xl p-2.5 bg-gray-50 h-40 text-sm" placeholder="在這裡寫下的口訣與步驟，AI 將在該學生提問時絕對優先採用..." />
                </div>
                <button type="submit" disabled={isSaving} className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl hover:bg-blue-700 transition-all shadow-md">
                  {isSaving ? "正在寫入大腦..." : `存入 ${selectedName} 的 AI 大腦`}
                </button>
              </form>
            </div>

            {/* 中：學生的個人專屬資料庫清單 */}
            <div className="bg-white p-6 rounded-3xl shadow-sm border space-y-4">
              <h3 className="text-lg font-bold text-gray-800">📚 {selectedName} 的專屬資料庫 ({studentKnowledge.length})</h3>
              <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                {studentKnowledge.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-8">目前該學生使用的是通用課綱，尚無投放專屬心法。</p>
                ) : (
                  studentKnowledge.map((item: any) => (
                    <div key={item.id} className="p-4 bg-gray-50 rounded-2xl border flex flex-col gap-1 relative group">
                      <div className="flex justify-between items-start">
                        <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded">{item.subject}</span>
                        <button onClick={() => handleDeleteKnowledge(item.id)} className="text-red-400 hover:text-red-600 text-xs opacity-0 group-hover:opacity-100 transition-opacity">🗑️ 移除</button>
                      </div>
                      <h4 className="font-bold text-gray-800 text-sm mt-1">{item.title}</h4>
                      <p className="text-xs text-gray-500 line-clamp-3 whitespace-pre-wrap mt-1">{item.content}</p>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* 右：調閱學生的個人錯題本 */}
            <div className="bg-white p-6 rounded-3xl shadow-sm border space-y-4">
              <h3 className="text-lg font-bold text-gray-800">⭐ {selectedName} 的個人錯題本 ({studentWrongQuestions.length})</h3>
              <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                {studentWrongQuestions.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-8">該學生目前尚未將任何題目加入錯題本。</p>
                ) : (
                  studentWrongQuestions.map((item: any) => (
                    <div key={item.id} className="p-4 bg-yellow-50/60 rounded-2xl border border-yellow-100 flex flex-col gap-1">
                      <span className="text-[10px] font-bold bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded w-fit">{item.subject}</span>
                      <h4 className="font-bold text-gray-800 text-sm mt-1">❓ 學生提問：</h4>
                      <p className="text-xs text-gray-600 line-clamp-2 bg-white p-2 rounded-lg border border-gray-100">{item.question}</p>
                      <h4 className="font-bold text-gray-800 text-sm mt-1">💡 AI 解答：</h4>
                      <p className="text-xs text-gray-500 line-clamp-2 bg-white p-2 rounded-lg border border-gray-100">{item.answer}</p>
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>
        ) : (
          <div className="bg-white p-12 rounded-3xl border text-center text-gray-400 font-medium shadow-sm">
            💡 請在上方表格點擊「調閱學生檔案」，即可深入管理該學生的專屬錯題本與個人資料庫。
          </div>
        )}
      </div>
    </div>
  );
}
