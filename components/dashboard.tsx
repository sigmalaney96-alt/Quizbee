"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowDownRight, ArrowRight, BookOpen, CalendarDays, Check, ChevronRight, CirclePlay, ClipboardList, Clock3, Layers3, Plus, Search, Send, Sparkles, Trash2, Users } from "lucide-react";
import { formatTime, parseTime } from "@/lib/quiz";
import type { Course, Question, Quiz, Role, TeacherAssignment, Video } from "@/lib/types";
import { useSession } from "./session";
import { Loading, Notice } from "./shell";

type StudentItem = { id: string; title: string; courseId: string; courseName: string; video: Video; dueAt: string | null };
type Tab = "overview" | "library" | "create" | "assign";

function dueLabel(dueAt: string | null) {
  return dueAt ? new Date(dueAt).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "No due date";
}

function Empty({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="empty"><div className="empty-icon"><Sparkles size={20} /></div><h3>{title}</h3><p>{children}</p></div>;
}

export function Dashboard({ role }: { role: Role }) {
  const { user, request, connect } = useSession();
  const [courses, setCourses] = useState<Course[]>([]);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [teacherAssignments, setTeacherAssignments] = useState<TeacherAssignment[]>([]);
  const [studentAssignments, setStudentAssignments] = useState<StudentItem[]>([]);
  const [tab, setTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setError("");
    try {
      const [courseData, assignments] = await Promise.all([
        request<Course[]>(`courses?role=${role}`),
        request<TeacherAssignment[] | StudentItem[]>(`assignments?role=${role}`),
      ]);
      setCourses(courseData);
      if (role === "teacher") {
        setTeacherAssignments(assignments as TeacherAssignment[]);
        setQuizzes(await request<Quiz[]>("quizzes"));
      } else {
        setStudentAssignments(assignments as StudentItem[]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load your Classroom.");
    } finally {
      setLoading(false);
    }
  }, [request, role]);

  useEffect(() => { void refresh(); }, [refresh]);

  if (loading) return <Loading label="Connecting to your Classroom..." />;
  const firstName = user?.displayName?.split(" ")[0] || (role === "teacher" ? "teacher" : "there");

  return <div className="app-layout wrap">
    <aside className="sidebar">
      <div className="sidebar-label">YOUR SPACE</div>
      <button className={`side-link ${tab === "overview" ? "selected" : ""}`} onClick={() => setTab("overview")}><Layers3 size={18} /> Overview</button>
      {role === "teacher" && <>
        <button className={`side-link ${tab === "library" ? "selected" : ""}`} onClick={() => setTab("library")}><BookOpen size={18} /> My Quizbees <span>{quizzes.length}</span></button>
        <button className={`side-link ${tab === "create" ? "selected" : ""}`} onClick={() => setTab("create")}><Plus size={18} /> Create a Quizbee</button>
        <button className={`side-link ${tab === "assign" ? "selected" : ""}`} onClick={() => setTab("assign")}><Send size={18} /> Assign</button>
      </>}
      <div className="sidebar-bottom"><div className="sidebar-note"><span>✦</span><strong>Good things grow here.</strong><p>A little curiosity goes a long way.</p></div>
        <button className="text-button switch-role" onClick={() => connect(role === "teacher" ? "student" : "teacher")}>Switch to {role === "teacher" ? "student" : "teacher"} <ArrowRight size={14} /></button>
      </div>
    </aside>
    <main className="dashboard">
      {error && <Notice>{error} <button className="inline-link" onClick={() => { setLoading(true); void refresh(); }}>Try again</button> or <button className="inline-link" onClick={() => connect(role)}>reconnect Google</button>.</Notice>}
      {role === "student" ? <>
        <div className="page-heading"><div><div className="eyebrow">YOUR LEARNING SPACE <span>✦</span></div><h1>Hey, {firstName}!</h1><p>Ready to learn something new?</p></div><div className="heading-stamp">GOOD DAY<br /><b>TO LEARN ✳</b></div></div>
        <div className="feature-banner"><div><div className="tiny-label">A LITTLE PROGRESS EVERY DAY</div><h2>Curiosity looks good on you.</h2><p>Watch, wonder, and see what you discover.</p></div><div className="banner-sparkle">✳</div></div>
        <div className="section-heading"><div><span className="section-kicker">PICK UP WHERE YOU LEFT OFF</span><h2>To do <span className="count-badge">{studentAssignments.length}</span></h2></div><span className="muted small">Your open Quizbees from Classroom</span></div>
        {studentAssignments.length === 0 ? <Empty title="All caught up!">New Quizbees assigned in Google Classroom will show up here.</Empty> :
          <div className="card-grid">{studentAssignments.map((item) => <Link className="quiz-card student-card" key={item.id} href={`/play/${item.id}`}>
            <div className="thumbnail"><img src={item.video.thumbnail} alt="" /><span className="thumb-play"><CirclePlay size={23} /></span></div>
            <div className="card-content"><span className="card-tag">{item.courseName}</span><h3>{item.title}</h3><div className="card-meta"><Clock3 size={14} /> {formatTime(item.video.duration)} <span>·</span> <CalendarDays size={14} /> {dueLabel(item.dueAt)}</div><div className="card-action">Start learning <ArrowRight size={16} /></div></div>
          </Link>)}</div>}
      </> : <>
        {tab === "overview" && <>
          <div className="page-heading"><div><div className="eyebrow">YOUR TEACHER SPACE <span>✦</span></div><h1>Welcome back, {firstName}.</h1><p>Let&apos;s make learning a little more memorable.</p></div><button className="button primary" onClick={() => setTab("create")}><Plus size={18} /> Create a Quizbee</button></div>
          <div className="teacher-banner"><div><span className="tiny-label">A FRESH WAY TO LEARN</span><h2>Press play on<br /><em>something good.</em></h2><p>Turn videos into moments of discovery, one question at a time.</p><button className="button dark" onClick={() => setTab("create")}>Let&apos;s create <ArrowRight size={16} /></button></div><div className="banner-illustration"><div className="banner-play"><div className="play-triangle" /></div><div className="banner-float">✦<span>SMARTER<br />TOGETHER</span></div></div></div>
          <div className="stats-row"><div><span><BookOpen size={17} /> YOUR LIBRARY</span><strong>{quizzes.length}</strong><small>Quizbees created</small></div><div><span><Send size={17} /> OUT IN THE WORLD</span><strong>{teacherAssignments.filter((item) => item.status === "published").length}</strong><small>Quizbees assigned</small></div><div><span><Users size={17} /> CLASSROOMS</span><strong>{courses.length}</strong><small>Active classrooms</small></div></div>
          <Outgoing assignments={teacherAssignments} onAssign={() => setTab("assign")} onRefresh={refresh} />
        </>}
        {tab === "library" && <><div className="page-heading"><div><div className="eyebrow">MADE BY YOU <span>✦</span></div><h1>My Quizbees.</h1><p>Your collection of curious little lessons.</p></div><button className="button primary" onClick={() => setTab("create")}><Plus size={18} /> Create a Quizbee</button></div>
          {quizzes.length === 0 ? <Empty title="Your library starts here.">Create your first Quizbee to turn a video into an interactive lesson.</Empty> : <div className="card-grid">{quizzes.map((quiz) => <div className="quiz-card" key={quiz.id}><div className="thumbnail"><img src={quiz.video.thumbnail} alt="" /><span className="thumb-duration">{formatTime(quiz.video.duration)}</span></div><div className="card-content"><span className="card-tag">{quiz.courseName}</span><h3>{quiz.title}</h3><div className="card-meta"><ClipboardList size={15} /> {quiz.questions.length} questions</div><button className="card-action" onClick={() => setTab("assign")}>Assign Quizbee <ArrowRight size={16} /></button></div></div>)}</div>}
        </>}
        {tab === "create" && <CreateQuiz courses={courses} onSaved={async () => { await refresh(); setTab("library"); }} />}
        {tab === "assign" && <AssignQuiz courses={courses} quizzes={quizzes} onAssigned={async () => { await refresh(); setTab("overview"); }} />}
      </>}
    </main>
  </div>;
}

function Outgoing({ assignments, onAssign, onRefresh }: { assignments: TeacherAssignment[]; onAssign: () => void; onRefresh: () => Promise<void> }) {
  const { request } = useSession();
  const [message, setMessage] = useState("");
  const [checking, setChecking] = useState("");

  async function reconcile(id: string) {
    setChecking(id); setMessage("");
    try {
      const result = await request<{ found: boolean }>(`assignments/${encodeURIComponent(id)}/reconcile`, { method: "POST" });
      if (result.found) await onRefresh();
      else setMessage("No matching post was found in Classroom. You can try assigning the Quizbee again.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not check the Classroom post.");
    } finally { setChecking(""); }
  }

  return <><div className="section-heading"><div><span className="section-kicker">KEEPING TRACK</span><h2>Outgoing Quizbees <span className="count-badge">{assignments.length}</span></h2></div><button className="text-button" onClick={onAssign}>Assign a Quizbee <ArrowUpRightIcon /></button></div>
    {message && <Notice>{message}</Notice>}
    {assignments.length === 0 ? <Empty title="Nothing outgoing yet.">Assign a Quizbee to a Classroom and see your students&apos; scores here.</Empty> :
      <div className="outgoing-list">{assignments.map((item) => <div className="outgoing" key={item.id}>
        <div className="outgoing-main"><div className="outgoing-icon"><CirclePlay size={20} /></div><div><h3>{item.title}</h3><p>{item.courseName} <span>·</span> Due {dueLabel(item.dueAt)}</p></div><span className={`status ${item.status}`}>{item.status === "published" ? "Assigned" : item.status === "error" ? "Post unconfirmed" : "Publishing"}</span></div>
        {item.status !== "published" && <p className="small warning-text">This post was not confirmed by Quizbee. <button className="inline-link" disabled={!!checking} onClick={() => reconcile(item.id)}>{checking === item.id ? "Checking..." : "Check Classroom"}</button> before assigning again.</p>}
        {item.status === "published" && <div className="results"><div className="results-heading"><span><Users size={15} /> {item.results.length} turned in</span>{item.classroomLink && <a href={item.classroomLink} target="_blank" rel="noreferrer">Open in Classroom <ArrowDownRight size={14} /></a>}</div>
          {item.results.map((result) => <div className="result-row" key={result.studentUid}><span>{result.studentName}</span><strong>{result.score} / {result.total} <small>({Math.round(result.score / result.total * 100)}%)</small></strong></div>)}
        </div>}
      </div>)}</div>}
  </>;
}

function ArrowUpRightIcon() { return <ArrowRight size={15} />; }

function CreateQuiz({ courses, onSaved }: { courses: Course[]; onSaved: () => Promise<void> }) {
  const { request } = useSession();
  const [title, setTitle] = useState("");
  const [courseId, setCourseId] = useState("");
  const [query, setQuery] = useState("");
  const [videos, setVideos] = useState<Video[]>([]);
  const [video, setVideo] = useState<Video | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [time, setTime] = useState("");
  const [prompt, setPrompt] = useState("");
  const [options, setOptions] = useState(["", "", "", ""]);
  const [correctIndex, setCorrectIndex] = useState(-1);
  const [busy, setBusy] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState("");

  async function search(event: React.FormEvent) {
    event.preventDefault();
    setError(""); setBusy(true);
    try {
      setVideos(await request<Video[]>(`videos?q=${encodeURIComponent(query)}`));
      setSearched(true);
    } catch (err) { setError(err instanceof Error ? err.message : "Video search failed."); }
    finally { setBusy(false); }
  }

  function addQuestion(event: React.FormEvent) {
    event.preventDefault();
    const seconds = parseTime(time);
    if (!video || seconds === null || seconds >= video.duration) { setError("Enter a valid time before the video ends, like 1:30."); return; }
    if (questions.some((question) => question.time === seconds)) { setError("Choose a different timestamp for each question."); return; }
    if (!prompt.trim() || options.some((option) => !option.trim()) || correctIndex < 0) { setError("Add a question, four answers, and select the correct answer."); return; }
    setQuestions((current) => [...current, { id: crypto.randomUUID(), time: seconds, prompt: prompt.trim(), options: options.map((option) => option.trim()), correctIndex }].sort((a, b) => a.time - b.time));
    setTime(""); setPrompt(""); setOptions(["", "", "", ""]); setCorrectIndex(-1); setError("");
  }

  async function save() {
    if (!title.trim() || !courseId || !video || !questions.length) { setError("Add a title, Classroom, video, and at least one question."); return; }
    setError(""); setBusy(true);
    try {
      await request("quizzes", { method: "POST", body: JSON.stringify({ title, courseId, video, questions }) });
      await onSaved();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not save your Quizbee."); }
    finally { setBusy(false); }
  }

  return <><div className="page-heading"><div><div className="eyebrow">LET&apos;S MAKE SOMETHING <span>✦</span></div><h1>Create a Quizbee.</h1><p>Make a video lesson that gets everyone thinking.</p></div></div>
    {error && <Notice>{error}</Notice>}
    <div className="form-panel"><div className="step-heading"><span>01</span><div><h2>The basics</h2><p>Give your lesson a name and choose its Classroom.</p></div></div>
      <div className="form-grid"><label>Quizbee title<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. The magic of photosynthesis" maxLength={150} /></label>
      <label>Google Classroom<select value={courseId} onChange={(event) => setCourseId(event.target.value)}><option value="">Select a Classroom</option>{courses.map((course) => <option value={course.id} key={course.id}>{course.name}{course.section ? ` · ${course.section}` : ""}</option>)}</select></label></div>
      {courses.length === 0 && <p className="small muted">No active teacher Classrooms found. Join or create a class in Google Classroom first.</p>}
    </div>
    <div className="form-panel"><div className="step-heading"><span>02</span><div><h2>Find a video</h2><p>Search YouTube for the perfect starting point.</p></div></div>
      <form className="search-form" onSubmit={search}><div className="input-icon"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search YouTube videos..." maxLength={200} required /></div><button className="button dark" disabled={busy}>Search</button></form>
      {video && <div className="selected-video"><img src={video.thumbnail} alt="" /><div><span className="card-tag">SELECTED VIDEO</span><strong>{video.title}</strong><p>{video.channel} · {formatTime(video.duration)}</p></div><Check size={19} /></div>}
      {videos.length > 0 && <div className="video-results">{videos.map((item) => <button type="button" className={`video-result ${video?.id === item.id ? "chosen" : ""}`} key={item.id} onClick={() => { if (video?.id !== item.id) setQuestions([]); setVideo(item); setError(""); }}><img src={item.thumbnail} alt="" /><span><strong>{item.title}</strong><small>{item.channel} · {formatTime(item.duration)}</small></span><ChevronRight size={17} /></button>)}</div>}
      {searched && videos.length === 0 && <p className="small muted">No embeddable videos found. Try another search.</p>}
      {video && <p className="small muted">Choosing a different video clears the questions for the previous video.</p>}
    </div>
    {video && <div className="form-panel"><div className="step-heading"><span>03</span><div><h2>Add your questions</h2><p>The video pauses at each timestamp for a quick check-in.</p></div></div>
      <div className="preview-video"><iframe src={`https://www.youtube-nocookie.com/embed/${video.id}`} title={`Preview: ${video.title}`} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen /></div>
      {questions.length > 0 && <div className="question-list">{questions.map((question, index) => <div className="question-summary" key={question.id}><span className="question-number">{index + 1}</span><div><strong>{question.prompt}</strong><small>At {formatTime(question.time)} · Answer: {question.options[question.correctIndex]}</small></div><button className="icon-button" aria-label={`Remove question ${index + 1}`} onClick={() => setQuestions(questions.filter((item) => item.id !== question.id))}><Trash2 size={17} /></button></div>)}</div>}
      <form className="question-form" onSubmit={addQuestion}><div className="question-form-header"><strong>New question</strong><span>✦ MAKE THEM THINK</span></div>
        <div className="form-grid question-grid"><label>Pause at (mm:ss)<input value={time} onChange={(event) => setTime(event.target.value)} placeholder="e.g. 1:30" required /></label><label>Your question<input value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="What would you like to ask?" maxLength={500} required /></label></div>
        <div className="answers-label">Answer options <span>Select the correct answer</span></div><div className="answer-inputs">{options.map((option, index) => <label className="answer-input" key={index}><input type="radio" name="correct-answer" checked={correctIndex === index} onChange={() => setCorrectIndex(index)} aria-label={`Mark answer ${index + 1} correct`} /><span>{String.fromCharCode(65 + index)}</span><input value={option} onChange={(event) => setOptions(options.map((value, i) => i === index ? event.target.value : value))} placeholder={`Answer ${index + 1}`} maxLength={200} required /></label>)}</div>
        <button className="button secondary" type="submit"><Plus size={17} /> Add question</button>
      </form>
    </div>}
    <div className="form-footer"><span>{questions.length} {questions.length === 1 ? "question" : "questions"} added</span><button className="button primary" onClick={save} disabled={busy}>Done <Check size={17} /></button></div>
  </>;
}

function AssignQuiz({ courses, quizzes, onAssigned }: { courses: Course[]; quizzes: Quiz[]; onAssigned: () => Promise<void> }) {
  const { request } = useSession();
  const [courseId, setCourseId] = useState("");
  const [quizId, setQuizId] = useState("");
  const [due, setDue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const available = quizzes.filter((quiz) => quiz.courseId === courseId);

  async function assign(event: React.FormEvent) {
    event.preventDefault();
    if (!courseId || !quizId) { setError("Choose a Classroom and a Quizbee."); return; }
    if (due && (Number.isNaN(new Date(due).getTime()) || new Date(due).getTime() <= Date.now())) { setError("Choose a due date in the future."); return; }
    setBusy(true); setError("");
    try {
      await request("assignments", { method: "POST", body: JSON.stringify({ courseId, quizId, dueAt: due ? new Date(due).toISOString() : null }) });
      await onAssigned();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not assign this Quizbee."); }
    finally { setBusy(false); }
  }

  return <><div className="page-heading"><div><div className="eyebrow">SHARE THE LEARNING <span>✦</span></div><h1>Assign a Quizbee.</h1><p>Send a little curiosity straight to your Classroom.</p></div></div>
    {error && <Notice>{error}</Notice>}
    <form className="form-panel assign-panel" onSubmit={assign}><div className="step-heading"><span>✦</span><div><h2>Ready, set, share.</h2><p>Choose a Classroom, then select one of its Quizbees.</p></div></div>
      <label>1. Choose a Classroom<select value={courseId} onChange={(event) => { setCourseId(event.target.value); setQuizId(""); }} required><option value="">Select a Classroom</option>{courses.map((course) => <option value={course.id} key={course.id}>{course.name}{course.section ? ` · ${course.section}` : ""}</option>)}</select></label>
      <label>2. Choose a Quizbee<select value={quizId} onChange={(event) => setQuizId(event.target.value)} disabled={!courseId} required><option value="">Select a Quizbee</option>{available.map((quiz) => <option value={quiz.id} key={quiz.id}>{quiz.title}</option>)}</select></label>
      {courseId && !available.length && <p className="small muted">No Quizbees for this Classroom yet. Create one first.</p>}
      <label>3. Due date <span className="optional">(optional, your local time)</span><input type="datetime-local" value={due} onChange={(event) => setDue(event.target.value)} /></label>
      <div className="assign-footer"><p>Students will find this assignment in Google Classroom and their Quizbee dashboard.</p><button className="button primary" disabled={busy || !quizId}><Send size={16} /> {busy ? "Assigning..." : "Assign"}</button></div>
    </form>
  </>;
}
