import { NextResponse } from "next/server";
import {
  assessTextQuality,
  deepSeekJson,
  HerbertWebError,
  summarizePages,
  validateExtractedPages,
} from "@/lib/herbert";
import type { ApiErrorBody, SummaryResult } from "@/lib/types";

export const runtime = "edge";

export async function POST(request: Request) {
  try {
    let input: unknown;
    try {
      input = await request.json();
    } catch {
      throw new HerbertWebError("INVALID_REQUEST", "提交内容格式不正确，请重新上传 PDF。");
    }
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new HerbertWebError("INVALID_REQUEST", "提交内容格式不正确，请重新上传 PDF。");
    }
    const payload = input as Record<string, unknown>;
    if (
      typeof payload.fileName !== "string"
      || !payload.fileName.trim().toLowerCase().endsWith(".pdf")
      || payload.fileName.length > 255
    ) {
      throw new HerbertWebError("MISSING_FILE", "请选择一份 PDF 后再开始总结。");
    }
    const fileName = payload.fileName.trim();
    const pages = validateExtractedPages(payload.pages);

    const qualityWarnings = assessTextQuality(pages);
    const result = await summarizePages(pages, deepSeekJson);
    const response: SummaryResult = {
      summary: result.summary,
      meta: {
        fileName,
        totalPages: pages.length,
        chunkCount: result.chunkCount,
        requestCount: result.requestCount,
        qualityWarnings,
      },
    };
    return NextResponse.json(response);
  } catch (error) {
    const known = error instanceof HerbertWebError
      ? error
      : new HerbertWebError("INTERNAL_ERROR", "Herbert 暂时无法完成总结，请稍后重试。", 500);
    const body: ApiErrorBody = {
      error: { code: known.code, message: known.message },
    };
    return NextResponse.json(body, { status: known.status });
  }
}
