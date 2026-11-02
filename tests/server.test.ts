import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ verifyIdToken: vi.fn(), getApps: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("firebase-admin/app", () => ({ getApps: mocks.getApps, initializeApp: vi.fn(), cert: vi.fn() }));
vi.mock("firebase-admin/auth", () => ({ getAuth: () => ({ verifyIdToken: mocks.verifyIdToken }) }));
vi.mock("firebase-admin/firestore", () => ({ getFirestore: vi.fn() }));

import { appUrl, authenticate, courses } from "@/lib/server";

const request = () => new Request("https://quizbee.example/api/courses", {
  headers: { authorization: "Bearer firebase-id", "x-google-token": "google-access" },
});

beforeEach(() => {
  mocks.getApps.mockReturnValue([{}]);
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

  it("reports missing Firebase server credentials rather than an expired sign-in", async () => {
    mocks.getApps.mockReturnValue([]);
    vi.stubEnv("FIREBASE_SERVICE_ACCOUNT_JSON", "");
    await expect(authenticate(request())).rejects.toMatchObject({
      status: 500, message: "Firebase server credentials are not configured.",
    });
  });

  it("accepts the service account as separate email and key variables", async () => {
    mocks.getApps.mockReturnValue([]);
    vi.stubEnv("FIREBASE_SERVICE_ACCOUNT_JSON", "{invalid json");
    vi.stubEnv("FIREBASE_CLIENT_EMAIL", "robot@example.iam.gserviceaccount.com");
    vi.stubEnv("FIREBASE_PRIVATE_KEY", "-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----\\n");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID", "quizbee-5b558");
    const { initializeApp, cert } = await import("firebase-admin/app");
    vi.mocked(cert).mockReturnValue("credential" as never);
    await expect(authenticate(request())).resolves.toMatchObject({ uid: "firebase-user" });
    expect(cert).toHaveBeenCalledWith({
      project_id: "quizbee-5b558",
      client_email: "robot@example.iam.gserviceaccount.com",
      private_key: "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n",
    });
    expect(initializeApp).toHaveBeenCalledWith({ credential: "credential" });
  });

  it("accepts base64-encoded service-account JSON", async () => {
    mocks.getApps.mockReturnValue([]);
    vi.stubEnv("FIREBASE_SERVICE_ACCOUNT_JSON", Buffer.from(JSON.stringify({
      project_id: "quizbee-5b558",
      client_email: "robot@example.iam.gserviceaccount.com",
      private_key: "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n",
    })).toString("base64"));
    const { cert } = await import("firebase-admin/app");
    vi.mocked(cert).mockReturnValue("credential" as never);
    await expect(authenticate(request())).resolves.toMatchObject({ uid: "firebase-user" });
    expect(cert).toHaveBeenCalledWith(expect.objectContaining({ project_id: "quizbee-5b558" }));
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

  it("surfaces Google's exact reason when Classroom denies access", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({
      error: { message: "Request had insufficient authentication scopes.", errors: [{ reason: "insufficientPermissions" }] },
    }), { status: 403 }));
    await expect(courses("token", "student")).rejects.toMatchObject({
      status: 403,
      message: expect.stringContaining("insufficientPermissions: Request had insufficient authentication scopes."),
    });
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
