import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { appUrl, authenticate, classroom, courseWork, courses, db, HttpError, searchVideos, submissions } from "@/lib/server";
import { answersSchema, assignmentSchema, classroomDueDate, quizSchema, scoreAnswers } from "@/lib/quiz";
import type { Assignment, Quiz, Result, Role, StudentAssignment, TeacherAssignment } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ path: string[] }> };

async function getAssignment(id: string): Promise<Assignment> {
  const document = await db().collection("assignments").doc(id).get();
  if (!document.exists) throw new HttpError(404, "Quizbee assignment not found.");
  return { ...document.data(), id: document.id } as Assignment;
}

async function studentSubmission(assignment: Assignment, token: string) {
  if (assignment.status !== "published" || !assignment.courseWorkId) {
    throw new HttpError(409, "This Quizbee has not been published in Classroom.");
  }
  const matches = await submissions(token, assignment.courseId, assignment.courseWorkId);
  const submission = matches[0];
  if (!submission) throw new HttpError(403, "This Quizbee is not assigned to your Google Classroom account.");
  return submission;
}

function isComplete(state: string) {
  return state === "TURNED_IN" || state === "RETURNED";
}

async function handleRequest(request: Request, context: Context) {
  try {
    const user = await authenticate(request);
    const { path } = await context.params;
    const url = new URL(request.url);
    const method = request.method;

    if (method === "GET" && path.length === 1 && path[0] === "courses") {
      const role = url.searchParams.get("role");
      if (role !== "teacher" && role !== "student") throw new HttpError(400, "Choose a teacher or student account.");
      return NextResponse.json(await courses(user.googleToken, role as Role));
    }

    if (method === "GET" && path.length === 1 && path[0] === "videos") {
      const query = url.searchParams.get("q")?.trim() || "";
      if (!query || query.length > 200) throw new HttpError(400, "Enter a search of up to 200 characters.");
      if (!(await courses(user.googleToken, "teacher")).length) throw new HttpError(403, "Join an active Classroom as a teacher to search for videos.");
      return NextResponse.json(await searchVideos(query));
    }

    if (method === "GET" && path.length === 1 && path[0] === "quizzes") {
      const snapshot = await db().collection("quizzes").where("ownerUid", "==", user.uid).get();
      const quizzes = snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id }) as Quiz);
      return NextResponse.json(quizzes.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    }

    if (method === "POST" && path.length === 1 && path[0] === "quizzes") {
      const input = quizSchema.parse(await request.json());
      const course = (await courses(user.googleToken, "teacher")).find((item) => item.id === input.courseId);
      if (!course) throw new HttpError(403, "You must be a teacher in the selected Classroom.");
      const ref = db().collection("quizzes").doc();
      const quiz: Quiz = {
        ...input, id: ref.id, ownerUid: user.uid, courseName: course.name,
        video: { ...input.video, thumbnail: `https://i.ytimg.com/vi/${input.video.id}/hqdefault.jpg` },
        questions: [...input.questions].sort((a, b) => a.time - b.time),
        createdAt: new Date().toISOString(),
      };
      await ref.set(quiz);
      return NextResponse.json(quiz, { status: 201 });
    }

    if (method === "POST" && path.length === 1 && path[0] === "assignments") {
      const input = assignmentSchema.parse(await request.json());
      let due = {};
      try {
        due = input.dueAt ? classroomDueDate(input.dueAt) : {};
      } catch {
        throw new HttpError(400, "Choose a due date in the future.");
      }
      const origin = appUrl();
      const course = (await courses(user.googleToken, "teacher")).find((item) => item.id === input.courseId);
      if (!course) throw new HttpError(403, "You must be a teacher in the selected Classroom.");
      const quizDoc = await db().collection("quizzes").doc(input.quizId).get();
      const quiz = quizDoc.data() as Quiz | undefined;
      if (!quiz || quiz.ownerUid !== user.uid || quiz.courseId !== course.id) {
        throw new HttpError(400, "Choose one of your Quizbees for this Classroom.");
      }
      const ref = db().collection("assignments").doc();
      const assignment: Assignment = {
        id: ref.id, ownerUid: user.uid, title: quiz.title, quizId: quiz.id,
        courseId: course.id, courseName: course.name, video: quiz.video, questions: quiz.questions,
        dueAt: input.dueAt, createdAt: new Date().toISOString(), status: "pending",
      };
      await ref.set(assignment);
      let work: { id: string; alternateLink?: string };
      try {
        work = await classroom(`courses/${encodeURIComponent(course.id)}/courseWork`, user.googleToken, {
          method: "POST",
          body: JSON.stringify({
            title: quiz.title, description: "Watch the video and answer the questions in Quizbee.",
            materials: [{ link: { url: `${origin}/play/${ref.id}` } }],
            workType: "ASSIGNMENT", state: "PUBLISHED", maxPoints: quiz.questions.length,
            ...due,
          }),
        });
      } catch (error) {
        await ref.update({ status: "error" });
        if (error instanceof HttpError) throw new HttpError(error.status, `${error.message} Check Classroom before retrying in case the post was created.`);
        throw error;
      }
      if (!work.id) throw new HttpError(502, "Classroom did not return an assignment ID. Check Classroom before retrying.");
      await ref.update({ status: "published", courseWorkId: work.id, classroomLink: work.alternateLink || "" });
      return NextResponse.json({ id: ref.id }, { status: 201 });
    }

    if (method === "POST" && path.length === 3 && path[0] === "assignments" && path[2] === "reconcile") {
      const assignment = await getAssignment(path[1]);
      if (assignment.ownerUid !== user.uid ||
          !(await courses(user.googleToken, "teacher")).some((course) => course.id === assignment.courseId)) {
        throw new HttpError(403, "Only the assigning teacher can check this Classroom post.");
      }
      if (assignment.status === "published") return NextResponse.json({ found: true });
      const link = `${appUrl()}/play/${assignment.id}`;
      const matches = (await courseWork(user.googleToken, assignment.courseId))
        .filter((work) => work.materials?.some((material) => material.link?.url === link));
      if (matches.length > 1) throw new HttpError(409, "Multiple matching posts exist. Check Google Classroom before assigning again.");
      if (!matches.length) return NextResponse.json({ found: false });
      await db().collection("assignments").doc(assignment.id).update({
        status: "published", courseWorkId: matches[0].id, classroomLink: matches[0].alternateLink || "",
      });
      return NextResponse.json({ found: true });
    }

    if (method === "GET" && path.length === 1 && path[0] === "assignments") {
      const role = url.searchParams.get("role");
      if (role === "teacher") {
        const taught = new Set((await courses(user.googleToken, "teacher")).map((course) => course.id));
        const snapshot = await db().collection("assignments").where("ownerUid", "==", user.uid).get();
        const assignments = await Promise.all(snapshot.docs.map(async (doc) => {
          const assignment = { ...doc.data(), id: doc.id } as Assignment;
          if (!taught.has(assignment.courseId)) return null;
          const results = await doc.ref.collection("results").where("status", "==", "turned_in").get();
          const { questions: _questions, ...rest } = assignment;
          return { ...rest, results: results.docs.map((result) => result.data() as Result) } satisfies TeacherAssignment;
        }));
        return NextResponse.json(assignments.filter(Boolean).sort((a, b) => b!.createdAt.localeCompare(a!.createdAt)));
      }
      if (role === "student") {
        const enrolled = await courses(user.googleToken, "student");
        const groups = await Promise.all(enrolled.map(async (course) => {
          const [snapshot, studentWork] = await Promise.all([
            db().collection("assignments").where("courseId", "==", course.id).get(),
            submissions(user.googleToken, course.id, "-"),
          ]);
          const byWork = new Map(studentWork.map((item) => [item.courseWorkId, item]));
          return snapshot.docs.flatMap((doc) => {
            const assignment = { ...doc.data(), id: doc.id } as Assignment;
            const submission = assignment.courseWorkId ? byWork.get(assignment.courseWorkId) : undefined;
            if (assignment.status !== "published" || !submission || isComplete(submission.state)) return [];
            return [{
              id: assignment.id, title: assignment.title, courseName: course.name,
              courseId: course.id, video: assignment.video, dueAt: assignment.dueAt,
            }];
          });
        }));
        return NextResponse.json(groups.flat());
      }
      throw new HttpError(400, "Choose a teacher or student account.");
    }

    if (method === "GET" && path.length === 2 && path[0] === "assignments") {
      const assignment = await getAssignment(path[1]);
      const submission = await studentSubmission(assignment, user.googleToken);
      if (isComplete(submission.state)) {
        const resultRef = db().collection("assignments").doc(assignment.id).collection("results").doc(user.uid);
        const result = (await resultRef.get()).data() as Result | undefined;
        if (!result) throw new HttpError(409, "This assignment was already turned in outside Quizbee, so no Quizbee score was recorded.");
        if (result.status === "pending") await resultRef.update({ status: "turned_in" });
        return NextResponse.json({ completed: true, score: result.score, total: result.total });
      }
      const response: StudentAssignment = {
        id: assignment.id, title: assignment.title, courseId: assignment.courseId,
        courseName: assignment.courseName, video: assignment.video, dueAt: assignment.dueAt,
        questions: assignment.questions.map(({ correctIndex: _correctIndex, ...question }) => question),
      };
      return NextResponse.json(response);
    }

    if (method === "POST" && path.length === 3 && path[0] === "assignments" && path[2] === "turn-in") {
      const answers = answersSchema.parse(await request.json());
      const assignment = await getAssignment(path[1]);
      const submission = await studentSubmission(assignment, user.googleToken);
      const resultRef = db().collection("assignments").doc(assignment.id).collection("results").doc(user.uid);
      const existing = (await resultRef.get()).data() as Result | undefined;
      if (isComplete(submission.state)) {
        if (!existing) throw new HttpError(409, "This assignment was already turned in outside Quizbee, so no Quizbee score was recorded.");
        if (existing.status === "pending") await resultRef.update({ status: "turned_in" });
        return NextResponse.json({ score: existing.score, total: existing.total });
      }
      let grade;
      try {
        grade = scoreAnswers(assignment.questions, answers);
      } catch (error) {
        throw new HttpError(400, error instanceof Error ? error.message : "Invalid answers.");
      }
      const result: Result = {
        studentUid: user.uid, studentName: user.name, ...grade,
        submittedAt: new Date().toISOString(), status: "pending",
      };
      await resultRef.set(result);
      await classroom(
        `courses/${encodeURIComponent(assignment.courseId)}/courseWork/${encodeURIComponent(assignment.courseWorkId!)}/studentSubmissions/${encodeURIComponent(submission.id)}:turnIn`,
        user.googleToken, { method: "POST" },
      );
      await resultRef.update({ status: "turned_in" });
      return NextResponse.json(grade);
    }

    throw new HttpError(404, "Not found.");
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message || "Invalid input." }, { status: 400 });
    }
    if (error instanceof HttpError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Quizbee API error:", error);
    return NextResponse.json({ error: error instanceof SyntaxError ? "Invalid request." : "Something went wrong. Please try again." }, { status: error instanceof SyntaxError ? 400 : 500 });
  }
}

async function handler(request: Request, context: Context) {
  const response = await handleRequest(request, context);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const GET = handler;
export const POST = handler;
