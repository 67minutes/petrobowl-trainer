import {
  normalizeTermKey,
  redactTerm,
  type ParsedGlossaryQuestion,
  type ParsedGlossaryTopic
} from "@/lib/import/glossary-csv";

// Detecting synonyms automatically has to favor precision: a false merge silently
// deletes a distinct card, which is worse than leaving two cards unmerged. Raw
// definition similarity is NOT reliable — parallel concepts such as "gas coning"
// vs "water coning" share a near-identical template but are different things. So
// two terms are only merged when one of two high-precision signals fires:
//
//   Rule V — the terms are the same string modulo spacing/hyphens/punctuation
//            (e.g. "backflow" / "back flow", "J slot" / "J-slot", "openhole" /
//            "open hole"). Essentially zero false positives.
//   Rule P — a definition explicitly cross-references the other term directly after
//            a synonym/abbreviation cue (e.g. 'Synonymous with "drilling mud"',
//            "Abbreviation for inflow control device", "Another term for coiled
//            tubing"). Only the exact term that BEGINS the referenced phrase is
//            linked, so "mud" cannot match inside "drilling mud".

// Cues that in the SLB glossary are written immediately before the referenced term.
// Loose cues ("see", "referred to as") are deliberately excluded — they point at
// related, not synonymous, terms and chain unrelated concepts together.
const CUE_RE =
  /\b(?:synonymous\s+with|synonyms?\s+for|also\s+called|also\s+known\s+as|another\s+(?:term|name)\s+for|abbreviation\s+for|abbreviated\s+as|acronym\s+for|short\s+for)\b/gi;

// How far after a cue to look for referenced terms (covers short lists like
// "hole-cleaning capacity and cuttings lifting").
const CUE_WINDOW = 60;

// Function words that begin prose ("…also known as a bounding surface…") rather
// than a term reference. Segments starting with one of these are ignored so bare
// articles cannot chain unrelated concepts together.
const STOPWORDS = new Set([
  "a", "an", "the", "of", "or", "and", "in", "on", "to", "is", "are", "as", "at",
  "by", "for", "with", "that", "which", "this", "these", "those", "from", "into",
  "its", "it", "be", "was", "were", "than", "then", "such", "used", "any", "one"
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/-/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

// Collapses spacing/hyphens/punctuation so spelling variants share a key.
function termVariantKey(term: string): string {
  return term.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isPrefix(candidate: string[], tokens: string[]): boolean {
  if (candidate.length === 0 || candidate.length > tokens.length) {
    return false;
  }
  for (let i = 0; i < candidate.length; i += 1) {
    if (candidate[i] !== tokens[i]) {
      return false;
    }
  }
  return true;
}

// The text pieces referenced right after each synonym cue in a definition.
function referencedSegments(definition: string): string[][] {
  CUE_RE.lastIndex = 0;
  const segments: string[][] = [];
  let match: RegExpExecArray | null;
  while ((match = CUE_RE.exec(definition)) !== null) {
    const start = match.index + match[0].length;
    const window = definition.slice(start, start + CUE_WINDOW);
    for (const piece of window.split(/[,;.:]|\band\b|\bor\b/i)) {
      const tokens = tokenize(piece);
      // Skip prose fragments: a real term reference never starts with a function
      // word or a stray single letter.
      if (tokens.length > 0 && tokens[0].length > 1 && !STOPWORDS.has(tokens[0])) {
        segments.push(tokens);
      }
    }
  }
  return segments;
}

// A bare single lowercase word ("cap", "sonic", "resin") is too generic to link
// on a one-way mention; acronyms and multi-word terms are specific enough.
function isGenericTarget(answer: string): boolean {
  return !/[A-Z]/.test(answer) && tokenize(answer).length <= 1;
}

// Groups a topic's questions into synonym clusters (connected components). Every
// question ends up in exactly one group; unique terms are singleton groups.
export function detectSynonymGroups(
  questions: ParsedGlossaryQuestion[]
): ParsedGlossaryQuestion[][] {
  const n = questions.length;
  const parent = Array.from({ length: n }, (_, i) => i);

  const find = (x: number): number => {
    let root = x;
    while (parent[root] !== root) {
      parent[root] = parent[parent[root]];
      root = parent[root];
    }
    return root;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) {
      parent[rb] = ra;
    }
  };

  const variantKeys = questions.map((q) => termVariantKey(q.answer));
  const termTokens = questions.map((q) => tokenize(q.answer));

  // Rule V: spelling/spacing/hyphen variants of the same term.
  const byVariant = new Map<string, number>();
  for (let i = 0; i < n; i += 1) {
    if (!variantKeys[i]) {
      continue;
    }
    const seen = byVariant.get(variantKeys[i]);
    if (seen === undefined) {
      byVariant.set(variantKeys[i], i);
    } else {
      union(seen, i);
    }
  }

  // Index terms by their first token so prefix lookups stay cheap.
  const termsByFirstToken = new Map<string, number[]>();
  for (let i = 0; i < n; i += 1) {
    const first = termTokens[i][0];
    if (!first) {
      continue;
    }
    const bucket = termsByFirstToken.get(first) ?? [];
    bucket.push(i);
    termsByFirstToken.set(first, bucket);
  }

  // Rule P, pass 1: for each cue-referenced phrase, find the longest term that
  // begins it. Record who references whom before committing to any merge.
  const references = questions.map(() => new Set<number>());
  for (let i = 0; i < n; i += 1) {
    for (const segment of referencedSegments(questions[i].question)) {
      const candidates = termsByFirstToken.get(segment[0]) ?? [];
      let bestIdx = -1;
      let bestLen = 0;
      for (const k of candidates) {
        // Never target a stray single-letter term (e.g. Archie's "a"/"n"/"m").
        if (k === i || termTokens[k].length === 1 && termTokens[k][0].length === 1) {
          continue;
        }
        if (isPrefix(termTokens[k], segment) && termTokens[k].length > bestLen) {
          bestIdx = k;
          bestLen = termTokens[k].length;
        }
      }
      if (bestIdx >= 0) {
        references[i].add(bestIdx);
      }
    }
  }

  // Rule P, pass 2: commit merges. A multi-word or acronym target is specific
  // enough to trust one-directionally; a bare generic word must be mutual.
  for (let i = 0; i < n; i += 1) {
    for (const j of references[i]) {
      if (!isGenericTarget(questions[j].answer) || references[j].has(i)) {
        union(i, j);
      }
    }
  }

  const groupsByRoot = new Map<number, ParsedGlossaryQuestion[]>();
  for (let i = 0; i < n; i += 1) {
    const root = find(i);
    const group = groupsByRoot.get(root) ?? [];
    group.push(questions[i]);
    groupsByRoot.set(root, group);
  }
  return [...groupsByRoot.values()];
}

function dedupeSortedAnswers(values: string[]): string[] {
  const byLower = new Map<string, string>();
  for (const value of values) {
    const key = value.toLowerCase();
    if (!byLower.has(key)) {
      byLower.set(key, value);
    }
  }
  return [...byLower.values()].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
}

function mergeMetadata(
  group: ParsedGlossaryQuestion[],
  primary: ParsedGlossaryQuestion
): ParsedGlossaryQuestion["metadata"] {
  const disciplines = new Set<string>();
  for (const question of group) {
    for (const part of question.metadata.disciplines?.split(";") ?? []) {
      const trimmed = part.trim();
      if (trimmed) {
        disciplines.add(trimmed);
      }
    }
  }
  const metadata: ParsedGlossaryQuestion["metadata"] = {};
  if (disciplines.size) {
    metadata.disciplines = [...disciplines].join("; ");
  }
  if (primary.metadata.url) {
    metadata.url = primary.metadata.url;
  }
  return metadata;
}

function mergeGroup(group: ParsedGlossaryQuestion[]): ParsedGlossaryQuestion {
  if (group.length === 1) {
    return { ...group[0], acceptedAnswers: dedupeSortedAnswers([group[0].answer]) };
  }

  // Primary/canonical answer: shortest term (usually the common name or expansion),
  // then earliest, then alphabetical for determinism.
  const primary = [...group].sort(
    (a, b) =>
      a.answer.length - b.answer.length ||
      a.displayOrder - b.displayOrder ||
      a.answer.localeCompare(b.answer)
  )[0];
  // Card text: the longest / most complete definition.
  const chosen = [...group].sort(
    (a, b) => b.question.length - a.question.length || a.displayOrder - b.displayOrder
  )[0];

  // Redact every member term so no synonym gives away the answer.
  let question = chosen.question;
  for (const member of group) {
    question = redactTerm(question, member.answer);
  }

  return {
    question,
    answer: primary.answer,
    acceptedAnswers: dedupeSortedAnswers(group.map((q) => q.answer)),
    termKey: normalizeTermKey(primary.answer),
    displayOrder: Math.min(...group.map((q) => q.displayOrder)),
    metadata: mergeMetadata(group, primary)
  };
}

// Collapses synonymous questions within a topic into single multi-answer questions.
export function collapseSynonyms(topic: ParsedGlossaryTopic): ParsedGlossaryTopic {
  const merged = detectSynonymGroups(topic.questions)
    .map(mergeGroup)
    .sort((a, b) => a.displayOrder - b.displayOrder);
  return { ...topic, questions: merged };
}
