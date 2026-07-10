import { describe, expect, it } from "vitest";
import { parseGlossaryCsv } from "@/lib/import/glossary-csv";
import { collapseSynonyms, detectSynonymGroups } from "@/lib/import/synonyms";

// Definitions modeled on the real SLB glossary: synonym entries reuse the same
// paragraph verbatim except for the term itself, and cross-reference each other
// with "synonymous with ...". Unrelated terms have distinct definitions.
const csv = [
  "term,definition,disciplines,url",
  'drilling fluid,"A liquid or gaseous mixture used in operations to drill boreholes into the earth, synonymous with drilling mud in general usage. It is essential for wellbore stability and cuttings transport.",Drilling Fluids,https://glossary.slb.com/en/terms/d/drilling_fluid',
  'drilling mud,"A liquid or gaseous mixture used in operations to drill boreholes into the earth, synonymous with drilling fluid in general usage. It is essential for wellbore stability and cuttings transport.",Drilling Fluids,https://glossary.slb.com/en/terms/d/drilling_mud',
  'mud weight,"The mass per unit volume of a drilling fluid, synonymous with mud density and reported in pounds per gallon for hydrostatic control.",Drilling Fluids,https://glossary.slb.com/en/terms/m/mud_weight',
  'mud density,"The mass per unit volume of a drilling fluid, synonymous with mud weight and reported in pounds per gallon for hydrostatic control.",Drilling Fluids,https://glossary.slb.com/en/terms/m/mud_density',
  'adjustable choke,"A valve with a variable opening used to regulate the flow rate of produced reservoir fluids at surface.",Drilling Fluids,https://glossary.slb.com/en/terms/a/adjustable_choke',
  'porosity,"The percentage of pore volume or void space within a rock that can contain fluids such as oil water or gas.",Geology,https://glossary.slb.com/en/terms/p/porosity',
  'permeability,"The ability of a porous rock to transmit fluids measured in darcies and central to reservoir flow behavior.",Geology,https://glossary.slb.com/en/terms/p/permeability'
].join("\n");

const topic = parseGlossaryCsv("drilling_fluids", "Drilling Fluids", csv);

describe("detectSynonymGroups", () => {
  it("clusters synonymous terms and leaves unrelated terms alone", () => {
    const groups = detectSynonymGroups(topic.questions).map((group) =>
      group.map((q) => q.answer).sort()
    );

    expect(groups).toContainEqual(["drilling fluid", "drilling mud"]);
    expect(groups).toContainEqual(["mud density", "mud weight"]);
    expect(groups).toContainEqual(["adjustable choke"]);
    expect(groups).toContainEqual(["porosity"]);
    expect(groups).toContainEqual(["permeability"]);
  });

  it("does not merge distinct terms that merely share a synonym word nearby", () => {
    // 'mud weight' mentions 'drilling fluid' and the word 'synonymous', but its
    // definition is nowhere near similar enough to merge with 'drilling fluid'.
    const groups = detectSynonymGroups(topic.questions);
    const mudGroup = groups.find((group) => group.some((q) => q.answer === "mud weight"));
    expect(mudGroup?.map((q) => q.answer).sort()).toEqual(["mud density", "mud weight"]);
  });
});

describe("collapseSynonyms", () => {
  const collapsed = collapseSynonyms(topic);
  const byAcceptedAnswers = (needle: string) =>
    collapsed.questions.find((q) => q.acceptedAnswers.includes(needle));

  it("emits one question per concept, ordered by display order", () => {
    expect(collapsed.questions).toHaveLength(5);
    expect(collapsed.questions.map((q) => q.displayOrder)).toEqual([1, 3, 5, 6, 7]);
  });

  it("lists every synonym as an accepted answer", () => {
    expect(byAcceptedAnswers("drilling mud")?.acceptedAnswers).toEqual([
      "drilling fluid",
      "drilling mud"
    ]);
    expect(byAcceptedAnswers("mud weight")?.acceptedAnswers).toEqual([
      "mud density",
      "mud weight"
    ]);
  });

  it("keeps a single accepted answer for unmerged terms", () => {
    expect(byAcceptedAnswers("porosity")?.acceptedAnswers).toEqual(["porosity"]);
  });

  it("redacts every member term from the merged definition", () => {
    const merged = byAcceptedAnswers("drilling mud");
    expect(merged?.question).toContain("[TERM]");
    expect(merged?.question.toLowerCase()).not.toContain("drilling mud");
    expect(merged?.question.toLowerCase()).not.toContain("drilling fluid");
  });

  it("unions disciplines and keeps a canonical term_key", () => {
    const merged = byAcceptedAnswers("mud weight");
    expect(merged?.termKey).toBe("mud weight");
    expect(merged?.metadata.disciplines).toBe("Drilling Fluids");
  });
});
