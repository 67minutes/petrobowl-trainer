import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  parseDoeGeothermalHtml,
  parseDoeHydrogenHtml,
  parseEiaGlossaryHtml,
  serializeGlossaryCsv
} from "@/lib/import/energy-glossary-html";

const fixture = (name: string) =>
  readFileSync(path.join(__dirname, "__fixtures__", name), "utf8");

describe("parseEiaGlossaryHtml", () => {
  const html =
    '<p><strong><a name="active_solar"></a>Active solar:</strong>&nbsp;&nbsp;Energy from the sun collected by pumps.</p>' +
    '<p><strong><a name="biomass"></a>Biomass:</strong>&nbsp;Organic material such as <a href="#wood">wood</a> and waste.</p>' +
    "<p>Some non-term paragraph without a bold lead-in.</p>";

  it("extracts term/definition pairs from bold-colon paragraphs", () => {
    const rows = parseEiaGlossaryHtml(html, "https://www.eia.gov/tools/glossary/index.php?id=renewable");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      term: "Active solar",
      definition: "Energy from the sun collected by pumps.",
      url: "https://www.eia.gov/tools/glossary/index.php?id=renewable#active_solar"
    });
  });

  it("strips cross-reference links inside definitions", () => {
    const rows = parseEiaGlossaryHtml(html, "https://www.eia.gov/tools/glossary/index.php?id=renewable");
    expect(rows[1].definition).toBe("Organic material such as wood and waste.");
  });

  it("ignores paragraphs that are not term entries", () => {
    const rows = parseEiaGlossaryHtml(html, "https://x");
    expect(rows.map((r) => r.term)).toEqual(["Active solar", "Biomass"]);
  });

  it("parses the real EIA renewable fixture into a sane number of terms", () => {
    const rows = parseEiaGlossaryHtml(
      fixture("eia-renewable.html"),
      "https://www.eia.gov/tools/glossary/index.php?id=renewable"
    );
    expect(rows.length).toBeGreaterThan(60);
    const solar = rows.find((r) => r.term.toLowerCase() === "active solar");
    expect(solar?.definition.toLowerCase()).toContain("sun");
  });
});

describe("parseDoeGeothermalHtml", () => {
  const html =
    '<h4 id="a">A</h4>' +
    "<h5>Ambient</h5><p>Natural condition of the environment at any given time.</p>" +
    "<h5>Aquifer</h5><p>Water-bearing stratum of permeable sand, rock, or gravel.</p>" +
    '<p><a href="#content">Back to Top</a></p>' +
    "<h4 id=\"g\">G</h4>" +
    "<h5>Geothermal Heat Pumps</h5><p>First paragraph.</p><p>Second paragraph.</p>" +
    '<p><a href="#content">Back to Top</a></p>';

  it("extracts h5 term + following paragraph(s)", () => {
    const rows = parseDoeGeothermalHtml(html, "https://www.energy.gov/hgeo/geothermal/geothermal-glossary");
    expect(rows[0]).toEqual({
      term: "Ambient",
      definition: "Natural condition of the environment at any given time.",
      url: "https://www.energy.gov/hgeo/geothermal/geothermal-glossary"
    });
  });

  it("joins multiple definition paragraphs and drops Back to Top links", () => {
    const rows = parseDoeGeothermalHtml(html, "https://x");
    const pumps = rows.find((r) => r.term === "Geothermal Heat Pumps");
    expect(pumps?.definition).toBe("First paragraph. Second paragraph.");
    expect(rows.some((r) => r.definition.includes("Back to Top"))).toBe(false);
  });

  it("parses the real DOE geothermal fixture", () => {
    const rows = parseDoeGeothermalHtml(fixture("doe-geothermal.html"), "https://x");
    expect(rows.length).toBeGreaterThan(40);
    expect(rows.find((r) => r.term === "Brine")?.definition.toLowerCase()).toContain("salt");
  });
});

describe("parseDoeHydrogenHtml", () => {
  const html =
    "<h4>A</h4>" +
    '<p><a class="ck-anchor" id="ac_generator"><strong>AC Generator</strong></a><strong> (or Alternator)</strong></p>' +
    "<p>An electric device that reverses direction.</p>" +
    "<p><strong>Adsorption</strong></p>" +
    '<p>The adhesion of molecules to a <a href="#surface">surface</a>.</p>' +
    '<p><a href="#content">Back to Top</a></p>' +
    "<h4>ACRONYMS</h4>" +
    "<p><strong>AC</strong> - Alternating Current</p>";

  it("pairs all-bold paragraphs with the following definition paragraph", () => {
    const rows = parseDoeHydrogenHtml(html, "https://www.energy.gov/eere/fuelcells/glossary");
    expect(rows[0]).toEqual({
      term: "AC Generator (or Alternator)",
      definition: "An electric device that reverses direction.",
      url: "https://www.energy.gov/eere/fuelcells/glossary#ac_generator"
    });
  });

  it("excludes the acronyms section", () => {
    const rows = parseDoeHydrogenHtml(html, "https://x");
    expect(rows.map((r) => r.term)).toEqual(["AC Generator (or Alternator)", "Adsorption"]);
  });

  it("parses the real DOE hydrogen fixture", () => {
    const rows = parseDoeHydrogenHtml(fixture("doe-hydrogen.html"), "https://x");
    expect(rows.length).toBeGreaterThan(60);
    expect(rows.find((r) => r.term.startsWith("Adsorption"))?.definition.toLowerCase()).toContain(
      "adhesion"
    );
  });
});

describe("serializeGlossaryCsv", () => {
  it("writes the term,definition,disciplines,url header and quotes fields", () => {
    const csv = serializeGlossaryCsv([
      { term: "Active solar", definition: 'Uses the "sun", plus commas, etc.', url: "https://x#a" }
    ]);
    const lines = csv.trimEnd().split("\n");
    expect(lines[0]).toBe("term,definition,disciplines,url");
    expect(lines[1]).toBe('Active solar,"Uses the ""sun"", plus commas, etc.",,https://x#a');
  });
});
