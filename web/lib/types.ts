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

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
  };
}
