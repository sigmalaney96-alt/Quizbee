import { describe, expect, it } from "vitest";
import { parseApiResponse } from "@/lib/api-response";

describe("API response handling", () => {
  it("returns successful JSON", async () => {
    await expect(parseApiResponse(new Response(JSON.stringify([{ id: "course" }])))).resolves.toEqual([{ id: "course" }]);
  });

  it("preserves actionable API error messages", async () => {
    const response = new Response(JSON.stringify({ error: "Firebase server credentials are not configured." }), { status: 500 });
    await expect(parseApiResponse(response)).rejects.toThrow("Firebase server credentials are not configured.");
  });

  it("explains non-JSON server errors without exposing response content", async () => {
    const response = new Response("Internal Server Error: private server details", { status: 500 });
    await expect(parseApiResponse(response)).rejects.toThrow("Quizbee server returned an unexpected response (HTTP 500). Check the Vercel logs.");
  });

  it("reports malformed JSON and JSON errors without a message", async () => {
    await expect(parseApiResponse(new Response("{", { status: 200 }))).rejects.toThrow("unexpected response (HTTP 200)");
    await expect(parseApiResponse(new Response("{}", { status: 403 }))).rejects.toThrow("Quizbee server request failed (HTTP 403).");
  });
});
