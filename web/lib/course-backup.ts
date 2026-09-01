import type {
  Course,
  CourseDocument,
  CourseDocumentStatus,
  DocumentStudyRecord,
  DocumentSummary,
  QuizAttempt,
  StudyPack,
  SummaryMeta,
  SummaryPoint,
} from "./types";
import type { TextPage } from "./herbert";

export const COURSE_BACKUP_FORMAT = "herbert-course-backup";
export const COURSE_BACKUP_VERSION = 1;
export const MAX_COURSE_BACKUP_BYTES = 25 * 1024 * 1024;

const MAX_BACKUP_DOCUMENTS = 200;
const MAX_DOCUMENT_PAGES = 120;
const MAX_DOCUMENT_CHARACTERS = 80_000;

export interface CourseBackupDocument {
  fileName: string;
  fileSize: number;
  pageCount: number;
  pages: TextPage[];
  summary: DocumentSummary | null;
  summaryMeta: SummaryMeta | null;
  studyRecord: DocumentStudyRecord | null;
  model: string;
  status: CourseDocumentStatus;
  errorMessage: string;
  createdAt: string;
  updatedAt: string;
}

export interface CourseBackupV1 {
  format: typeof COURSE_BACKUP_FORMAT;
  version: typeof COURSE_BACKUP_VERSION;
  exportedAt: string;
  course: {
    title: string;
    description: string;
    createdAt: string;
    updatedAt: string;
  };
  documents: CourseBackupDocument[];
}

export class CourseBackupError extends Error {
  constructor(message = "这不是 Herbert 支持的课程备份文件。") {
    super(message);
    this.name = "CourseBackupError";
  }
}

export function createCourseBackup(course: Course, documents: CourseDocument[]): CourseBackupV1 {
  return {
    format: COURSE_BACKUP_FORMAT,
    version: COURSE_BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    course: {
      title: course.title,
      description: course.description,
      createdAt: course.createdAt,
      updatedAt: course.updatedAt,
    },
    documents: documents.map((document) => ({
      fileName: document.fileName,
      fileSize: document.fileSize,
      pageCount: document.pageCount,
      pages: document.pages,
      summary: document.summary,
      summaryMeta: document.summaryMeta,
      studyRecord: document.studyRecord ?? null,
      model: document.model,
      status: document.status,
      errorMessage: document.errorMessage,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
    })),
  };
}

export function serializeCourseBackup(backup: CourseBackupV1): string {
  return JSON.stringify(backup, null, 2);
}

export function courseBackupFileName(title: string): string {
  const safeTitle = title.normalize("NFKC").replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim().slice(0, 64);
  return `${safeTitle || "Herbert-course"}.herbert-course.json`;
}

export function parseCourseBackup(raw: string): CourseBackupV1 {
  if (new TextEncoder().encode(raw).byteLength > MAX_COURSE_BACKUP_BYTES) {
    throw new CourseBackupError("备份文件超过 25 MB，当前版本暂时无法导入。");
  }
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new CourseBackupError("备份文件不是有效的 JSON，请重新选择 Herbert 导出的文件。");
  }
  const root = requireObject(value, "备份文件");
  if (root.format !== COURSE_BACKUP_FORMAT || root.version !== COURSE_BACKUP_VERSION) {
    throw new CourseBackupError("备份格式或版本不受支持，请使用 Herbert 导出的课程文件。");
  }
  const course = requireObject(root.course, "课程");
  if (!Array.isArray(root.documents) || root.documents.length > MAX_BACKUP_DOCUMENTS) {
    throw new CourseBackupError("备份中的 PDF 数量不符合要求。");
  }
  return {
    format: COURSE_BACKUP_FORMAT,
    version: COURSE_BACKUP_VERSION,
    exportedAt: requireDate(root.exportedAt, "导出时间"),
    course: {
      title: requireString(course.title, "课程名称", 1, 80),
      description: requireString(course.description, "课程说明", 0, 240),
      createdAt: requireDate(course.createdAt, "课程创建时间"),
      updatedAt: requireDate(course.updatedAt, "课程更新时间"),
    },
    documents: root.documents.map((document, index) => parseDocument(document, index)),
  };
}

function parseDocument(value: unknown, index: number): CourseBackupDocument {
  const object = requireObject(value, `第 ${index + 1} 份 PDF`);
  if (!Array.isArray(object.pages) || object.pages.length < 1 || object.pages.length > MAX_DOCUMENT_PAGES) {
    throw new CourseBackupError(`第 ${index + 1} 份 PDF 的页数不符合要求。`);
  }
  const pages = object.pages.map((page, pageIndex) => parsePage(page, index, pageIndex));
  const allowedPages = new Set(pages.map((page) => page.pageNumber));
  if (allowedPages.size !== pages.length || pages.reduce((total, page) => total + page.text.length, 0) > MAX_DOCUMENT_CHARACTERS) {
    throw new CourseBackupError(`第 ${index + 1} 份 PDF 的页码或文字量不符合要求。`);
  }
  const pageCount = requireInteger(object.pageCount, "PDF 页数", 1, MAX_DOCUMENT_PAGES);
  if (pageCount !== pages.length) throw new CourseBackupError(`第 ${index + 1} 份 PDF 的页数记录不一致。`);
  const summary = object.summary === null ? null : parseSummary(object.summary, allowedPages);
  const summaryMeta = object.summaryMeta === null ? null : parseSummaryMeta(object.summaryMeta);
  const status = parseStatus(object.status);
  if ((summary === null) !== (summaryMeta === null) || (status === "complete" && !summary)) {
    throw new CourseBackupError(`第 ${index + 1} 份 PDF 的总结状态不一致。`);
  }
  return {
    fileName: requireString(object.fileName, "PDF 文件名", 1, 255),
    fileSize: requireInteger(object.fileSize, "PDF 文件大小", 0, 12 * 1024 * 1024),
    pageCount,
    pages,
    summary,
    summaryMeta,
    studyRecord: object.studyRecord == null ? null : parseStudyRecord(object.studyRecord, allowedPages),
    model: requireString(object.model, "模型名称", 1, 80),
    status,
    errorMessage: requireString(object.errorMessage, "错误说明", 0, 500),
    createdAt: requireDate(object.createdAt, "PDF 创建时间"),
    updatedAt: requireDate(object.updatedAt, "PDF 更新时间"),
  };
}

function parsePage(value: unknown, documentIndex: number, pageIndex: number): TextPage {
  const object = requireObject(value, "PDF 页面");
  return {
    pageNumber: requireInteger(object.pageNumber, "PDF 页码", 1, MAX_DOCUMENT_PAGES),
    text: requireString(object.text, `第 ${documentIndex + 1} 份 PDF 的第 ${pageIndex + 1} 页文字`, 1, MAX_DOCUMENT_CHARACTERS),
  };
}

function parseSummary(value: unknown, allowedPages: Set<number>): DocumentSummary {
  const object = requireObject(value, "PDF 总结");
  if (!Array.isArray(object.keyPoints) || object.keyPoints.length < 3 || object.keyPoints.length > 7) {
    throw new CourseBackupError("PDF 总结的核心要点数量不符合要求。");
  }
  if (!Array.isArray(object.importantConcepts) || object.importantConcepts.length > 40 || !Array.isArray(object.limitations)) {
    throw new CourseBackupError("PDF 总结的重要概念或提示格式不正确。");
  }
  return {
    overview: requireString(object.overview, "一句话概括", 1, 4_000),
    keyPoints: object.keyPoints.map((point) => parseSummaryPoint(point, allowedPages)),
    mainConclusion: parseSummaryPoint(object.mainConclusion, allowedPages),
    importantConcepts: object.importantConcepts.map((point) => parseSummaryPoint(point, allowedPages)),
    limitations: object.limitations.map((item) => requireString(item, "阅读提示", 1, 4_000)),
  };
}

function parseSummaryPoint(value: unknown, allowedPages: Set<number>): SummaryPoint {
  const object = requireObject(value, "总结要点");
  return {
    text: requireString(object.text, "总结文字", 1, 8_000),
    sourcePages: parsePageNumbers(object.sourcePages, allowedPages),
  };
}

function parseSummaryMeta(value: unknown): SummaryMeta {
  const object = requireObject(value, "总结信息");
  if (!Array.isArray(object.qualityWarnings) || object.qualityWarnings.length > 120) {
    throw new CourseBackupError("总结质量提示格式不正确。");
  }
  return {
    fileName: requireString(object.fileName, "总结文件名", 1, 255),
    totalPages: requireInteger(object.totalPages, "总结页数", 1, MAX_DOCUMENT_PAGES),
    chunkCount: requireInteger(object.chunkCount, "总结分块数", 1, 500),
    requestCount: requireInteger(object.requestCount, "总结请求数", 1, 501),
    qualityWarnings: object.qualityWarnings.map((item) => requireString(item, "质量提示", 1, 2_000)),
  };
}

function parseStudyRecord(value: unknown, allowedPages: Set<number>): DocumentStudyRecord {
  const object = requireObject(value, "复习记录");
  if (!Array.isArray(object.quizAttempts) || object.quizAttempts.length > 20) {
    throw new CourseBackupError("测验历史记录数量不符合要求。");
  }
  return {
    studyPack: parseStudyPack(object.studyPack, allowedPages),
    consideredPages: parsePageNumbers(object.consideredPages, allowedPages),
    generatedAt: requireDate(object.generatedAt, "学习材料生成时间"),
    lastStudiedAt: requireDate(object.lastStudiedAt, "最近学习时间"),
    quizAttempts: object.quizAttempts.map(parseQuizAttempt),
  };
}

function parseStudyPack(value: unknown, allowedPages: Set<number>): StudyPack {
  const object = requireObject(value, "学习材料");
  if (!Array.isArray(object.cards) || object.cards.length < 1 || object.cards.length > 20 || !Array.isArray(object.quiz) || object.quiz.length < 1 || object.quiz.length > 20) {
    throw new CourseBackupError("知识卡片或测验题数量不符合要求。");
  }
  return {
    cards: object.cards.map((value) => {
      const card = requireObject(value, "知识卡片");
      return {
        front: requireString(card.front, "卡片问题", 1, 4_000),
        back: requireString(card.back, "卡片答案", 1, 8_000),
        sourcePages: parsePageNumbers(card.sourcePages, allowedPages),
      };
    }),
    quiz: object.quiz.map((value) => {
      const question = requireObject(value, "测验题");
      if (!Array.isArray(question.options) || question.options.length !== 4) {
        throw new CourseBackupError("测验题必须包含四个选项。");
      }
      return {
        question: requireString(question.question, "测验问题", 1, 4_000),
        options: question.options.map((option) => requireString(option, "测验选项", 1, 4_000)),
        correctOptionIndex: requireInteger(question.correctOptionIndex, "正确答案序号", 0, 3),
        explanation: requireString(question.explanation, "答案解释", 1, 8_000),
        sourcePages: parsePageNumbers(question.sourcePages, allowedPages),
      };
    }),
  };
}

function parseQuizAttempt(value: unknown): QuizAttempt {
  const object = requireObject(value, "测验成绩");
  const totalCount = requireInteger(object.totalCount, "测验题数", 1, 100);
  return {
    correctCount: requireInteger(object.correctCount, "正确题数", 0, totalCount),
    totalCount,
    completedAt: requireDate(object.completedAt, "测验完成时间"),
  };
}

function parsePageNumbers(value: unknown, allowedPages: Set<number>): number[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_DOCUMENT_PAGES) {
    throw new CourseBackupError("引用页码格式不正确。");
  }
  return value.map((page) => {
    const pageNumber = requireInteger(page, "引用页码", 1, MAX_DOCUMENT_PAGES);
    if (!allowedPages.has(pageNumber)) throw new CourseBackupError("备份内容引用了不存在的 PDF 页码。");
    return pageNumber;
  });
}

function parseStatus(value: unknown): CourseDocumentStatus {
  if (value === "pending" || value === "complete" || value === "failed") return value;
  throw new CourseBackupError("PDF 处理状态不正确。");
}

function requireObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new CourseBackupError(`${label}格式不正确。`);
  return value as Record<string, unknown>;
}

function requireString(value: unknown, label: string, minLength: number, maxLength: number): string {
  if (typeof value !== "string" || value.length < minLength || value.length > maxLength) {
    throw new CourseBackupError(`${label}格式不正确。`);
  }
  return value;
}

function requireInteger(value: unknown, label: string, minimum: number, maximum: number): number {
  if (!Number.isInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new CourseBackupError(`${label}格式不正确。`);
  }
  return value as number;
}

function requireDate(value: unknown, label: string): string {
  const date = requireString(value, label, 1, 64);
  if (!Number.isFinite(Date.parse(date))) throw new CourseBackupError(`${label}格式不正确。`);
  return date;
}
