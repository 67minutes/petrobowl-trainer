import { describe, expect, it } from "vitest";
import { pickRequestedSession } from "@/lib/session-server";

describe("pickRequestedSession", () => {
  it("returns the requested session instead of falling back to the newest row", () => {
    const sessions = [
      { id: "latest", created_at: "2026-06-23T12:00:00Z" },
      { id: "requested", created_at: "2026-06-22T12:00:00Z" }
    ];

    expect(pickRequestedSession(sessions, "requested")).toEqual(sessions[1]);
  });

  it("returns null when the requested session is absent", () => {
    expect(pickRequestedSession([{ id: "latest" }], "missing")).toBeNull();
  });
});
