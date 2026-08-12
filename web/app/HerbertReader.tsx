"use client";

import { useEffect, useRef, useState } from "react";
import { DocumentQa } from "./DocumentQa";
import { StudyLab } from "./StudyLab";
import type { TextPage } from "@/lib/herbert";
import type { ApiErrorBody, SummaryPoint, SummaryResult } from "@/lib/types";

type ViewState = "idle" | "selected" | "loading" | "success" | "error";

const progressSteps = [
  "检查 PDF 是否可读",
  "提取并整理每一页文字",
  "分段理解文档内容",
  "合并全文重点与页码",
];

export function HerbertReader() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [view, setView] = useState<ViewState>("idle");
  const [isDragging, setIsDragging] = useState(false);
  const [progressStep, setProgressStep] = useState(0);
  const [result, setResult] = useState<SummaryResult | null>(null);
  const [documentPages, setDocumentPages] = useState<TextPage[]>([]);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (view !== "loading") return;
    const timers = [
      window.setTimeout(() => setProgressStep((current) => Math.max(current, 1)), 1800),
      window.setTimeout(() => setProgressStep((current) => Math.max(current, 2)), 4800),
      window.setTimeout(() => setProgressStep((current) => Math.max(current, 3)), 10000),
    ];
    return () => timers.forEach(window.clearTimeout);
  }, [view]);

  const chooseFile = (candidate: File | undefined) => {
    if (!candidate) return;
    setResult(null);
    setDocumentPages([]);
    setErrorMessage("");
    if (!candidate.name.toLowerCase().endsWith(".pdf")) {
      setFile(null);
      setView("error");
      setErrorMessage("这不是 PDF 文件，请重新上传。");
      return;
    }
    if (candidate.size > 12 * 1024 * 1024) {
      setFile(null);
      setView("error");
      setErrorMessage("文件超过 12 MB，请上传更小的 PDF。");
      return;
    }
    setFile(candidate);
    setView("selected");
  };

  const reset = () => {
    setFile(null);
    setResult(null);
    setDocumentPages([]);
    setErrorMessage("");
    setProgressStep(0);
    setView("idle");
    if (inputRef.current) inputRef.current.value = "";
  };

  const summarize = async () => {
    if (!file) return;
    setView("loading");
    setProgressStep(0);
    try {
      const { extractPdf } = await import("@/lib/pdf");
      const pages = await extractPdf(file);
      setDocumentPages(pages);
      setProgressStep(2);
      const response = await fetch("/api/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, pages }),
      });
      const body = await response.json() as SummaryResult | ApiErrorBody;
      if (!response.ok || "error" in body) {
        throw new Error("error" in body ? body.error.message : "Herbert 暂时无法完成总结，请稍后重试。");
      }
      setResult(body);
      setView("success");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Herbert 暂时无法完成总结，请稍后重试。");
      setView("error");
    }
  };

  const downloadSummary = () => {
    if (!result) return;
    const markdown = renderMarkdown(result);
    const url = URL.createObjectURL(new Blob([markdown], { type: "text/markdown;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${result.meta.fileName.replace(/\.pdf$/i, "")}-herbert-summary.md`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className={`app-shell ${view === "success" ? "has-result" : ""}`}>
      <header className="site-header">
        <button className="brand" type="button" onClick={reset} aria-label="返回 Herbert 首页">
          <span className="brand-mark" aria-hidden="true"><span /></span>
          <span className="brand-copy"><strong>HERBERT</strong><small>PDF READING ASSISTANT</small></span>
        </button>
        <span className="privacy-note"><i aria-hidden="true" />原 PDF 留在浏览器，仅提取文字用于总结、问答与学习材料</span>
      </header>

      {view === "success" && result ? (
        <SummaryView result={result} pages={documentPages} onReset={reset} onDownload={downloadSummary} />
      ) : (
        <section className="hero-section">
          <div className="hero-copy">
            <p className="eyebrow">YOUR QUIET READING DESK</p>
            <h1>读完一份 PDF，<br /><em>不必从头迷失。</em></h1>
            <p className="hero-description">Herbert 帮你抓住全文主线、核心知识点和主要结论，并保留原文页码，方便随时回看核对。</p>
            <ol className="promise-list">
              <li><span>01</span><div><strong>先看主线</strong><p>一句话概括和 3–7 个核心要点</p></div></li>
              <li><span>02</span><div><strong>再学概念</strong><p>整理真正影响理解的重要知识</p></div></li>
              <li><span>03</span><div><strong>回到原文</strong><p>每条要点保留可核对的 PDF 页码</p></div></li>
            </ol>
          </div>

          <div className="upload-panel">
            <input
              ref={inputRef}
              className="visually-hidden"
              type="file"
              accept="application/pdf,.pdf"
              onChange={(event) => chooseFile(event.target.files?.[0])}
            />
            {view === "loading" ? (
              <LoadingState fileName={file?.name ?? "PDF"} currentStep={progressStep} />
            ) : view === "error" ? (
              <ErrorState message={errorMessage} onRetry={reset} />
            ) : (
              <div
                className={`drop-zone ${isDragging ? "is-dragging" : ""} ${view === "selected" ? "has-file" : ""}`}
                onDragEnter={(event) => { event.preventDefault(); setIsDragging(true); }}
                onDragOver={(event) => event.preventDefault()}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setIsDragging(false);
                  chooseFile(event.dataTransfer.files[0]);
                }}
              >
                <div className="paper-icon" aria-hidden="true"><span>PDF</span><i /><i /><i /></div>
                {file ? (
                  <>
                    <p className="panel-kicker">PDF 已准备好</p>
                    <h2 className="file-name">{file.name}</h2>
                    <p className="file-meta">{formatFileSize(file.size)} · 上传后预计需要 1–2 分钟</p>
                    <button className="primary-button" type="button" onClick={summarize}>开始总结 <span aria-hidden="true">→</span></button>
                    <button className="text-button" type="button" onClick={() => inputRef.current?.click()}>换一份文件</button>
                  </>
                ) : (
                  <>
                    <p className="panel-kicker">上传你的阅读材料</p>
                    <h2>把 PDF 放在这里</h2>
                    <p>拖拽文件，或从电脑中选择</p>
                    <button className="primary-button" type="button" onClick={() => inputRef.current?.click()}>选择 PDF <span aria-hidden="true">＋</span></button>
                    <small>支持可复制文字的 PDF · 最大 12 MB · 暂不支持扫描件</small>
                  </>
                )}
              </div>
            )}
            <div className="panel-footnote"><span aria-hidden="true">◇</span>总结由 DeepSeek 生成，重要内容请结合页码核对</div>
          </div>
        </section>
      )}

      <footer className="site-footer"><span>HERBERT · V0.3</span><p>Named for a great American librarian.</p></footer>
    </main>
  );
}

function LoadingState({ fileName, currentStep }: { fileName: string; currentStep: number }) {
  return (
    <div className="loading-state" role="status" aria-live="polite">
      <div className="loading-monogram" aria-hidden="true"><span>H</span><i /></div>
      <p className="panel-kicker">Herbert 正在阅读</p>
      <h2>{fileName}</h2>
      <div className="progress-track"><span style={{ width: `${((currentStep + 1) / progressSteps.length) * 100}%` }} /></div>
      <ul className="progress-list">
        {progressSteps.map((step, index) => (
          <li className={index < currentStep ? "is-done" : index === currentStep ? "is-current" : ""} key={step}>
            <span>{index < currentStep ? "✓" : index + 1}</span>{step}
          </li>
        ))}
      </ul>
      <small>请保持页面打开，长文档可能需要更久</small>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="error-state" role="alert">
      <div className="error-symbol" aria-hidden="true">!</div>
      <p className="panel-kicker">无法完成这次阅读</p>
      <h2>此 PDF 暂不适用</h2>
      <p>{message}</p>
      <button className="primary-button" type="button" onClick={onRetry}>重新上传 <span aria-hidden="true">↻</span></button>
      <small>请尝试可复制文字、未加密且小于 12 MB 的 PDF</small>
    </div>
  );
}

function SummaryView({
  result,
  pages,
  onReset,
  onDownload,
}: {
  result: SummaryResult;
  pages: TextPage[];
  onReset: () => void;
  onDownload: () => void;
}) {
  const { summary, meta } = result;
  return (
    <article className="summary-page">
      <div className="summary-toolbar">
        <div><p className="eyebrow">READING COMPLETE</p><h1>{meta.fileName}</h1><p>{meta.totalPages} 页 · {meta.chunkCount} 个阅读分块 · {meta.requestCount} 次 AI 请求</p></div>
        <div className="toolbar-actions"><button type="button" onClick={onDownload}>下载总结</button><button className="solid" type="button" onClick={onReset}>总结另一份 PDF</button></div>
      </div>

      <section className="overview-card"><span>一句话概括</span><p>{summary.overview}</p></section>

      <section className="summary-section key-section">
        <div className="section-heading"><span>01</span><div><p>THE THROUGH LINE</p><h2>核心要点</h2></div></div>
        <ol className="key-points">
          {summary.keyPoints.map((point, index) => <li key={`${point.text}-${index}`}><span>{String(index + 1).padStart(2, "0")}</span><p>{point.text}</p><PageReference pages={point.sourcePages} /></li>)}
        </ol>
      </section>

      <section className="conclusion-card"><div><p>MAIN CONCLUSION</p><h2>主要结论</h2></div><div><p>{summary.mainConclusion.text}</p><PageReference pages={summary.mainConclusion.sourcePages} /></div></section>

      <section className="summary-section concepts-section">
        <div className="section-heading"><span>02</span><div><p>TERMS TO KEEP</p><h2>重要概念</h2></div></div>
        <div className="concept-grid">{summary.importantConcepts.map((point, index) => <div className="concept-card" key={`${point.text}-${index}`}><p>{point.text}</p><PageReference pages={point.sourcePages} /></div>)}</div>
      </section>

      {(summary.limitations.length > 0 || meta.qualityWarnings.length > 0) && (
        <section className="notice-card"><div className="notice-heading"><span aria-hidden="true">i</span><div><p>BEFORE YOU RELY ON IT</p><h2>阅读提示</h2></div></div><ul>{[...summary.limitations, ...meta.qualityWarnings].map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul></section>
      )}

      <DocumentQa fileName={meta.fileName} pages={pages} />

      <StudyLab fileName={meta.fileName} pages={pages} summary={summary} />
    </article>
  );
}

function PageReference({ pages }: { pages: number[] }) {
  return <span className="page-reference">第{pages.join("、")}页</span>;
}

function formatFileSize(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function renderMarkdown(result: SummaryResult): string {
  const point = (item: SummaryPoint) => `- ${item.text}（第${item.sourcePages.join("、")}页）`;
  return [
    "# Herbert Summary", "", "## 一句话概括", "", result.summary.overview, "",
    "## 核心要点", "", ...result.summary.keyPoints.map(point), "",
    "## 主要结论", "", point(result.summary.mainConclusion), "",
    "## 重要概念", "", ...result.summary.importantConcepts.map(point), "",
    "## 阅读提示", "", ...[...result.summary.limitations, ...result.meta.qualityWarnings].map((item) => `- ${item}`), "",
  ].join("\n");
}
