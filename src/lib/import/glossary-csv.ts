export type ParsedGlossaryQuestion = {
  question: string;
  answer: string;
  termKey: string;
  displayOrder: number;
  metadata: { disciplines?: string; url?: string };
};

export type ParsedGlossaryTopic = {
  slug: string;
  name: string;
  questions: ParsedGlossaryQuestion[];
};

export function normalizeTermKey(term: string): string {
  return term.replace(/\s+/g, " ").trim().toLowerCase();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Builds a case-insensitive matcher for a term, allowing whitespace to vary
// and the final word to appear in a regular plural form (s/es, or y -> ies).
function buildTermRegex(term: string): RegExp | null {
  const words = term.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return null;
  }
  const lastWord = words[words.length - 1];
  const escapedLast = escapeRegExp(lastWord);
  const lastVariants: string[] = [];
  if (/[^aeiou]y$/i.test(lastWord)) {
    lastVariants.push(`${escapeRegExp(lastWord.slice(0, -1))}ies`);
  }
  lastVariants.push(`${escapedLast}(?:e?s)?`);
  const body = [...words.slice(0, -1).map(escapeRegExp), `(?:${lastVariants.join("|")})`].join("\\s+");
  return new RegExp(`\\b${body}\\b`, "gi");
}

// Replaces every mention of the term (and its plural forms) inside its own
// definition with the placeholder [TERM], so the definition-as-question does
// not give away the answer.
export function redactTerm(definition: string, term: string): string {
  const regex = buildTermRegex(term);
  if (!regex) {
    return definition;
  }
  return definition.replace(regex, "[TERM]");
}

// Minimal RFC4180 CSV parser: handles quoted fields, escaped quotes (""),
// commas and newlines inside quotes. Returns rows of string cells.
function parseCsvRows(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  const text = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  while (i < text.length) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += char;
      i += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (char === ",") {
      row.push(field);
      field = "";
      i += 1;
      continue;
    }
    if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i += 1;
      continue;
    }
    field += char;
    i += 1;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

export function parseGlossaryCsv(slug: string, name: string, content: string): ParsedGlossaryTopic {
  const rows = parseCsvRows(content);
  const questions: ParsedGlossaryQuestion[] = [];

  // Row 0 is the header (term,definition,disciplines,url).
  for (let index = 1; index < rows.length; index += 1) {
    const [term = "", definition = "", disciplines = "", url = ""] = rows[index];
    const answer = term.trim();
    const rawQuestion = definition.trim();
    if (!answer || !rawQuestion) {
      continue;
    }
    const question = redactTerm(rawQuestion, answer);
    const metadata: ParsedGlossaryQuestion["metadata"] = {};
    if (disciplines.trim()) {
      metadata.disciplines = disciplines.trim();
    }
    if (url.trim()) {
      metadata.url = url.trim();
    }
    questions.push({
      question,
      answer,
      termKey: normalizeTermKey(answer),
      displayOrder: questions.length + 1,
      metadata
    });
  }

  return { slug, name, questions };
}
