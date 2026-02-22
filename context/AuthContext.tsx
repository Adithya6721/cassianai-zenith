"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
  type User,
} from "firebase/auth";
import { auth, googleProvider } from "@/lib/firebase";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  signInWithGoogle: async () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);

      // Force token refresh and log for debugging
      if (firebaseUser) {
        try {
          const token = await firebaseUser.getIdToken(true); // force refresh
          console.log("🔥 FIREBASE TOKEN:", token.substring(0, 50) + "...");
        } catch (err) {
          console.error("Token fetch failed:", err);
        }
      }
    });
    return unsubscribe;
  }, []);

  // Auto-refresh token every 50 minutes (tokens expire after 60 minutes)
  useEffect(() => {
    const interval = setInterval(async () => {
      const currentUser = auth.currentUser;
      if (currentUser) {
        try {
          await currentUser.getIdToken(true); // force refresh
          console.log("🔄 Token auto-refreshed");
        } catch (err) {
          console.error("Token auto-refresh failed:", err);
        }
      }
    }, 50 * 60 * 1000); // 50 minutes

    return () => clearInterval(interval);
  }, []);

  const signInWithGoogle = useCallback(async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error: any) {
      // Ignore harmless popup errors
      if (
        error?.code === "auth/popup-blocked" ||
        error?.code === "auth/cancelled-popup-request"
      ) {
        console.warn("Popup retry handled silently");
        return;
      }

      console.error("Google Sign-in error:", error);
      throw error;
    }
  }, []);


  const signOut = useCallback(async () => {
    try {
      // Kill Firebase session
      await firebaseSignOut(auth);

      // Clear React auth state
      setUser(null);

      // Clear cached Firebase login
      sessionStorage.clear();
      localStorage.removeItem("firebase:authUser");

      // Force redirect to Welcome page
      window.location.replace("/");
    } catch (error) {
      console.error("Logout error:", error);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, signInWithGoogle, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
