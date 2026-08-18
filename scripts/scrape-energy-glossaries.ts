import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  parseDoeGeothermalHtml,
  parseDoeHydrogenHtml,
  parseEiaGlossaryHtml,
  serializeGlossaryCsv,
  type ScrapedTerm
} from "@/lib/import/energy-glossary-html";

// Fetches the three public-domain energy glossaries and writes each to a CSV in
// the same `term,definition,disciplines,url` shape as data/slb_glossary/*, so the
// existing parse/redact/collapse pipeline can consume them unchanged.
//
//   EIA renewable filter  → US EIA, public domain (US Government work)
//   DOE geothermal         → US DOE Office of Geothermal, public domain
//   DOE hydrogen           → US DOE Hydrogen & Fuel Cell Technologies, public domain

const REQUEST_TIMEOUT_MS = 20_000;
const OUT_DIR = path.join(process.cwd(), "data", "energy_glossaries");

type Source = {
  slug: string;
  url: string;
  parse: (html: string, url: string) => ScrapedTerm[];
};

const SOURCES: Source[] = [
  {
    slug: "renewables",
    url: "https://www.eia.gov/tools/glossary/index.php?id=renewable",
    parse: parseEiaGlossaryHtml
  },
  {
    slug: "geothermal",
    url: "https://www.energy.gov/hgeo/geothermal/geothermal-glossary",
    parse: parseDoeGeothermalHtml
  },
  {
    slug: "hydrogen",
    url: "https://www.energy.gov/eere/fuelcells/glossary",
    parse: parseDoeHydrogenHtml
  }
];

async function fetchHtml(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { "user-agent": "Mozilla/5.0 (petrobowl-trainer energy glossary scraper)" },
      signal: controller.signal
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} for ${url}`);
    }
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  for (const source of SOURCES) {
    const html = await fetchHtml(source.url);
    const rows = source.parse(html, source.url);
    if (rows.length === 0) {
      throw new Error(`No terms parsed for ${source.slug} — the page markup may have changed.`);
    }
    const outPath = path.join(OUT_DIR, `${source.slug}.csv`);
    await writeFile(outPath, serializeGlossaryCsv(rows), "utf8");
    console.log(`${source.slug}: ${rows.length} terms -> ${path.relative(process.cwd(), outPath)}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
