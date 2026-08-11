import { NextResponse } from "next/server";
import {
  answerQuestion,
  deepSeekJson,
  HerbertWebError,
  validateExtractedPages,
  validatePdfFileName,
  validateQuestion,
  validateQuestionHistory,
} from "@/lib/herbert";
import type { ApiErrorBody, QuestionAnswerResult } from "@/lib/types";

export async function POST(request: Request) {
  try {
    let input: unknown;
    try {
      input = await request.json();
    } catch {
      throw new HerbertWebError("INVALID_REQUEST", "问题格式不正确，请重新输入。");
    }
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new HerbertWebError("INVALID_REQUEST", "问题格式不正确，请重新输入。");
    }

    const payload = input as Record<string, unknown>;
    validatePdfFileName(payload.fileName);
    const pages = validateExtractedPages(payload.pages);
    const question = validateQuestion(payload.question);
    const history = validateQuestionHistory(payload.history);
    const result = await answerQuestion(pages, question, history, deepSeekJson);
    const response: QuestionAnswerResult = {
      answer: result.answer,
      meta: {
        consideredPages: result.consideredPages,
        requestCount: 1,
      },
    };
    return NextResponse.json(response);
  } catch (error) {
    const known = error instanceof HerbertWebError
      ? error
      : new HerbertWebError("INTERNAL_ERROR", "Herbert 暂时无法回答，请稍后重试。", 500);
    const body: ApiErrorBody = {
      error: { code: known.code, message: known.message },
    };
    return NextResponse.json(body, { status: known.status });
  }
}
