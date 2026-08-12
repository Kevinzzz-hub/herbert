import { NextResponse } from "next/server";
import {
  deepSeekJson,
  generateStudyPack,
  HerbertWebError,
  validateExtractedPages,
  validatePdfFileName,
  validateStudySummary,
} from "@/lib/herbert";
import type { ApiErrorBody, StudyPackResult } from "@/lib/types";

export async function POST(request: Request) {
  try {
    let input: unknown;
    try {
      input = await request.json();
    } catch {
      throw new HerbertWebError("INVALID_REQUEST", "学习材料请求格式不正确，请重新尝试。");
    }
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new HerbertWebError("INVALID_REQUEST", "学习材料请求格式不正确，请重新尝试。");
    }

    const payload = input as Record<string, unknown>;
    validatePdfFileName(payload.fileName);
    const pages = validateExtractedPages(payload.pages);
    const allowedPages = new Set(pages.map((page) => page.pageNumber));
    const summary = validateStudySummary(payload.summary, allowedPages);
    const result = await generateStudyPack(pages, summary, deepSeekJson);
    const response: StudyPackResult = {
      studyPack: result.studyPack,
      meta: { consideredPages: result.consideredPages, requestCount: 1 },
    };
    return NextResponse.json(response);
  } catch (error) {
    const known = error instanceof HerbertWebError
      ? error
      : new HerbertWebError("INTERNAL_ERROR", "Herbert 暂时无法生成学习材料，请稍后重试。", 500);
    const body: ApiErrorBody = { error: { code: known.code, message: known.message } };
    return NextResponse.json(body, { status: known.status });
  }
}
