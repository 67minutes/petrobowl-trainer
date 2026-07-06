import { describe, expect, it } from "vitest";
import { buildAssignmentPlan } from "@/lib/import/glossary-import";

describe("buildAssignmentPlan", () => {
  it("emits one row per (topic, owner), including co-owned topics", () => {
    const topicIdByName = new Map([
      ["Well Workover and Intervention", "t-wwi"],
      ["Geology", "t-geo"]
    ]);
    const playerIdByName = new Map([
      ["Maulidan", "p-m"],
      ["Anggitya", "p-a"],
      ["Jak", "p-j"]
    ]);

    const plan = buildAssignmentPlan(topicIdByName, playerIdByName);

    expect(plan).toEqual(
      expect.arrayContaining([
        { topicId: "t-wwi", playerId: "p-m" },
        { topicId: "t-wwi", playerId: "p-a" },
        { topicId: "t-geo", playerId: "p-j" }
      ])
    );
    // Well Workover and Intervention is co-owned -> two rows.
    expect(plan.filter((row) => row.topicId === "t-wwi")).toHaveLength(2);
  });
});
