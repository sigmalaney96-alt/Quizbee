// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StudentAssignment } from "@/lib/types";

const mocks = vi.hoisted(() => ({ request: vi.fn(), connect: vi.fn() }));
vi.mock("@/components/session", () => ({ useSession: () => mocks }));

import { PlayerPage } from "@/components/player";

const question = { id: "1a0af0b4-399d-4c33-9619-e9066473cb00", time: 40, prompt: "What did you learn?", options: ["One", "Two", "Three", "Four"] };
const assignment: StudentAssignment = {
  id: "assignment", title: "Video lesson", courseId: "course", courseName: "Science", dueAt: null,
  video: { id: "dQw4w9WgXcQ", title: "Video", channel: "Channel", thumbnail: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg", duration: 60 },
  questions: [question],
};

type Event = { data: number; target: MockPlayer };
class MockPlayer {
  time = 0;
  state = 2;
  events: { onReady: (event: Event) => void; onStateChange: (event: Event) => void };
  constructor(_element: HTMLElement, options: { events: MockPlayer["events"] }) {
    this.events = options.events;
    player = this;
    queueMicrotask(() => this.events.onReady({ data: 0, target: this }));
  }
  getCurrentTime() { return this.time; }
  getPlayerState() { return this.state; }
  playVideo() { this.state = 1; this.events.onStateChange({ data: 1, target: this }); }
  pauseVideo() { this.state = 2; this.events.onStateChange({ data: 2, target: this }); }
  seekTo(time: number) { this.time = time; }
  destroy() {}
  end() { this.state = 0; this.events.onStateChange({ data: 0, target: this }); }
}
let player: MockPlayer;

beforeEach(() => {
  Object.defineProperty(window, "YT", { configurable: true, value: { Player: MockPlayer } });
  mocks.request.mockImplementation((path: string) => path.endsWith("turn-in")
    ? Promise.resolve({ score: 1, total: 1 })
    : Promise.resolve(assignment));
});
afterEach(cleanup);

describe("student video quiz", () => {
  it("pauses at a question, rewinds 30 seconds, asks again, and turns in after the video ends", async () => {
    render(<PlayerPage id="assignment" />);
    await screen.findByText("Video lesson");
    await waitFor(() => expect(player).toBeDefined());
    await waitFor(() => expect((screen.getByRole("button", { name: "Play" }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    player.time = 40;
    await screen.findByRole("dialog");
    expect(player.state).toBe(2);
    fireEvent.click(screen.getByRole("button", { name: /Rewind 30 sec/ }));
    expect(player.time).toBe(10);
    expect(screen.queryByRole("dialog")).toBeNull();
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 600)); });
    expect(screen.queryByRole("dialog")).toBeNull();
    player.time = 40;
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: /Two/ }));
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect((screen.getByRole("button", { name: /Turn in/ }) as HTMLButtonElement).disabled).toBe(true);
    act(() => player.end());
    fireEvent.click(screen.getByRole("button", { name: /Turn in/ }));
    await screen.findByText("Look at you go!");
    expect(mocks.request).toHaveBeenCalledWith("assignments/assignment/turn-in", {
      method: "POST", body: JSON.stringify({ [question.id]: 1 }),
    });
  });

  it("asks unanswered questions even if the player reaches the end", async () => {
    render(<PlayerPage id="assignment" />);
    await screen.findByText("Video lesson");
    await waitFor(() => expect((screen.getByRole("button", { name: "Play" }) as HTMLButtonElement).disabled).toBe(false));
    act(() => player.end());
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect((screen.getByRole("button", { name: /Turn in/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /One/ }));
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    expect((screen.getByRole("button", { name: /Turn in/ }) as HTMLButtonElement).disabled).toBe(false);
  });
});
