import { describe, expect, it } from "vitest";
import { planEnergyTopics, type EnergyTopicConfig } from "@/lib/import/energy-glossaries";

const configured: EnergyTopicConfig[] = [
  { slug: "renewables", name: "Renewables", source: "EIA Glossary" },
  { slug: "geothermal", name: "Geothermal", source: "DOE Geothermal Glossary" },
  { slug: "hydrogen", name: "Hydrogen", source: "DOE Hydrogen Glossary" }
];

describe("planEnergyTopics", () => {
  it("inserts all topics when none exist, numbering after the max display_order", () => {
    const { toInsert, skipped } = planEnergyTopics(configured, [{ name: "Drilling", display_order: 21 }]);
    expect(skipped).toEqual([]);
    expect(toInsert.map((t) => [t.name, t.displayOrder])).toEqual([
      ["Renewables", 22],
      ["Geothermal", 23],
      ["Hydrogen", 24]
    ]);
  });

  it("skips topics already present so a re-run is idempotent", () => {
    const { toInsert, skipped } = planEnergyTopics(configured, [
      { name: "Renewables", display_order: 22 },
      { name: "Drilling", display_order: 21 }
    ]);
    expect(skipped).toEqual(["Renewables"]);
    expect(toInsert.map((t) => t.name)).toEqual(["Geothermal", "Hydrogen"]);
    expect(toInsert[0].displayOrder).toBe(23);
  });

  it("inserts nothing when every topic is already seeded", () => {
    const existing = configured.map((t, i) => ({ name: t.name, display_order: 22 + i }));
    const { toInsert, skipped } = planEnergyTopics(configured, existing);
    expect(toInsert).toEqual([]);
    expect(skipped).toEqual(["Renewables", "Geothermal", "Hydrogen"]);
  });
});
