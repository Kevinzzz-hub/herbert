import { createHash, randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSupabaseAdmin, WorkspaceError } from "./supabase-admin";
import type { ApiErrorBody, Course } from "./types";

export const WORKSPACE_COOKIE = "herbert_workspace";
const TOKEN_PATTERN = /^[0-9a-f]{64}$/i;
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

interface WorkspaceContext {
  id: string;
  issuedToken?: string;
}

interface CourseRow {
  id: string;
  title: string;
  description: string;
  created_at: string;
  updated_at: string;
}

function hashWorkspaceToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function newWorkspaceToken(): string {
  return `${randomUUID()}${randomUUID()}`.replaceAll("-", "");
}

export async function getWorkspace(options: { create: boolean }): Promise<WorkspaceContext | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(WORKSPACE_COOKIE)?.value;
  const supabase = getSupabaseAdmin();

  if (token && TOKEN_PATTERN.test(token)) {
    const tokenHash = hashWorkspaceToken(token);
    const { data, error } = await supabase
      .from("workspaces")
      .select("id")
      .eq("access_token_hash", tokenHash)
      .maybeSingle();

    if (error) throw databaseError(error.message);
    if (data) return { id: data.id as string };
  }

  if (!options.create) return null;

  const issuedToken = newWorkspaceToken();
  const { data, error } = await supabase
    .from("workspaces")
    .insert({ access_token_hash: hashWorkspaceToken(issuedToken) })
    .select("id")
    .single();

  if (error || !data) throw databaseError(error?.message);
  return { id: data.id as string, issuedToken };
}

export function courseFromRow(row: CourseRow): Course {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function validateCourseInput(value: unknown): { title: string; description: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new WorkspaceError("INVALID_COURSE", "课程信息格式不正确，请重新填写。");
  }

  const input = value as Record<string, unknown>;
  const title = typeof input.title === "string" ? input.title.trim() : "";
  const description = typeof input.description === "string" ? input.description.trim() : "";
  if (!title || title.length > 80) {
    throw new WorkspaceError("INVALID_COURSE", "课程名称需要填写，并且不能超过 80 个字。只填名称也可以。");
  }
  if (description.length > 240) {
    throw new WorkspaceError("INVALID_COURSE", "课程说明不能超过 240 个字。");
  }
  return { title, description };
}

export function validateCourseId(value: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new WorkspaceError("INVALID_COURSE", "课程编号无效，请刷新页面后重试。");
  }
  return value;
}

export function jsonWithWorkspace(
  body: unknown,
  workspace: WorkspaceContext,
  init?: { status?: number },
): NextResponse {
  const response = NextResponse.json(body, init);
  if (workspace.issuedToken) {
    response.cookies.set(WORKSPACE_COOKIE, workspace.issuedToken, {
      httpOnly: true,
      maxAge: COOKIE_MAX_AGE,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
  }
  return response;
}

export function workspaceErrorResponse(error: unknown): NextResponse<ApiErrorBody> {
  const known = error instanceof WorkspaceError
    ? error
    : new WorkspaceError("DATABASE_ERROR", "课程书架暂时无法使用，请稍后重试。", 500);
  return NextResponse.json(
    { error: { code: known.code, message: known.message } },
    { status: known.status },
  );
}

export function databaseError(detail?: string): WorkspaceError {
  if (detail) console.error("Herbert database error:", detail);
  return new WorkspaceError("DATABASE_ERROR", "课程书架暂时无法使用，请稍后重试。", 500);
}
