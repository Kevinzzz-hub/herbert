import type { CourseDocument, CourseEvidencePage } from "./types";

export const MAX_COURSE_CONTEXT_CHARACTERS = 18_000;
export const MAX_COURSE_EVIDENCE_ITEMS = 10;
const MAX_PAGES_PER_DOCUMENT = 4;

interface RankedEvidence extends CourseEvidencePage {
  documentOrder: number;
  pageOrder: number;
  priority: number;
}

export function selectCourseEvidence(
  documents: CourseDocument[],
  question: string,
  characterLimit = MAX_COURSE_CONTEXT_CHARACTERS,
): CourseEvidencePage[] {
  const searchableDocuments = documents.filter((document) => document.pages.length > 0);
  if (searchableDocuments.length === 0) return [];

  const terms = getQuestionTerms(question);
  const pages = searchableDocuments.flatMap((document, documentOrder) => (
    document.pages.map((page, pageOrder) => ({
      documentId: document.id,
      fileName: document.fileName,
      pageNumber: page.pageNumber,
      text: page.text,
      documentOrder,
      pageOrder,
      score: scoreText(page.text, terms),
    }))
  ));
  const rankedMatches = pages
    .filter((page) => page.score > 0)
    .sort((left, right) => (
      right.score - left.score
      || left.documentOrder - right.documentOrder
      || left.pageOrder - right.pageOrder
    ));
  const candidates = new Map<string, RankedEvidence>();
  const addCandidate = (
    page: (typeof pages)[number],
    priority: number,
  ) => {
    const key = `${page.documentId}:${page.pageNumber}`;
    const current = candidates.get(key);
    if (current && current.priority >= priority) return;
    candidates.set(key, {
      documentId: page.documentId,
      fileName: page.fileName,
      pageNumber: page.pageNumber,
      text: page.text,
      documentOrder: page.documentOrder,
      pageOrder: page.pageOrder,
      priority,
    });
  };

  if (rankedMatches.length > 0) {
    const bestMatchPerDocument = new Map<string, (typeof rankedMatches)[number]>();
    for (const match of rankedMatches) {
      if (!bestMatchPerDocument.has(match.documentId)) {
        bestMatchPerDocument.set(match.documentId, match);
      }
    }
    for (const match of bestMatchPerDocument.values()) {
      addCandidate(match, match.score);
    }
    for (const match of rankedMatches.slice(0, 12)) {
      addCandidate(match, match.score);
      const document = searchableDocuments[match.documentOrder];
      for (const neighborOffset of [-1, 1]) {
        const neighbor = document.pages[match.pageOrder + neighborOffset];
        if (!neighbor) continue;
        addCandidate({
          ...match,
          pageNumber: neighbor.pageNumber,
          text: neighbor.text,
          pageOrder: match.pageOrder + neighborOffset,
        }, match.score * 0.55);
      }
    }
  } else {
    const fallbackPages: Array<(typeof pages)[number]> = [];
    for (let sampleIndex = 0; sampleIndex < 3; sampleIndex += 1) {
      searchableDocuments.forEach((document, documentOrder) => {
        if (document.pages.length === 0) return;
        const pageOrder = Math.round(
          sampleIndex * (document.pages.length - 1) / 2,
        );
        const page = document.pages[pageOrder];
        fallbackPages.push({
          documentId: document.id,
          fileName: document.fileName,
          pageNumber: page.pageNumber,
          text: page.text,
          documentOrder,
          pageOrder,
          score: 0,
        });
      });
    }
    fallbackPages.forEach((page, index) => addCandidate(page, fallbackPages.length - index));
  }

  const selected: CourseEvidencePage[] = [];
  const selectedPerDocument = new Map<string, number>();
  let remainingCharacters = Math.min(characterLimit, MAX_COURSE_CONTEXT_CHARACTERS);
  const orderedCandidates = [...candidates.values()].sort((left, right) => (
    right.priority - left.priority
    || left.documentOrder - right.documentOrder
    || left.pageOrder - right.pageOrder
  ));

  for (const candidate of orderedCandidates) {
    if (selected.length >= MAX_COURSE_EVIDENCE_ITEMS || remainingCharacters < 200) break;
    const documentCount = selectedPerDocument.get(candidate.documentId) ?? 0;
    if (documentCount >= MAX_PAGES_PER_DOCUMENT) continue;
    const text = candidate.text.trim().slice(0, remainingCharacters);
    if (text.length < 20) continue;
    selected.push({
      documentId: candidate.documentId,
      fileName: candidate.fileName,
      pageNumber: candidate.pageNumber,
      text,
    });
    selectedPerDocument.set(candidate.documentId, documentCount + 1);
    remainingCharacters -= text.length;
  }
  return selected;
}

function getQuestionTerms(question: string): string[] {
  const normalized = question.toLowerCase();
  const terms = new Set(normalized.match(/[a-z0-9][a-z0-9_-]{1,}/g) ?? []);
  const chineseSequences = normalized.match(/[\u3400-\u9fff]{2,}/g) ?? [];
  for (const sequence of chineseSequences) {
    if (sequence.length <= 8) terms.add(sequence);
    for (let index = 0; index < sequence.length - 1; index += 1) {
      terms.add(sequence.slice(index, index + 2));
    }
  }
  const stopTerms = new Set([
    "what", "which", "how", "why", "the", "this", "that",
    "什么", "哪些", "如何", "为什么", "这份", "文档", "文章", "内容", "主要", "课程", "资料",
  ]);
  return [...terms].filter((term) => !stopTerms.has(term));
}

function scoreText(text: string, terms: string[]): number {
  const normalized = text.toLowerCase();
  let score = 0;
  for (const term of terms) {
    let start = 0;
    let occurrences = 0;
    while (occurrences < 5) {
      const matchIndex = normalized.indexOf(term, start);
      if (matchIndex === -1) break;
      occurrences += 1;
      start = matchIndex + term.length;
    }
    score += occurrences * Math.min(term.length, 8);
  }
  return score;
}
