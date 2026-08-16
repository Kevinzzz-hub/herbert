"use client";

import type { CourseDocument } from "@/lib/types";

export type DocumentShelfState = "loading" | "ready" | "error";

export function CourseDocuments({
  documents,
  state,
  errorMessage,
  busyDocumentId,
  onOpen,
  onRetry,
  onDelete,
  onRefresh,
}: {
  documents: CourseDocument[];
  state: DocumentShelfState;
  errorMessage: string;
  busyDocumentId: string | null;
  onOpen: (document: CourseDocument) => void;
  onRetry: (document: CourseDocument) => void;
  onDelete: (document: CourseDocument) => void;
  onRefresh: () => void;
}) {
  return (
    <section className="course-documents" aria-labelledby="course-documents-title">
      <div className="course-documents-heading">
        <div><p>LOCAL READING RECORDS</p><h2 id="course-documents-title">课程资料</h2></div>
        <span>{documents.length} 份 · 保存在本浏览器</span>
      </div>

      {state === "loading" ? (
        <div className="document-shelf-message" role="status">正在读取本机文档记录…</div>
      ) : null}
      {state === "error" ? (
        <div className="document-shelf-message is-error" role="alert">
          <span>{errorMessage}</span><button type="button" onClick={onRefresh}>重新读取</button>
        </div>
      ) : null}
      {state === "ready" && documents.length === 0 ? (
        <div className="document-shelf-message">
          还没有文档。完成下方的第一次 PDF 总结后，它会自动出现在这里。
        </div>
      ) : null}
      {state === "ready" && documents.length > 0 ? (
        <div className="document-record-grid">
          {documents.map((document, index) => {
            const isBusy = busyDocumentId === document.id;
            return (
              <article className={`document-record is-${document.status}`} key={document.id}>
                <div className="document-record-topline">
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <strong>{statusLabel(document.status)}</strong>
                </div>
                <h3>{document.fileName}</h3>
                <p>{document.summary?.overview ?? fallbackMessage(document)}</p>
                <div className="document-record-meta">
                  <span>{document.pageCount} 页</span>
                  <span>{formatFileSize(document.fileSize)}</span>
                  <span>{formatDate(document.updatedAt)}</span>
                </div>
                <div className="document-record-actions">
                  {document.status === "complete" ? (
                    <button type="button" onClick={() => onOpen(document)} disabled={isBusy}>
                      {isBusy ? "正在打开" : "打开总结"} <span>→</span>
                    </button>
                  ) : (
                    <button type="button" onClick={() => onRetry(document)} disabled={isBusy}>
                      {isBusy ? "正在处理" : "继续总结"} <span>↻</span>
                    </button>
                  )}
                  <button className="document-delete" type="button" onClick={() => onDelete(document)} disabled={isBusy}>
                    删除记录
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

function statusLabel(status: CourseDocument["status"]): string {
  if (status === "complete") return "已保存";
  if (status === "failed") return "未完成";
  return "等待继续";
}

function fallbackMessage(document: CourseDocument): string {
  if (document.status === "failed" && document.errorMessage) return document.errorMessage;
  return "提取文字已经保存在本机，可以继续完成这次总结。";
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric" }).format(new Date(value));
}

function formatFileSize(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
