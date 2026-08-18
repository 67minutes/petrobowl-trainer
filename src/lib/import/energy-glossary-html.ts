// Parsers that turn the raw HTML of three public-domain energy glossaries into
// term/definition rows, plus a CSV serializer that emits the same
// `term,definition,disciplines,url` shape the SLB pipeline already consumes.
//
// Each source has its own markup, so each gets its own parser:
//   EIA (renewable):  <p><strong><a name="x"></a>Term:</strong> definition</p>
//   DOE geothermal:   <h5>Term</h5><p>definition</p>  (one or more <p>)
//   DOE hydrogen:     <p><strong>Term</strong></p><p>definition</p>  (+ an acronyms
//                     section, excluded — its abbreviation→expansion rows are a
//                     different shape and make weak cards)

export type ScrapedTerm = { term: string; definition: string; url?: string };

const NAMED_ENTITIES: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  mdash: "—",
  ndash: "–",
  rsquo: "’",
  lsquo: "‘",
  ldquo: "“",
  rdquo: "”",
  hellip: "…",
  deg: "°",
  times: "×"
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, body: string) => {
    if (body[0] === "#") {
      const code =
        body[1] === "x" || body[1] === "X"
          ? Number.parseInt(body.slice(2), 16)
          : Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? match;
  });
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, "");
}

// Full text of an HTML fragment: tags removed, entities decoded, whitespace
// collapsed and trimmed.
function textOf(html: string): string {
  return decodeEntities(stripTags(html)).replace(/\s+/g, " ").trim();
}

// Iterates top-level <p>...</p> blocks, returning each block's inner HTML.
function paragraphs(html: string): string[] {
  const blocks: string[] = [];
  const re = /<p\b[^>]*>([\s\S]*?)<\/p>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    blocks.push(match[1]);
  }
  return blocks;
}

function anchorId(html: string): string | undefined {
  const named = html.match(/<a[^>]*\bname="([^"]+)"/i);
  if (named) {
    return named[1];
  }
  const id = html.match(/<a[^>]*\bid="([^"]+)"/i);
  return id?.[1];
}

function withAnchor(pageUrl: string, id: string | undefined): string {
  return id ? `${pageUrl}#${id}` : pageUrl;
}

const BACK_TO_TOP = /back to top/i;

export function parseEiaGlossaryHtml(html: string, pageUrl: string): ScrapedTerm[] {
  const rows: ScrapedTerm[] = [];
  for (const inner of paragraphs(html)) {
    // A term entry leads with <strong>Term:</strong>; the colon is the marker
    // that distinguishes glossary rows from ordinary bold text.
    const strong = inner.match(/<strong>([\s\S]*?)<\/strong>([\s\S]*)/i);
    if (!strong) {
      continue;
    }
    const label = textOf(strong[1]);
    if (!label.endsWith(":")) {
      continue;
    }
    const term = label.slice(0, -1).trim();
    const definition = textOf(strong[2]);
    if (!term || !definition) {
      continue;
    }
    rows.push({ term, definition, url: withAnchor(pageUrl, anchorId(strong[1])) });
  }
  return rows;
}

export function parseDoeGeothermalHtml(html: string, pageUrl: string): ScrapedTerm[] {
  const rows: ScrapedTerm[] = [];
  // Each <h5> term owns everything up to the next heading (<h4>/<h5>).
  const re = /<h5\b[^>]*>([\s\S]*?)<\/h5>([\s\S]*?)(?=<h[45]\b|$)/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const term = textOf(match[1]);
    const definition = paragraphs(match[2])
      .map(textOf)
      .filter((text) => text && !BACK_TO_TOP.test(text))
      .join(" ")
      .trim();
    if (term && definition) {
      rows.push({ term, definition, url: pageUrl });
    }
  }
  return rows;
}

export function parseDoeHydrogenHtml(html: string, pageUrl: string): ScrapedTerm[] {
  // The acronyms section that ends the page is a different shape; drop it.
  const body = html.split(/<h4\b[^>]*>\s*acronyms\s*<\/h4>/i)[0];

  const rows: ScrapedTerm[] = [];
  let pending: ScrapedTerm | null = null;
  const re = /<p\b[^>]*>([\s\S]*?)<\/p>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(body)) !== null) {
    const inner = match[1];
    const full = textOf(inner);
    if (!full || BACK_TO_TOP.test(full)) {
      continue;
    }
    const bold = [...inner.matchAll(/<strong>([\s\S]*?)<\/strong>/gi)]
      .map((m) => textOf(m[1]))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    // A paragraph whose entire visible text is bold is a term heading; anything
    // else is the definition that belongs to the preceding term.
    if (bold && bold === full) {
      pending = { term: full.replace(/:$/, "").trim(), url: withAnchor(pageUrl, anchorId(inner)), definition: "" };
    } else if (pending) {
      pending.definition = full;
      rows.push(pending);
      pending = null;
    }
  }
  return rows;
}

function csvCell(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function serializeGlossaryCsv(
  rows: { term: string; definition: string; disciplines?: string; url?: string }[]
): string {
  const lines = ["term,definition,disciplines,url"];
  for (const row of rows) {
    lines.push(
      [row.term, row.definition, row.disciplines ?? "", row.url ?? ""].map(csvCell).join(",")
    );
  }
  return `${lines.join("\n")}\n`;
}
