import { z } from "zod";
import type { Question } from "./types";

const videoSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{11}$/),
  title: z.string().trim().min(1).max(200),
  channel: z.string().max(200),
  thumbnail: z.string().url(),
  duration: z.number().finite().positive().max(86400),
});

export const quizSchema = z.object({
  title: z.string().trim().min(1).max(150),
  courseId: z.string().min(1),
  video: videoSchema,
  questions: z.array(z.object({
    id: z.string().uuid(),
    time: z.number().finite().min(0),
    prompt: z.string().trim().min(1).max(500),
    options: z.array(z.string().trim().min(1).max(200)).length(4),
    correctIndex: z.number().int().min(0).max(3),
  })).min(1).max(50),
}).superRefine((quiz, ctx) => {
  const ids = new Set<string>();
  const times = new Set<number>();
  quiz.questions.forEach((question, index) => {
    if (ids.has(question.id)) {
      ctx.addIssue({ code: "custom", path: ["questions", index, "id"], message: "Question IDs must be unique." });
    }
    if (times.has(question.time)) {
      ctx.addIssue({ code: "custom", path: ["questions", index, "time"], message: "Choose a different time for each question." });
    }
    if (question.time >= quiz.video.duration) {
      ctx.addIssue({ code: "custom", path: ["questions", index, "time"], message: "Questions must appear before the video ends." });
    }
    ids.add(question.id);
    times.add(question.time);
  });
});

export const assignmentSchema = z.object({
  quizId: z.string().min(1),
  courseId: z.string().min(1),
  dueAt: z.string().datetime({ offset: true }).nullable(),
});

export const answersSchema = z.record(z.string().uuid(), z.number().int().min(0).max(3));

export function scoreAnswers(questions: Question[], answers: Record<string, number>) {
  if (Object.keys(answers).length !== questions.length ||
      questions.some((question) => !(question.id in answers))) {
    throw new Error("Answer every question before turning in.");
  }
  return {
    score: questions.filter((question) => answers[question.id] === question.correctIndex).length,
    total: questions.length,
  };
}

export function parseDuration(duration: string): number {
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(duration);
  if (!match) return 0;
  return Number(match[1] || 0) * 3600 + Number(match[2] || 0) * 60 + Number(match[3] || 0);
}

export function formatTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remainder = total % 60;
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}` : `${minutes}:${String(remainder).padStart(2, "0")}`;
}

export function parseTime(value: string): number | null {
  const parts = value.trim().split(":");
  if (parts.length < 2 || parts.length > 3 || parts.some((part) => !/^\d+$/.test(part))) return null;
  const values = parts.map(Number);
  if (values.slice(1).some((part) => part >= 60)) return null;
  return values.reduce((total, part) => total * 60 + part, 0);
}

export function classroomDueDate(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) {
    throw new Error("Choose a due date in the future.");
  }
  return {
    dueDate: { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() },
    dueTime: { hours: date.getUTCHours(), minutes: date.getUTCMinutes(), seconds: date.getUTCSeconds() },
  };
}
