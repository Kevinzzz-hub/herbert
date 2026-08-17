export interface SummaryPoint {
  text: string;
  sourcePages: number[];
}

export interface DocumentSummary {
  overview: string;
  keyPoints: SummaryPoint[];
  mainConclusion: SummaryPoint;
  importantConcepts: SummaryPoint[];
  limitations: string[];
}

export interface SummaryMeta {
  fileName: string;
  totalPages: number;
  chunkCount: number;
  requestCount: number;
  qualityWarnings: string[];
}

export interface SummaryResult {
  summary: DocumentSummary;
  meta: SummaryMeta;
  documentId?: string;
}

export interface DocumentQuestionAnswer {
  text: string;
  sourcePages: number[];
  status: "supported" | "insufficient";
}

export interface QuestionAnswerResult {
  answer: DocumentQuestionAnswer;
  meta: {
    consideredPages: number[];
    requestCount: number;
  };
}

export interface QuestionHistoryItem {
  role: "user" | "assistant";
  content: string;
}

export interface StudyCard {
  front: string;
  back: string;
  sourcePages: number[];
}

export interface QuizQuestion {
  question: string;
  options: string[];
  correctOptionIndex: number;
  explanation: string;
  sourcePages: number[];
}

export interface StudyPack {
  cards: StudyCard[];
  quiz: QuizQuestion[];
}

export interface StudyPackResult {
  studyPack: StudyPack;
  meta: {
    consideredPages: number[];
    requestCount: number;
  };
}

export interface QuizAttempt {
  correctCount: number;
  totalCount: number;
  completedAt: string;
}

export interface DocumentStudyRecord {
  studyPack: StudyPack;
  consideredPages: number[];
  generatedAt: string;
  lastStudiedAt: string;
  quizAttempts: QuizAttempt[];
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
  };
}

export interface Course {
  id: string;
  ownerId: string;
  title: string;
  description: string;
  documentCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CourseListResult {
  courses: Course[];
}

export interface CourseResult {
  course: Course;
}

export type CourseDocumentStatus = "pending" | "complete" | "failed";

export interface CourseDocument {
  id: string;
  ownerId: string;
  courseId: string;
  fileName: string;
  fileSize: number;
  pageCount: number;
  pages: import("./herbert").TextPage[];
  summary: DocumentSummary | null;
  summaryMeta: SummaryMeta | null;
  studyRecord?: DocumentStudyRecord | null;
  model: string;
  status: CourseDocumentStatus;
  errorMessage: string;
  createdAt: string;
  updatedAt: string;
}
