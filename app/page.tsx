"use client";

import { Dashboard } from "@/components/dashboard";
import { Loading, Login } from "@/components/shell";
import { useSession } from "@/components/session";

export default function Home() {
  const { user, token, role, loading } = useSession();
  if (loading) return <Loading />;
  if (!user || !token || !role) return <Login />;
  return <Dashboard key={role} role={role} />;
}
