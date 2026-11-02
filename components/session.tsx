"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut, type User } from "firebase/auth";
import { parseApiResponse } from "@/lib/api-response";
import { clientAuth } from "@/lib/firebase-client";
import type { Role } from "@/lib/types";

type Session = {
  user: User | null;
  token: string | null;
  role: Role | null;
  loading: boolean;
  error: string;
  connect: (role: Role) => Promise<void>;
  disconnect: () => Promise<void>;
  request: <T>(path: string, init?: RequestInit) => Promise<T>;
};

const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    try {
      const savedRole = sessionStorage.getItem("quizbee-role");
      setRole(savedRole === "teacher" || savedRole === "student" ? savedRole : null);
      setToken(sessionStorage.getItem("quizbee-google-token"));
      return onAuthStateChanged(clientAuth(), (current) => {
        setUser(current);
        setLoading(false);
      }, (err) => {
        setError(err.message);
        setLoading(false);
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not initialize Firebase.");
      setLoading(false);
    }
  }, []);

  const connect = useCallback(async (nextRole: Role) => {
    setError("");
    try {
      const provider = new GoogleAuthProvider();
      provider.addScope("https://www.googleapis.com/auth/classroom.courses.readonly");
      provider.addScope(nextRole === "teacher"
        ? "https://www.googleapis.com/auth/classroom.coursework.students"
        : "https://www.googleapis.com/auth/classroom.coursework.me");
      provider.setCustomParameters({ prompt: "select_account" });
      const result = await signInWithPopup(clientAuth(), provider);
      const accessToken = GoogleAuthProvider.credentialFromResult(result)?.accessToken;
      if (!accessToken) throw new Error("Google did not provide a Classroom access token. Please try again.");
      sessionStorage.setItem("quizbee-google-token", accessToken);
      sessionStorage.setItem("quizbee-role", nextRole);
      setToken(accessToken);
      setRole(nextRole);
      setUser(result.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google sign-in failed.");
    }
  }, []);

  const disconnect = useCallback(async () => {
    try {
      await signOut(clientAuth());
      sessionStorage.removeItem("quizbee-google-token");
      sessionStorage.removeItem("quizbee-role");
      setToken(null);
      setRole(null);
      setUser(null);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign out.");
    }
  }, []);

  const request = useCallback(async <T,>(path: string, init?: RequestInit): Promise<T> => {
    if (!user || !token) throw new Error("Please reconnect your Google account.");
    const idToken = await user.getIdToken();
    const response = await fetch(`/api/${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
        "X-Google-Token": token,
        ...init?.headers,
      },
    });
    return parseApiResponse<T>(response);
  }, [user, token]);

  const value = useMemo(() => ({ user, token, role, loading, error, connect, disconnect, request }),
    [user, token, role, loading, error, connect, disconnect, request]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const session = useContext(SessionContext);
  if (!session) throw new Error("SessionProvider is missing.");
  return session;
}
