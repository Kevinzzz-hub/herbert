"use client";

import { useRef, useState } from "react";
import { authenticatedFetch } from "@/lib/authenticated-fetch";
import { selectCourseEvidence } from "@/lib/course-retrieval";
import type {
  ApiErrorBody,
  CourseDocument,
  CourseQuestionAnswerResult,
  CourseQuestionCitation,
  QuestionHistoryItem,
} from "@/lib/types";

interface DisplayMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  citations: CourseQuestionCitation[];
  consideredSources?: CourseQuestionCitation[];
  documentCount?: number;
  status?: "supported" | "insufficient";
}

const suggestedQuestions = [
  "这些资料共同强调了哪些核心观点？",
  "不同 PDF 对同一概念的解释有什么差异？",
  "请综合课程资料整理一条复习主线。",
];

export function CourseQa({
  courseName,
  documents,
}: {
  courseName: string;
  documents: CourseDocument[];
}) {
  const nextMessageId = useRef(1);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [isAnswering, setIsAnswering] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const searchableDocuments = documents.filter((document) => document.pages.length > 0);

  const askQuestion = async () => {
    const currentQuestion = question.trim();
    if (currentQuestion.length < 2 || isAnswering || searchableDocuments.length === 0) return;
    const evidence = selectCourseEvidence(searchableDocuments, currentQuestion);
    if (evidence.length === 0) {
      setErrorMessage("课程资料中没有可检索的文字，请先添加可复制文字的 PDF。");
      return;
    }
    const history: QuestionHistoryItem[] = messages.slice(-6).map((message) => ({
      role: message.role,
      content: message.text,
    }));
    const userMessage: DisplayMessage = {
      id: `course-message-${nextMessageId.current++}`,
      role: "user",
      text: currentQuestion,
      citations: [],
    };

    setMessages((current) => [...current, userMessage]);
    setQuestion("");
    setErrorMessage("");
    setIsAnswering(true);
    try {
      const response = await authenticatedFetch("/api/course-ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ evidence, question: currentQuestion, history }),
      });
      const body = await response.json() as CourseQuestionAnswerResult | ApiErrorBody;
      if (!response.ok || "error" in body) {
        throw new Error("error" in body ? body.error.message : "Herbert 暂时无法回答课程问题，请稍后重试。");
      }
      const assistantMessage: DisplayMessage = {
        id: `course-message-${nextMessageId.current++}`,
        role: "assistant",
        text: body.answer.text,
        citations: body.answer.citations,
        consideredSources: body.meta.consideredSources,
        documentCount: body.meta.documentCount,
        status: body.answer.status,
      };
      setMessages((current) => [...current, assistantMessage]);
    } catch (error) {
      setMessages((current) => current.filter((message) => message.id !== userMessage.id));
      setQuestion(currentQuestion);
      setErrorMessage(error instanceof Error ? error.message : "Herbert 暂时无法回答课程问题，请稍后重试。");
    } finally {
      setIsAnswering(false);
    }
  };

  return (
    <section className="qa-section course-qa-section" aria-labelledby="course-qa-title">
      <div className="section-heading qa-heading">
        <span>Q</span>
        <div><p>ASK THE COURSE</p><h2 id="course-qa-title">问整门课</h2></div>
      </div>

      <div className="qa-layout">
        <div className="qa-intro">
          <p>Herbert 会从“{courseName}”的所有 PDF 中先找证据，再综合回答。</p>
          <div className="course-search-status">
            <strong>{searchableDocuments.length}</strong>
            <span>份 PDF 可联合检索</span>
          </div>
          <div className="suggested-questions" aria-label="课程推荐问题">
            {suggestedQuestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => setQuestion(suggestion)}
                disabled={isAnswering || searchableDocuments.length === 0}
              >
                {suggestion}<span aria-hidden="true">↗</span>
              </button>
            ))}
          </div>
          <small>检索在当前浏览器完成；只把最相关的文字片段发送给 DeepSeek，原 PDF 不会上传。</small>
        </div>

        <div className="qa-desk">
          <div className="qa-messages" aria-live="polite">
            {messages.length === 0 ? (
              <div className="qa-empty">
                <span aria-hidden="true">H</span>
                <p>{searchableDocuments.length > 0
                  ? "试着比较两份资料、寻找共同主线，或让 Herbert 综合解释一个概念。"
                  : "先完成至少一份 PDF 的文字提取，再从整门课中寻找答案。"}</p>
              </div>
            ) : (
              messages.map((message) => (
                <article className={`qa-message is-${message.role}`} key={message.id}>
                  <div className="qa-message-label">{message.role === "user" ? "你" : "Herbert"}</div>
                  <p>{message.text}</p>
                  {message.role === "assistant" ? (
                    <div className="qa-evidence course-qa-evidence">
                      {message.citations.length > 0 ? (
                        <div className="course-citations">
                          {message.citations.map((citation) => (
                            <span className="page-reference" key={`${citation.documentId}:${citation.pageNumber}`}>
                              {citation.fileName} · 第{citation.pageNumber}页
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="insufficient-label">课程资料中没有找到足够依据</span>
                      )}
                      {message.consideredSources?.length ? (
                        <small>本次核对 {message.documentCount} 份资料中的 {message.consideredSources.length} 页证据</small>
                      ) : null}
                    </div>
                  ) : null}
                </article>
              ))
            )}
            {isAnswering ? <div className="qa-thinking" role="status"><i /><i /><i /> Herbert 正在跨 PDF 核对证据</div> : null}
          </div>

          <form
            className="qa-form"
            onSubmit={(event) => {
              event.preventDefault();
              void askQuestion();
            }}
          >
            <label htmlFor="course-question">你的课程问题</label>
            <textarea
              id="course-question"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              maxLength={500}
              rows={3}
              placeholder="例如：瀑布模型和敏捷方法在这些资料中有什么主要区别？"
              disabled={isAnswering || searchableDocuments.length === 0}
            />
            <div className="qa-form-footer">
              <span>{question.length}/500</span>
              <button type="submit" disabled={question.trim().length < 2 || isAnswering || searchableDocuments.length === 0}>
                {isAnswering ? "正在联合检索" : "向课程提问"}<span aria-hidden="true">→</span>
              </button>
            </div>
            {errorMessage ? <p className="qa-error" role="alert">{errorMessage}</p> : null}
          </form>
        </div>
      </div>
    </section>
  );
}
