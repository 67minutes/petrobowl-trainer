import readExcelFile from "read-excel-file/node";
import { TOPIC_ASSIGNMENTS } from "@/lib/constants";

export type ParsedQuestion = {
  question: string;
  answer: string;
  displayOrder: number;
  metadata: Record<string, string | number | boolean>;
};

export type ParsedTopic = {
  name: string;
  assignedTo: string | null;
  questions: ParsedQuestion[];
};

export type ParsedQuestionBank = {
  topics: ParsedTopic[];
  skippedSheets: string[];
  warnings: string[];
};

const SKIP_SHEETS = new Set(["topics", "randomizer"]);
const ANSWER_FIRST_SHEETS = new Set([
  "renewables (iea + eia)",
  "machine learning (gpt)",
  "renewables (gpt)"
]);

const QUESTION_HEADERS = new Set([
  "q",
  "question",
  "questions",
  "soal",
  "definition",
  "reviseddefinition",
  "prompt"
]);

const ANSWER_HEADERS = new Set([
  "a",
  "answer",
  "answerkey",
  "jawaban",
  "term",
  "concept"
]);

const IGNORED_HEADERS = new Set(["", "no", "number", "#", "shuffle", "s"]);

type SheetRows = unknown[][];

type ColumnDetection = {
  questionIndex: number;
  answerIndex: number;
  headerRowIndex: number | null;
  metadataHeaders: Map<number, string>;
};

function normalizeHeader(value: unknown) {
  return normalizeText(value).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizeText(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function stripNumberedPrefix(value: string) {
  return value.replace(/^\d+[\s.)-]+/, "").trim();
}

function toNodeBuffer(buffer: Buffer | ArrayBuffer | Uint8Array) {
  if (Buffer.isBuffer(buffer)) {
    return buffer;
  }

  if (buffer instanceof ArrayBuffer) {
    return Buffer.from(buffer);
  }

  return Buffer.from(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}

function findHeaderBasedColumns(rows: SheetRows): ColumnDetection | null {
  const maxHeaderScanRows = Math.min(rows.length, 5);

  for (let rowIndex = 0; rowIndex < maxHeaderScanRows; rowIndex += 1) {
    const row = rows[rowIndex] ?? [];
    let questionIndex = -1;
    let answerIndex = -1;
    const metadataHeaders = new Map<number, string>();

    row.forEach((cell, index) => {
      const normalized = normalizeHeader(cell);
      if (QUESTION_HEADERS.has(normalized)) {
        questionIndex = index;
        return;
      }
      if (ANSWER_HEADERS.has(normalized)) {
        answerIndex = index;
        return;
      }
      if (!IGNORED_HEADERS.has(normalized)) {
        metadataHeaders.set(index, normalizeText(cell));
      }
    });

    if (questionIndex >= 0 && answerIndex >= 0) {
      return {
        questionIndex,
        answerIndex,
        headerRowIndex: rowIndex,
        metadataHeaders
      };
    }
  }

  return null;
}

function detectColumns(sheetName: string, rows: SheetRows): ColumnDetection | null {
  const headerDetection = findHeaderBasedColumns(rows);
  if (headerDetection) {
    return headerDetection;
  }

  if (ANSWER_FIRST_SHEETS.has(sheetName.toLowerCase())) {
    return {
      answerIndex: 0,
      questionIndex: 1,
      headerRowIndex: null,
      metadataHeaders: new Map()
    };
  }

  return null;
}

export async function parseQuestionBank(
  buffer: Buffer | ArrayBuffer | Uint8Array
): Promise<ParsedQuestionBank> {
  const sheets = await readExcelFile(toNodeBuffer(buffer));
  const topics: ParsedTopic[] = [];
  const skippedSheets: string[] = [];
  const warnings: string[] = [];

  for (const sheet of sheets) {
    const sheetName = sheet.sheet;
    const normalizedSheetName = sheetName.toLowerCase();

    if (SKIP_SHEETS.has(normalizedSheetName)) {
      skippedSheets.push(sheetName);
      continue;
    }

    const rows = sheet.data as unknown as SheetRows;
    const detection = detectColumns(sheetName, rows);

    if (!detection) {
      warnings.push(`Skipped ${sheetName}: could not detect question/answer columns.`);
      continue;
    }

    const startRow = detection.headerRowIndex === null ? 0 : detection.headerRowIndex + 1;
    const questions: ParsedQuestion[] = [];

    rows.slice(startRow).forEach((row, rowOffset) => {
      const rawQuestion = normalizeText(row[detection.questionIndex]);
      const rawAnswer = normalizeText(row[detection.answerIndex]);
      const question = rawQuestion;
      const answer = stripNumberedPrefix(rawAnswer);

      if (!question || !answer || question.startsWith("=") || answer.startsWith("=")) {
        return;
      }

      const metadata: ParsedQuestion["metadata"] = {};
      for (const [index, header] of detection.metadataHeaders.entries()) {
        const value = row[index];
        const normalizedValue = normalizeText(value);
        if (normalizedValue) {
          metadata[header] = normalizedValue;
        }
      }

      questions.push({
        question,
        answer,
        metadata,
        displayOrder: rowOffset + 1
      });
    });

    if (questions.length === 0) {
      warnings.push(`Skipped ${sheetName}: no question rows after parsing.`);
      continue;
    }

    topics.push({
      name: sheetName,
      assignedTo: TOPIC_ASSIGNMENTS[sheetName] ?? null,
      questions
    });
  }

  return { topics, skippedSheets, warnings };
}

export function summarizeQuestionBank(bank: ParsedQuestionBank) {
  return {
    topicCount: bank.topics.length,
    questionCount: bank.topics.reduce((sum, topic) => sum + topic.questions.length, 0),
    skippedSheets: bank.skippedSheets,
    warnings: bank.warnings,
    topics: bank.topics.map((topic) => ({
      name: topic.name,
      assignedTo: topic.assignedTo,
      questionCount: topic.questions.length
    }))
  };
}
