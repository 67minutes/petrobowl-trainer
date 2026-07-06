import { describe, expect, it } from "vitest";
import { normalizeTermKey, parseGlossaryCsv } from "@/lib/import/glossary-csv";

describe("normalizeTermKey", () => {
  it("lowercases, trims, and collapses whitespace", () => {
    expect(normalizeTermKey("  Abnormal   Pressure ")).toBe("abnormal pressure");
    expect(normalizeTermKey("6FF40")).toBe("6ff40");
  });
});

describe("parseGlossaryCsv", () => {
  const csv =
    'term,definition,disciplines,url\n' +
    'abnormal pressure,"1. (n.) [Geology] A, with comma | 2. (n.) [Drilling] More ""quoted"" text.",Drilling; Geology,https://glossary.slb.com/en/terms/a/abnormal_pressure\n' +
    'adjustable choke,"A valve.",Drilling,https://glossary.slb.com/en/terms/a/adjustable_choke\n';

  it("parses rows into definition->term questions with metadata and term_key", () => {
    const topic = parseGlossaryCsv("drilling", "Drilling", csv);
    expect(topic).toMatchObject({ slug: "drilling", name: "Drilling" });
    expect(topic.questions).toHaveLength(2);
    expect(topic.questions[0]).toEqual({
      question:
        '1. (n.) [Geology] A, with comma | 2. (n.) [Drilling] More "quoted" text.',
      answer: "abnormal pressure",
      termKey: "abnormal pressure",
      displayOrder: 1,
      metadata: {
        disciplines: "Drilling; Geology",
        url: "https://glossary.slb.com/en/terms/a/abnormal_pressure"
      }
    });
  });

  it("skips rows with a blank term or definition", () => {
    const topic = parseGlossaryCsv("x", "X", 'term,definition,disciplines,url\n,"only def",,\nreal,"def",,\n');
    expect(topic.questions.map((q) => q.answer)).toEqual(["real"]);
  });
});
