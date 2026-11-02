"use client";

import Link from "next/link";
import { ArrowLeftRight, ArrowUpRight, GraduationCap, LogOut, RefreshCw, Sparkles } from "lucide-react";
import { useSession } from "./session";
import type { Role } from "@/lib/types";

export function Brand() {
  return <Link href="/" className="brand" aria-label="Quizbee home"><span className="brand-mark"><span /></span><span>quizbee<span className="brand-dot">.</span></span></Link>;
}

export function Header() {
  const { user, token, role, error, connect, disconnect } = useSession();
  return <><header className="topbar"><div className="topbar-inner">
    <Brand />
    <div className="header-right">
      {user && role && <><span className="role-pill">{role === "teacher" ? "Teacher space" : "Student space"}</span><span className="user-name">{user.displayName || user.email}</span>
        <button className="icon-button" title={`Switch to ${role === "teacher" ? "student" : "teacher"}`} aria-label={`Switch to ${role === "teacher" ? "student" : "teacher"}`} onClick={() => connect(role === "teacher" ? "student" : "teacher")}><ArrowLeftRight size={17} /></button>
        <button className="icon-button" title="Reconnect Google" aria-label="Reconnect Google" onClick={() => connect(role)}><RefreshCw size={17} /></button>
        <button className="icon-button" title="Sign out" aria-label="Sign out" onClick={disconnect}><LogOut size={17} /></button></>}
    </div>
  </div></header>{user && token && role && error && <div className="wrap header-notice"><Notice>{error}</Notice></div>}</>;
}

export function Notice({ children }: { children: React.ReactNode }) {
  return <div className="notice" role="alert">{children}</div>;
}

export function Login({ studentOnly = false }: { studentOnly?: boolean }) {
  const { connect, error, user } = useSession();
  const choose = (role: Role) => connect(role);
  return <main className="landing wrap">
    <div className="landing-copy">
      <div className="eyebrow"><Sparkles size={15} /> A LITTLE MORE ENGAGING</div>
      <h1>Big learning,<br /><em>little moments.</em></h1>
      <p>Turn any video into an interactive learning adventure. Create, share, and learn together with Google Classroom.</p>
      {error && <Notice>{error}</Notice>}
      {user && <p className="small muted">Connect your Google account to continue. Classroom permissions are requested when you connect.</p>}
      <div className="login-actions">
        {!studentOnly && <button className="button primary" onClick={() => choose("teacher")}><GraduationCap size={19} /> I&apos;m a teacher <ArrowUpRight size={17} /></button>}
        <button className="button secondary" onClick={() => choose("student")}>I&apos;m a student <ArrowUpRight size={17} /></button>
      </div>
      <div className="google-note"><span className="google-g">G</span> Sign in or sign up securely with Google</div>
    </div>
    <div className="landing-art" aria-hidden="true">
      <div className="art-glow" />
      <div className="art-card video-art"><div className="art-video"><div className="play-triangle" /></div><div className="art-video-bottom"><span>THE WORLD AROUND US</span><strong>Learning is an adventure.</strong><div className="art-line" /></div></div>
      <div className="art-card question-art"><span className="tiny-label">A QUICK CHECK-IN ✦</span><strong>Ready for a little quiz?</strong><div className="art-option"><span>A</span> Absolutely!</div><div className="art-option active"><span>B</span> Let&apos;s do this <b>✓</b></div></div>
      <div className="art-badge">✦<br /><span>MADE FOR<br />CURIOUS MINDS</span></div>
    </div>
  </main>;
}

export function Loading({ label = "Getting things ready..." }: { label?: string }) {
  return <div className="loading"><span className="spinner" />{label}</div>;
}
