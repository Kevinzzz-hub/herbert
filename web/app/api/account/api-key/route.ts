import { NextResponse } from "next/server";
import { HerbertWebError } from "@/lib/herbert";
import {
  deleteAiCredential,
  getApiKeyStatus,
  readAiCredentialInput,
  requireAuthenticatedUser,
  saveAiCredential,
} from "@/lib/user-api-key";
import type { ApiErrorBody } from "@/lib/types";

export async function GET(request: Request) {
  try {
    const user = await requireAuthenticatedUser(request);
    return privateJson(await getApiKeyStatus(user.id));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    const user = await requireAuthenticatedUser(request);
    let input: unknown;
    try {
      input = await request.json();
    } catch {
      throw new HerbertWebError("INVALID_REQUEST", "密钥内容格式不正确。", 400);
    }
    return privateJson(await saveAiCredential(user.id, readAiCredentialInput(input)));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireAuthenticatedUser(request);
    await deleteAiCredential(user.id);
    return privateJson({
      configured: false,
      provider: null,
      providerLabel: null,
      model: null,
      keyHint: null,
      updatedAt: null,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

function privateJson(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "private, no-store");
  return NextResponse.json(body, { ...init, headers });
}

function errorResponse(error: unknown) {
  const known = error instanceof HerbertWebError
    ? error
    : new HerbertWebError("INTERNAL_ERROR", "Herbert 的账号设置暂时不可用。", 500);
  const body: ApiErrorBody = { error: { code: known.code, message: known.message } };
  return privateJson(body, { status: known.status });
}
