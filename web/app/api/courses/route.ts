import { NextResponse } from "next/server";
import {
  courseFromRow,
  databaseError,
  getWorkspace,
  jsonWithWorkspace,
  validateCourseInput,
  workspaceErrorResponse,
} from "@/lib/course-workspace";
import { getSupabaseAdmin, WorkspaceError } from "@/lib/supabase-admin";
import type { CourseListResult, CourseResult } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const workspace = await getWorkspace({ create: false });
    if (!workspace) {
      const body: CourseListResult = { courses: [] };
      return NextResponse.json(body);
    }

    const { data, error } = await getSupabaseAdmin()
      .from("courses")
      .select("id,title,description,created_at,updated_at")
      .eq("workspace_id", workspace.id)
      .order("updated_at", { ascending: false });
    if (error) throw databaseError(error.message);

    const body: CourseListResult = { courses: (data ?? []).map(courseFromRow) };
    return jsonWithWorkspace(body, workspace);
  } catch (error) {
    return workspaceErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    let input: unknown;
    try {
      input = await request.json();
    } catch {
      throw new WorkspaceError("INVALID_COURSE", "课程信息格式不正确，请重新填写。");
    }
    const courseInput = validateCourseInput(input);
    const workspace = await getWorkspace({ create: true });
    if (!workspace) throw new WorkspaceError("DATABASE_ERROR", "无法建立私人课程空间。", 500);

    const { data, error } = await getSupabaseAdmin()
      .from("courses")
      .insert({ workspace_id: workspace.id, ...courseInput })
      .select("id,title,description,created_at,updated_at")
      .single();
    if (error || !data) throw databaseError(error?.message);

    const body: CourseResult = { course: courseFromRow(data) };
    return jsonWithWorkspace(body, workspace, { status: 201 });
  } catch (error) {
    return workspaceErrorResponse(error);
  }
}
