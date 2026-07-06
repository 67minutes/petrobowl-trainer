import { describe, expect, it } from "vitest";
import { GLOSSARY_TOPICS, TOPIC_OWNERS } from "@/lib/constants";

describe("glossary topic constants", () => {
  it("defines all 21 glossary topics", () => {
    expect(GLOSSARY_TOPICS).toHaveLength(21);
    expect(GLOSSARY_TOPICS.map((t) => t.slug)).toContain("well_workover_and_intervention");
  });

  it("co-owns Well Workover and Intervention between Maulidan and Anggitya", () => {
    expect(TOPIC_OWNERS["Well Workover and Intervention"]).toEqual(
      expect.arrayContaining(["Maulidan", "Anggitya"])
    );
    expect(TOPIC_OWNERS["Well Workover and Intervention"]).toHaveLength(2);
  });

  it("assigns every glossary topic to at least one owner", () => {
    for (const topic of GLOSSARY_TOPICS) {
      expect(TOPIC_OWNERS[topic.name]?.length ?? 0).toBeGreaterThan(0);
    }
  });
});
