// @vitest-environment jsdom
import { deleteApp, getApps } from "firebase/app";
import { afterEach, describe, expect, it, vi } from "vitest";
import { clientAuth } from "@/lib/firebase-client";

afterEach(async () => {
  await Promise.all(getApps().map((app) => deleteApp(app)));
  vi.unstubAllEnvs();
});

describe("Firebase client", () => {
  it("initializes and reuses an auth component registered on the app", () => {
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_API_KEY", "example-key");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN", "example.firebaseapp.com");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID", "example");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_APP_ID", "example-app");

    const auth = clientAuth();
    expect(auth.app).toBe(getApps()[0]);
    expect(clientAuth()).toBe(auth);
  });
});
