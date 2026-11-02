import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Assignment, Quiz } from "@/lib/types";

vi.mock("@/lib/server", () => {
  class HttpError extends Error {
    constructor(public status: number, message: string) { super(message); }
  }
  return {
    HttpError, authenticate: vi.fn(), classroom: vi.fn(), courseWork: vi.fn(),
    courses: vi.fn(), db: vi.fn(), searchVideos: vi.fn(), submissions: vi.fn(),
    appUrl: vi.fn(() => "https://quizbee.example"),
  };
});

import * as server from "@/lib/server";
import { GET, POST } from "@/app/api/[...path]/route";

const store = new Map<string, Record<string, unknown>>();
let nextId = 0;
class Document {
  constructor(public path: string) {}
  get id() { return this.path.split("/").at(-1)!; }
  async get() {
    const data = store.get(this.path);
    return { exists: !!data, id: this.id, ref: this, data: () => data && structuredClone(data) };
  }
  async set(data: object) { store.set(this.path, structuredClone(data) as Record<string, unknown>); }
  async update(data: object) {
    const existing = store.get(this.path);
    if (!existing) throw new Error("Missing document");
    store.set(this.path, { ...existing, ...structuredClone(data) });
  }
  collection(name: string) { return new Collection(`${this.path}/${name}`); }
}
class Collection {
  constructor(public path: string) {}
  doc(id = `generated${++nextId}`) { return new Document(`${this.path}/${id}`); }
  where(field: string, _operator: string, value: unknown) {
    return { get: async () => {
      const docs = [...store].filter(([path, data]) =>
        path.startsWith(`${this.path}/`) && path.split("/").length === this.path.split("/").length + 1 && data[field] === value)
        .map(([path]) => new Document(path));
      return { docs: await Promise.all(docs.map((doc) => doc.get())) };
    } };
  }
}

const q1 = { id: "1a0af0b4-399d-4c33-9619-e9066473cb00", time: 20, prompt: "Question one?", options: ["a", "b", "c", "d"], correctIndex: 2 };
const q2 = { id: "2a0af0b4-399d-4c33-9619-e9066473cb00", time: 40, prompt: "Question two?", options: ["a", "b", "c", "d"], correctIndex: 1 };
const video = { id: "dQw4w9WgXcQ", title: "Video", channel: "Channel", thumbnail: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg", duration: 60 };
const quiz: Quiz = { id: "quiz1", ownerUid: "teacher", title: "My Quizbee", courseId: "course1", courseName: "Science", video, questions: [q1, q2], createdAt: "2026-01-01T00:00:00.000Z" };
const assignment: Assignment = { id: "assignment1", ownerUid: "teacher", title: quiz.title, quizId: quiz.id, courseId: "course1", courseName: "Science", video, questions: [q1, q2], dueAt: null, createdAt: quiz.createdAt, status: "published", courseWorkId: "work1" };

async function call(method: "GET" | "POST", path: string, body?: unknown) {
  const request = new Request(`https://quizbee.example/api/${path}`, {
    method, headers: { "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const parts = path.split("?")[0].split("/");
  return (method === "GET" ? GET : POST)(request, { params: Promise.resolve({ path: parts }) });
}

beforeEach(() => {
  store.clear(); nextId = 0;
  vi.mocked(server.db).mockReturnValue({ collection: (name: string) => new Collection(name) } as never);
  vi.mocked(server.authenticate).mockResolvedValue({ uid: "teacher", name: "Teacher", googleToken: "token" });
  vi.mocked(server.courses).mockResolvedValue([{ id: "course1", name: "Science" }]);
  vi.mocked(server.submissions).mockResolvedValue([{ id: "submission1", courseWorkId: "work1", state: "CREATED" }]);
  vi.mocked(server.classroom).mockResolvedValue({ id: "work1", alternateLink: "https://classroom.google.com/" });
  vi.mocked(server.courseWork).mockResolvedValue([]);
  store.set("quizzes/quiz1", structuredClone(quiz));
  store.set("assignments/assignment1", structuredClone(assignment));
});

describe("Classroom assignment API", () => {
  it("limits YouTube search to users with an active teacher Classroom", async () => {
    vi.mocked(server.courses).mockResolvedValueOnce([]);
    expect((await call("GET", "videos?q=plants")).status).toBe(403);
    expect(server.searchVideos).not.toHaveBeenCalled();
  });

  it("only lets teachers create quizzes for their own Classroom and sorts their questions", async () => {
    const response = await call("POST", "quizzes", { title: "Lesson", courseId: "course1", video, questions: [q2, q1] });
    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data.questions.map((question: typeof q1) => question.time)).toEqual([20, 40]);
    expect(data.ownerUid).toBe("teacher");
    expect((await call("POST", "quizzes", { title: "Lesson", courseId: "other", video, questions: [q1] })).status).toBe(403);
  });

  it("posts a linked assignment and persists the Classroom ID and due date", async () => {
    const response = await call("POST", "assignments", { quizId: "quiz1", courseId: "course1", dueAt: "2099-01-02T03:04:00.000Z" });
    expect(response.status).toBe(201);
    const saved = store.get("assignments/generated1");
    expect(saved).toMatchObject({ status: "published", courseWorkId: "work1", dueAt: "2099-01-02T03:04:00.000Z" });
    const args = vi.mocked(server.classroom).mock.calls[0];
    const body = JSON.parse(args[2]!.body as string);
    expect(body.materials[0].link.url).toBe("https://quizbee.example/play/generated1");
    expect(body.state).toBe("PUBLISHED");
    expect(body.dueDate).toEqual({ year: 2099, month: 1, day: 2 });
  });

  it("requires a matching owned quiz and rejects past due dates", async () => {
    expect((await call("POST", "assignments", { quizId: "quiz1", courseId: "other", dueAt: null })).status).toBe(403);
    expect((await call("POST", "assignments", { quizId: "quiz1", courseId: "course1", dueAt: "2000-01-01T00:00:00.000Z" })).status).toBe(400);
    vi.mocked(server.authenticate).mockResolvedValue({ uid: "another-teacher", name: "Teacher", googleToken: "token" });
    expect((await call("POST", "assignments", { quizId: "quiz1", courseId: "course1", dueAt: null })).status).toBe(400);
  });

  it("can reconcile an unconfirmed post by its unique Classroom link", async () => {
    store.set("assignments/assignment1", { ...assignment, status: "pending" });
    vi.mocked(server.courseWork).mockResolvedValue([{ id: "recovered", materials: [{ link: { url: "https://quizbee.example/play/assignment1" } }] }]);
    const response = await call("POST", "assignments/assignment1/reconcile");
    expect(await response.json()).toEqual({ found: true });
    expect(store.get("assignments/assignment1")).toMatchObject({ status: "published", courseWorkId: "recovered" });
  });
});

describe("student access and turn-in", () => {
  beforeEach(() => {
    vi.mocked(server.authenticate).mockResolvedValue({ uid: "student", name: "Student", googleToken: "token" });
  });

  it("only returns questions to assigned students and never includes answer keys", async () => {
    const response = await call("GET", "assignments/assignment1");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const data = await response.json();
    expect(data.questions).toHaveLength(2);
    expect(JSON.stringify(data)).not.toContain("correctIndex");
    vi.mocked(server.submissions).mockResolvedValue([]);
    expect((await call("GET", "assignments/assignment1")).status).toBe(403);
  });

  it("lists only unturned Quizbees assigned to the student", async () => {
    store.set("assignments/other", { ...assignment, id: "other", courseWorkId: "work2" });
    vi.mocked(server.submissions).mockResolvedValue([
      { id: "s1", courseWorkId: "work1", state: "CREATED" },
      { id: "s2", courseWorkId: "work2", state: "TURNED_IN" },
    ]);
    const response = await call("GET", "assignments?role=student");
    expect((await response.json()).map((item: { id: string }) => item.id)).toEqual(["assignment1"]);
  });

  it("scores on the server, saves a pending result, and turns in as the student", async () => {
    vi.mocked(server.classroom).mockImplementation(async (path, _token, init) => {
      expect(path).toContain("studentSubmissions/submission1:turnIn");
      expect(init?.body).toBeUndefined();
      expect(store.get("assignments/assignment1/results/student")).toMatchObject({ score: 1, total: 2, status: "pending" });
      return {};
    });
    const response = await call("POST", "assignments/assignment1/turn-in", { [q1.id]: 2, [q2.id]: 0 });
    expect(await response.json()).toEqual({ score: 1, total: 2 });
    expect(store.get("assignments/assignment1/results/student")).toMatchObject({ status: "turned_in", studentName: "Student" });
  });

  it("does not turn in incomplete answers", async () => {
    const response = await call("POST", "assignments/assignment1/turn-in", { [q1.id]: 2 });
    expect(response.status).toBe(400);
    expect(server.classroom).not.toHaveBeenCalled();
  });

  it("repairs a recorded pending score if Classroom succeeded but the response was lost", async () => {
    vi.mocked(server.classroom).mockRejectedValue(new server.HttpError(502, "Connection lost."));
    expect((await call("POST", "assignments/assignment1/turn-in", { [q1.id]: 2, [q2.id]: 1 })).status).toBe(502);
    expect(store.get("assignments/assignment1/results/student")).toMatchObject({ status: "pending", score: 2 });
    vi.mocked(server.submissions).mockResolvedValue([{ id: "submission1", courseWorkId: "work1", state: "TURNED_IN" }]);
    const reopened = await call("GET", "assignments/assignment1");
    expect(await reopened.json()).toEqual({ completed: true, score: 2, total: 2 });
    expect(store.get("assignments/assignment1/results/student")).toMatchObject({ status: "turned_in" });
  });
});
