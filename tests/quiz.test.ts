import { describe, expect, it } from "vitest";
import { classroomDueDate, formatTime, parseDuration, parseTime, quizSchema, scoreAnswers } from "@/lib/quiz";
import type { Question } from "@/lib/types";

const first: Question = { id: "1a0af0b4-399d-4c33-9619-e9066473cb00", time: 5, prompt: "One?", options: ["a", "b", "c", "d"], correctIndex: 1 };
const second: Question = { id: "2a0af0b4-399d-4c33-9619-e9066473cb00", time: 15, prompt: "Two?", options: ["a", "b", "c", "d"], correctIndex: 3 };
const quiz = { title: "Test", courseId: "course", video: { id: "dQw4w9WgXcQ", title: "Video", channel: "Channel", thumbnail: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg", duration: 30 }, questions: [first, second] };

describe("quiz validation and scoring", () => {
  it("grades on the server and requires exactly one answer per question", () => {
    expect(scoreAnswers([first, second], { [first.id]: 1, [second.id]: 0 })).toEqual({ score: 1, total: 2 });
    expect(() => scoreAnswers([first, second], { [first.id]: 1 })).toThrow("Answer every question");
    expect(() => scoreAnswers([first], { [first.id]: 1, [second.id]: 3 })).toThrow("Answer every question");
  });

  it("rejects duplicated timestamps, IDs, and timestamps at or beyond the end", () => {
    expect(quizSchema.safeParse(quiz).success).toBe(true);
    expect(quizSchema.safeParse({ ...quiz, questions: [first, { ...second, time: first.time }] }).success).toBe(false);
    expect(quizSchema.safeParse({ ...quiz, questions: [first, { ...second, id: first.id }] }).success).toBe(false);
    expect(quizSchema.safeParse({ ...quiz, questions: [{ ...first, time: 30 }] }).success).toBe(false);
  });
});

describe("time handling", () => {
  it("handles timestamp formats and YouTube durations", () => {
    expect(parseTime("1:30")).toBe(90);
    expect(parseTime("1:02:03")).toBe(3723);
    expect(parseTime("1:60")).toBeNull();
    expect(parseTime("-1:30")).toBeNull();
    expect(formatTime(3723)).toBe("1:02:03");
    expect(parseDuration("PT1H2M3S")).toBe(3723);
    expect(parseDuration("P1D")).toBe(0);
  });

  it("converts local choices represented as ISO instants to Classroom UTC dates", () => {
    expect(classroomDueDate("2099-01-02T03:04:00.000Z")).toEqual({
      dueDate: { year: 2099, month: 1, day: 2 },
      dueTime: { hours: 3, minutes: 4, seconds: 0 },
    });
    expect(() => classroomDueDate("2000-01-01T00:00:00.000Z")).toThrow("future");
  });
});
