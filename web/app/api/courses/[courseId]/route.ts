import { NextResponse } from "next/server";
import {
  databaseError,
  getWorkspace,
  validateCourseId,
  workspaceErrorResponse,
} from "@/lib/course-workspace";
import { getSupabaseAdmin, WorkspaceError } from "@/lib/supabase-admin";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ courseId: string }> },
) {
  try {
    const { courseId: rawCourseId } = await params;
    const courseId = validateCourseId(rawCourseId);
    const workspace = await getWorkspace({ create: false });
    if (!workspace) {
      throw new WorkspaceError("WORKSPACE_EXPIRED", "私人课程空间凭证已失效，请刷新页面后重试。", 401);
    }

    const { data, error } = await getSupabaseAdmin()
      .from("courses")
      .delete()
      .eq("id", courseId)
      .eq("workspace_id", workspace.id)
      .select("id")
      .maybeSingle();
    if (error) throw databaseError(error.message);
    if (!data) throw new WorkspaceError("COURSE_NOT_FOUND", "没有找到这门课程，可能已经被删除。", 404);

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return workspaceErrorResponse(error);
  }
}
