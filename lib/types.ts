export type Role = "teacher" | "student";

export type Course = {
  id: string;
  name: string;
  section?: string;
};

export type Video = {
  id: string;
  title: string;
  channel: string;
  thumbnail: string;
  duration: number;
};

export type Question = {
  id: string;
  time: number;
  prompt: string;
  options: string[];
  correctIndex: number;
};

export type StudentQuestion = Omit<Question, "correctIndex">;

export type Quiz = {
  id: string;
  ownerUid: string;
  title: string;
  courseId: string;
  courseName: string;
  video: Video;
  questions: Question[];
  createdAt: string;
};

export type Result = {
  studentUid: string;
  studentName: string;
  score: number;
  total: number;
  status: "pending" | "turned_in";
  submittedAt: string;
};

export type Assignment = {
  id: string;
  ownerUid: string;
  title: string;
  courseId: string;
  courseName: string;
  quizId: string;
  video: Video;
  questions: Question[];
  dueAt: string | null;
  createdAt: string;
  status: "pending" | "published" | "error";
  courseWorkId?: string;
  classroomLink?: string;
};

export type TeacherAssignment = Omit<Assignment, "questions"> & { results: Result[] };

export type StudentAssignment = {
  id: string;
  title: string;
  courseId: string;
  courseName: string;
  video: Video;
  dueAt: string | null;
  questions: StudentQuestion[];
};
