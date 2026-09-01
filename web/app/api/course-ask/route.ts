import { NextResponse } from "next/server";
import { createAiJson } from "@/lib/ai-provider";
import {
  answerCourseQuestion,
  HerbertWebError,
  validateCourseEvidence,
  validateQuestion,
  validateQuestionHistory,
} from "@/lib/herbert";
import { requireUserAiCredential } from "@/lib/user-api-key";
import type { ApiErrorBody, CourseQuestionAnswerResult } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const aiJson = createAiJson(await requireUserAiCredential(request));
    let input: unknown;
    try {
      input = await request.json();
    } catch {
      throw new HerbertWebError("INVALID_REQUEST", "课程问题格式不正确，请重新输入。");
    }
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new HerbertWebError("INVALID_REQUEST", "课程问题格式不正确，请重新输入。");
    }

    const payload = input as Record<string, unknown>;
    const evidence = validateCourseEvidence(payload.evidence);
    const question = validateQuestion(payload.question);
    const history = validateQuestionHistory(payload.history);
    const result = await answerCourseQuestion(evidence, question, history, aiJson);
    const response: CourseQuestionAnswerResult = {
      answer: result.answer,
      meta: {
        consideredSources: result.consideredSources,
        documentCount: result.documentCount,
        requestCount: 1,
      },
    };
    return NextResponse.json(response);
  } catch (error) {
    const known = error instanceof HerbertWebError
      ? error
      : new HerbertWebError("INTERNAL_ERROR", "Herbert 暂时无法回答课程问题，请稍后重试。", 500);
    const body: ApiErrorBody = {
      error: { code: known.code, message: known.message },
    };
    return NextResponse.json(body, { status: known.status });
  }
}
