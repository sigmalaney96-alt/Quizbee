import "server-only";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import type { Course, Role, Video } from "./types";
import { parseDuration } from "./quiz";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function adminApp() {
  if (getApps().length) return getApps()[0];
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!json) throw new HttpError(500, "Firebase server credentials are not configured.");
  try {
    return initializeApp({ credential: cert(JSON.parse(json)) });
  } catch {
    throw new HttpError(500, "Firebase server credentials are invalid.");
  }
}

export function db() {
  return getFirestore(adminApp());
}

export type RequestUser = { uid: string; name: string; googleToken: string };

export async function authenticate(request: Request): Promise<RequestUser> {
  const authorization = request.headers.get("authorization");
  const googleToken = request.headers.get("x-google-token");
  if (!authorization?.startsWith("Bearer ") || !googleToken) {
    throw new HttpError(401, "Please connect your Google account again.");
  }
  const auth = getAuth(adminApp());
  let decoded;
  try {
    decoded = await auth.verifyIdToken(authorization.slice(7));
  } catch {
    throw new HttpError(401, "Your sign-in has expired. Please sign in again.");
  }
  const response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${googleToken}` },
    cache: "no-store",
  });
  if (!response.ok) throw new HttpError(401, "Your Google connection expired. Please reconnect.");
  const profile: { sub?: string } = await response.json();
  const identities = decoded.firebase.identities["google.com"];
  if (!Array.isArray(identities) || !profile.sub || !identities.includes(profile.sub)) {
    throw new HttpError(403, "The Google account does not match your sign-in. Please reconnect.");
  }
  return { uid: decoded.uid, name: decoded.name || "Student", googleToken };
}

async function googleFetch<T>(url: string, token: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init?.headers },
    cache: "no-store",
  });
  if (!response.ok) {
    if (response.status === 401) throw new HttpError(401, "Your Google connection expired. Please reconnect.");
    if (response.status === 403) throw new HttpError(403, "Google Classroom denied access. Check your account, permissions, and Classroom API setup.");
    if (response.status === 404) throw new HttpError(404, "This Classroom course or assignment is no longer available.");
    throw new HttpError(502, `Google Classroom could not complete the request (${response.status}). Please try again.`);
  }
  return response.json() as Promise<T>;
}

export function classroom<T>(path: string, token: string, init?: RequestInit) {
  return googleFetch<T>(`https://classroom.googleapis.com/v1/${path}`, token, init);
}

async function classroomPages<T>(path: string, key: string, token: string): Promise<T[]> {
  const items: T[] = [];
  let pageToken = "";
  do {
    const separator = path.includes("?") ? "&" : "?";
    const result = await classroom<{ nextPageToken?: string; [key: string]: unknown }>(
      `${path}${separator}pageSize=100${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`, token,
    );
    const page = result[key];
    if (Array.isArray(page)) items.push(...page as T[]);
    pageToken = result.nextPageToken || "";
  } while (pageToken);
  return items;
}

export async function courses(token: string, role: Role): Promise<Course[]> {
  return classroomPages<Course>(`courses?${role === "teacher" ? "teacherId" : "studentId"}=me&courseStates=ACTIVE`, "courses", token);
}

export type ClassroomSubmission = {
  id: string;
  courseWorkId: string;
  state: string;
};

export async function submissions(token: string, courseId: string, courseWorkId: string) {
  return classroomPages<ClassroomSubmission>(
    `courses/${encodeURIComponent(courseId)}/courseWork/${encodeURIComponent(courseWorkId)}/studentSubmissions?userId=me`,
    "studentSubmissions", token,
  );
}

export type ClassroomWork = {
  id: string;
  alternateLink?: string;
  materials?: Array<{ link?: { url?: string } }>;
};

export async function courseWork(token: string, courseId: string) {
  return classroomPages<ClassroomWork>(
    `courses/${encodeURIComponent(courseId)}/courseWork`, "courseWork", token,
  );
}

export async function searchVideos(query: string): Promise<Video[]> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) throw new HttpError(500, "YouTube search is not configured.");
  const params = new URLSearchParams({
    part: "snippet", type: "video", videoEmbeddable: "true", videoSyndicated: "true",
    maxResults: "12", q: query, key,
  });
  const search = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`, { cache: "no-store" });
  if (!search.ok) throw new HttpError(502, `YouTube search failed (${search.status}). Check the API key, API enablement, and quota.`);
  const data: { items?: Array<{ id: { videoId?: string }; snippet: { title: string; channelTitle: string } }> } = await search.json();
  const items = (data.items || []).filter((item) => item.id.videoId);
  if (!items.length) return [];
  const detailsParams = new URLSearchParams({
    part: "contentDetails,status", id: items.map((item) => item.id.videoId).join(","), key,
  });
  const response = await fetch(`https://www.googleapis.com/youtube/v3/videos?${detailsParams}`, { cache: "no-store" });
  if (!response.ok) throw new HttpError(502, `YouTube video details failed (${response.status}).`);
  const details: { items?: Array<{ id: string; contentDetails: { duration: string }; status: { embeddable: boolean } }> } = await response.json();
  const byId = new Map((details.items || []).map((item) => [item.id, item]));
  return items.flatMap((item) => {
    const id = item.id.videoId!;
    const detail = byId.get(id);
    const duration = detail ? parseDuration(detail.contentDetails.duration) : 0;
    if (!detail?.status.embeddable || duration <= 0 || duration > 86400) return [];
    return [{
      id, title: item.snippet.title, channel: item.snippet.channelTitle,
      thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, duration,
    }];
  });
}

export function appUrl() {
  const configured = process.env.APP_URL;
  if (!configured) throw new HttpError(500, "APP_URL is not configured.");
  try {
    const url = new URL(configured);
    if ((url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) ||
        url.pathname !== "/" || url.search || url.hash || url.username || url.password) throw new Error();
    return url.origin;
  } catch {
    throw new HttpError(500, "APP_URL must be an HTTPS origin (or localhost for development).");
  }
}
