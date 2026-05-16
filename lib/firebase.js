import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// 這是你專屬的 Firebase 金鑰
const firebaseConfig = {
  apiKey: "AIzaSyDg3jRz77w77PZlcoJJEuYRYSCH2_ocfyE",
  authDomain: "ai-tutor-platform-51d94.firebaseapp.com",
  projectId: "ai-tutor-platform-51d94",
  storageBucket: "ai-tutor-platform-51d94.firebasestorage.app",
  messagingSenderId: "205549448794",
  appId: "1:205549448794:web:fe4a96216e1bdaaf2b7263",
  measurementId: "G-SC0MHPV1ER"
};

// 避免在 Next.js 的伺服器端渲染中重複初始化
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

export { auth, db, googleProvider, signInWithPopup, signOut };
