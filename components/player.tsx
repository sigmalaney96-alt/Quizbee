"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, CircleCheck, Clock3, Pause, Play, RotateCcw, Send, Sparkles } from "lucide-react";
import { formatTime } from "@/lib/quiz";
import type { StudentAssignment, StudentQuestion } from "@/lib/types";
import { useSession } from "./session";
import { Loading, Notice } from "./shell";

type YouTubePlayer = {
  getCurrentTime: () => number;
  getPlayerState: () => number;
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  destroy: () => void;
};
type PlayerEvent = { data: number; target: YouTubePlayer };
type YouTubeNamespace = {
  Player: new (element: HTMLElement, options: {
    videoId: string;
    host: string;
    playerVars: Record<string, number | string>;
    events: { onReady: (event: PlayerEvent) => void; onStateChange: (event: PlayerEvent) => void; onError: (event: PlayerEvent) => void };
  }) => YouTubePlayer;
};
declare global {
  interface Window { YT?: YouTubeNamespace; onYouTubeIframeAPIReady?: () => void }
}

let youtubePromise: Promise<YouTubeNamespace> | null = null;
function loadYouTube(): Promise<YouTubeNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (youtubePromise) return youtubePromise;
  const promise = new Promise<YouTubeNamespace>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error("YouTube could not load. Check your connection or content blocker and reload.")), 15000);
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      window.clearTimeout(timer);
      if (window.YT?.Player) resolve(window.YT);
      else reject(new Error("YouTube player is unavailable."));
    };
    const existing = document.querySelector<HTMLScriptElement>('script[src="https://www.youtube.com/iframe_api"]');
    if (!existing) {
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      script.onerror = () => { window.clearTimeout(timer); reject(new Error("YouTube could not load. Check your connection and reload.")); };
      document.head.appendChild(script);
    }
  }).catch((error) => { youtubePromise = null; throw error; });
  youtubePromise = promise;
  return promise;
}

type Completed = { completed: true; score: number; total: number };

export function PlayerPage({ id }: { id: string }) {
  const { request, connect } = useSession();
  const [assignment, setAssignment] = useState<StudentAssignment | null>(null);
  const [completed, setCompleted] = useState<Completed | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    request<StudentAssignment | Completed>(`assignments/${encodeURIComponent(id)}`).then((data) => {
      if (!active) return;
      if ("completed" in data) setCompleted(data);
      else setAssignment((current) => current?.id === data.id ? current : data);
    }).catch((err) => { if (active) setError(err instanceof Error ? err.message : "Could not load this Quizbee."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id, request]);

  if (loading) return <Loading label="Opening your Quizbee..." />;
  if (completed) return <Complete score={completed.score} total={completed.total} />;
  if (!assignment) return <main className="wrap player-wrap"><Link className="back-link" href="/"><ArrowLeft size={16} /> Back to my Quizbees</Link><Notice>{error} <button className="inline-link" onClick={() => connect("student")}>Reconnect Google</button></Notice></main>;
  return <VideoQuiz assignment={assignment} onComplete={(score, total) => setCompleted({ completed: true, score, total })} />;
}

function Complete({ score, total }: { score: number; total: number }) {
  return <main className="wrap complete-wrap"><div className="complete-card"><div className="complete-icon"><Check size={32} /></div><div className="eyebrow">ALL DONE <span>✦</span></div><h1>Look at you go!</h1><p>Your Quizbee is turned in on Google Classroom and your teacher can see your score.</p><div className="score-box"><span>YOUR SCORE</span><strong>{score}<small> / {total}</small></strong><p>{Math.round(score / total * 100)}% correct</p></div><Link href="/" className="button primary">Back to my Quizbees <ArrowRight size={17} /></Link></div></main>;
}

function VideoQuiz({ assignment, onComplete }: { assignment: StudentAssignment; onComplete: (score: number, total: number) => void }) {
  const { request, connect } = useSession();
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const answersRef = useRef<Record<string, number>>({});
  const activeRef = useRef<StudentQuestion | null>(null);
  const endedRef = useRef(false);
  const seekUntilRef = useRef(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [active, setActive] = useState<StudentQuestion | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [finished, setFinished] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const ask = useCallback((question: StudentQuestion) => {
    activeRef.current = question;
    setActive(question);
    setSelected(null);
    playerRef.current?.pauseVideo();
  }, []);

  useEffect(() => {
    let cancelled = false;
    let player: YouTubePlayer | null = null;
    let interval: number | undefined;
    loadYouTube().then((YT) => {
      if (cancelled || !containerRef.current) return;
      const element = document.createElement("div");
      containerRef.current.appendChild(element);
      player = new YT.Player(element, {
        videoId: assignment.video.id, host: "https://www.youtube-nocookie.com",
        playerVars: { controls: 0, disablekb: 1, playsinline: 1, rel: 0, origin: window.location.origin },
        events: {
          onReady: (event) => {
            playerRef.current = event.target;
            setReady(true);
          },
          onStateChange: (event) => {
            setPlaying(event.data === 1);
            if (event.data === 0) {
              endedRef.current = true;
              const next = assignment.questions.find((question) => !(question.id in answersRef.current));
              if (next) ask(next);
              else setFinished(true);
            }
          },
          onError: () => setError("This video cannot be played here. Ask your teacher to choose another embeddable video."),
        },
      });
      interval = window.setInterval(() => {
        const current = playerRef.current;
        if (!current || current.getPlayerState() !== 1 || activeRef.current || Date.now() < seekUntilRef.current) return;
        const next = assignment.questions.find((question) => !(question.id in answersRef.current) && current.getCurrentTime() >= question.time);
        if (next) ask(next);
      }, 250);
    }).catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : "Could not load YouTube."); });
    return () => {
      cancelled = true;
      if (interval) window.clearInterval(interval);
      player?.destroy();
      playerRef.current = null;
      containerRef.current?.replaceChildren();
    };
  }, [assignment, ask]);

  function answer() {
    if (!active || selected === null) return;
    const nextAnswers = { ...answersRef.current, [active.id]: selected };
    answersRef.current = nextAnswers;
    setAnswers(nextAnswers);
    activeRef.current = null;
    setActive(null);
    if (endedRef.current) {
      const next = assignment.questions.find((question) => !(question.id in nextAnswers));
      if (next) ask(next);
      else setFinished(true);
    } else {
      playerRef.current?.playVideo();
    }
  }

  function rewind() {
    if (!active) return;
    endedRef.current = false;
    setFinished(false);
    seekUntilRef.current = Date.now() + 500;
    playerRef.current?.seekTo(Math.max(0, active.time - 30), true);
    activeRef.current = null;
    setActive(null);
    playerRef.current?.playVideo();
  }

  async function turnIn() {
    setBusy(true); setError("");
    try {
      const result = await request<{ score: number; total: number }>(`assignments/${encodeURIComponent(assignment.id)}/turn-in`, {
        method: "POST", body: JSON.stringify(answersRef.current),
      });
      onComplete(result.score, result.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not turn in your Quizbee.");
    } finally { setBusy(false); }
  }

  const answered = Object.keys(answers).length;
  return <main className="wrap player-wrap"><Link className="back-link" href="/"><ArrowLeft size={16} /> Back to my Quizbees</Link>
    <div className="player-heading"><div><div className="eyebrow">{assignment.courseName.toUpperCase()} <span>✦</span></div><h1>{assignment.title}</h1><p>Watch the video and answer the questions along the way.</p></div><div className="progress-pill"><CircleCheck size={17} /> {answered} / {assignment.questions.length} answered</div></div>
    {error && <Notice>{error} <button className="inline-link" onClick={() => connect("student")}>Reconnect Google</button></Notice>}
    <div className="player-layout"><div><div className="player-box"><div className="youtube-player" ref={containerRef} />
      {active && <div className="question-overlay" role="dialog" aria-modal="true" aria-labelledby="question-title"><div className="quiz-popup">
        <div className="popup-top"><span><Sparkles size={14} /> QUICK CHECK-IN</span><span>{answered + 1} / {assignment.questions.length}</span></div><h2 id="question-title">{active.prompt}</h2><p>Pick the answer you think is right.</p>
        <div className="popup-options">{active.options.map((option, index) => <button key={index} className={`popup-option ${selected === index ? "active" : ""}`} onClick={() => setSelected(index)}><span>{String.fromCharCode(65 + index)}</span>{option}{selected === index && <Check size={17} />}</button>)}</div>
        <div className="popup-actions"><button className="text-button" onClick={rewind}><RotateCcw size={16} /> Rewind 30 sec</button><button className="button primary" disabled={selected === null} onClick={answer}>Continue <ArrowRight size={16} /></button></div>
      </div></div>}
    </div><div className="player-controls"><div><strong>{assignment.video.title}</strong><span>{assignment.video.channel} · {formatTime(assignment.video.duration)}</span></div><button className="button secondary compact" disabled={!ready || !!active || finished} onClick={() => playing ? playerRef.current?.pauseVideo() : playerRef.current?.playVideo()}>{playing ? <Pause size={15} /> : <Play size={15} />} {playing ? "Pause" : "Play"}</button></div></div>
      <aside className="player-side"><span className="section-kicker">YOUR PROGRESS</span><h2>One step at a time.</h2><p>Questions will pop up as you watch. Need another look? Rewind and try again.</p><div className="progress-track"><span style={{ width: `${answered / assignment.questions.length * 100}%` }} /></div><div className="progress-copy">{answered} of {assignment.questions.length} questions answered</div><div className="player-divider" /><div className="side-detail"><Clock3 size={17} /><span>Watch the full video to unlock turn in.</span></div><button className="button primary full-width" disabled={!finished || busy} onClick={turnIn}><Send size={16} /> {busy ? "Turning in..." : "Turn in"}</button><p className="small muted">Your score is shared with your teacher when you turn in.</p></aside>
    </div>
  </main>;
}
