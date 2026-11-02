"use client";

import { use } from "react";
import { PlayerPage } from "@/components/player";
import { Loading, Login } from "@/components/shell";
import { useSession } from "@/components/session";

export default function Play({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user, token, role, loading } = useSession();
  if (loading) return <Loading />;
  if (!user || !token || role !== "student") return <Login studentOnly />;
  return <PlayerPage id={id} />;
}
