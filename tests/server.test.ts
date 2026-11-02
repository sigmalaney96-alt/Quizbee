import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ verifyIdToken: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("firebase-admin/app", () => ({ getApps: () => [{}], initializeApp: vi.fn(), cert: vi.fn() }));
vi.mock("firebase-admin/auth", () => ({ getAuth: () => ({ verifyIdToken: mocks.verifyIdToken }) }));
vi.mock("firebase-admin/firestore", () => ({ getFirestore: vi.fn() }));

import { appUrl, authenticate, courses } from "@/lib/server";

const request = () => new Request("https://quizbee.example/api/courses", {
  headers: { authorization: "Bearer firebase-id", "x-google-token": "google-access" },
});

beforeEach(() => {
  mocks.verifyIdToken.mockResolvedValue({
    uid: "firebase-user", name: "Student", firebase: { identities: { "google.com": ["google-user"] } },
  });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ sub: "google-user" }), { status: 200 })));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("server authentication", () => {
  it("verifies the Firebase token and binds it to the Google account", async () => {
    await expect(authenticate(request())).resolves.toEqual({ uid: "firebase-user", name: "Student", googleToken: "google-access" });
    expect(mocks.verifyIdToken).toHaveBeenCalledWith("firebase-id");
    expect(fetch).toHaveBeenCalledWith("https://openidconnect.googleapis.com/v1/userinfo", expect.objectContaining({
      headers: { Authorization: "Bearer google-access" }, cache: "no-store",
    }));
  });

  it("rejects mismatched Google identities and expired credentials", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ sub: "different-user" }), { status: 200 }));
    await expect(authenticate(request())).rejects.toMatchObject({ status: 403 });
    vi.mocked(fetch).mockResolvedValueOnce(new Response("", { status: 401 }));
    await expect(authenticate(request())).rejects.toMatchObject({ status: 401 });
    mocks.verifyIdToken.mockRejectedValueOnce(new Error("expired"));
    await expect(authenticate(request())).rejects.toMatchObject({ status: 401 });
  });

  it("rejects requests missing either credential", async () => {
    await expect(authenticate(new Request("https://quizbee.example"))).rejects.toMatchObject({ status: 401 });
  });
});

describe("Google configuration", () => {
  it("reads every page of active Classroom courses", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ courses: [{ id: "one", name: "One" }], nextPageToken: "next" })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ courses: [{ id: "two", name: "Two" }] })));
    const result = await courses("token", "student");
    expect(result.map((course) => course.id)).toEqual(["one", "two"]);
    expect(String(vi.mocked(fetch).mock.calls[1][0])).toContain("pageToken=next");
  });

  it("requires a stable HTTPS origin except for local development", () => {
    vi.stubEnv("APP_URL", "https://quizbee.example/path");
    expect(() => appUrl()).toThrow("HTTPS origin");
    vi.stubEnv("APP_URL", "http://localhost:3000");
    expect(appUrl()).toBe("http://localhost:3000");
    vi.stubEnv("APP_URL", "https://quizbee.example");
    expect(appUrl()).toBe("https://quizbee.example");
  });
});
