import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_COURSE_CONTEXT_CHARACTERS,
  MAX_COURSE_EVIDENCE_ITEMS,
  selectCourseEvidence,
} from "../lib/course-retrieval.ts";

function document(id, fileName, pages) {
  return {
    id,
    fileName,
    pages: pages.map((text, index) => ({ pageNumber: index + 1, text })),
  };
}

test("retrieves relevant evidence from more than one PDF", () => {
  const waterfall = document("waterfall", "waterfall.pdf", [
    "The waterfall model follows sequential requirements, design, implementation, and testing phases.",
    "Waterfall works best when requirements are stable and well understood.",
  ]);
  const agile = document("agile", "agile.pdf", [
    "Agile development uses short iterations, customer feedback, and adaptation to change.",
    "Agile teams deliver working software incrementally.",
  ]);
  const evidence = selectCourseEvidence([waterfall, agile], "Compare waterfall and agile development");
  assert.deepEqual(new Set(evidence.map((source) => source.documentId)), new Set(["waterfall", "agile"]));
  assert.ok(evidence.every((source) => source.fileName.endsWith(".pdf")));
});

test("keeps course evidence bounded and prevents one PDF from taking every slot", () => {
  const dense = document(
    "dense",
    "dense.pdf",
    Array.from({ length: 20 }, (_, index) => `Agile waterfall comparison on dense page ${index + 1}. `.repeat(8)),
  );
  const second = document("second", "second.pdf", [
    "Agile and waterfall make different tradeoffs between feedback and up-front planning.",
  ]);
  const evidence = selectCourseEvidence([dense, second], "agile waterfall tradeoffs");
  const denseCount = evidence.filter((source) => source.documentId === "dense").length;
  assert.ok(evidence.length <= MAX_COURSE_EVIDENCE_ITEMS);
  assert.ok(denseCount <= 4);
  assert.ok(evidence.some((source) => source.documentId === "second"));
  assert.ok(evidence.reduce((total, source) => total + source.text.length, 0) <= MAX_COURSE_CONTEXT_CHARACTERS);
});

test("samples each PDF when a broad question has no literal keyword match", () => {
  const first = document("first", "first.pdf", ["Alpha material with enough readable text for retrieval."]);
  const second = document("second", "second.pdf", ["Beta material with enough readable text for retrieval."]);
  const evidence = selectCourseEvidence([first, second], "完全无关的中文问题");
  assert.deepEqual(new Set(evidence.map((source) => source.documentId)), new Set(["first", "second"]));
});

test("respects a smaller caller-provided character budget", () => {
  const longDocument = document("long", "long.pdf", ["retrieval ".repeat(60), "retrieval ".repeat(60)]);
  const evidence = selectCourseEvidence([longDocument], "retrieval", 700);
  assert.ok(evidence.reduce((total, source) => total + source.text.length, 0) <= 700);
});
