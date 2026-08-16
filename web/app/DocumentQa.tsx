"use client";

import { useRef, useState } from "react";
import { authenticatedFetch } from "@/lib/authenticated-fetch";
import type { TextPage } from "@/lib/herbert";
import type {
  ApiErrorBody,
  QuestionAnswerResult,
  QuestionHistoryItem,
} from "@/lib/types";

interface DisplayMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  sourcePages: number[];
  status?: "supported" | "insufficient";
  consideredPages?: number[];
}

const suggestedQuestions = [
  "这份文档最重要的观点是什么？",
  "作者用了哪些证据支持结论？",
  "有哪些容易误解的概念？",
];

export function DocumentQa({ fileName, pages }: { fileName: string; pages: TextPage[] }) {
  const nextMessageId = useRef(1);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [isAnswering, setIsAnswering] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const askQuestion = async () => {
    const currentQuestion = question.trim();
    if (currentQuestion.length < 2 || isAnswering) return;

    const history: QuestionHistoryItem[] = messages.slice(-6).map((message) => ({
      role: message.role,
      content: message.text,
    }));
    const userMessage: DisplayMessage = {
      id: `message-${nextMessageId.current++}`,
      role: "user",
      text: currentQuestion,
      sourcePages: [],
    };

    setMessages((current) => [...current, userMessage]);
    setQuestion("");
    setErrorMessage("");
    setIsAnswering(true);

    try {
      const response = await authenticatedFetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName, pages, question: currentQuestion, history }),
      });
      const body = await response.json() as QuestionAnswerResult | ApiErrorBody;
      if (!response.ok || "error" in body) {
        throw new Error("error" in body ? body.error.message : "Herbert 暂时无法回答，请稍后重试。");
      }
      const assistantMessage: DisplayMessage = {
        id: `message-${nextMessageId.current++}`,
        role: "assistant",
        text: body.answer.text,
        sourcePages: body.answer.sourcePages,
        status: body.answer.status,
        consideredPages: body.meta.consideredPages,
      };
      setMessages((current) => [...current, assistantMessage]);
    } catch (error) {
      setMessages((current) => current.filter((message) => message.id !== userMessage.id));
      setQuestion(currentQuestion);
      setErrorMessage(error instanceof Error ? error.message : "Herbert 暂时无法回答，请稍后重试。");
    } finally {
      setIsAnswering(false);
    }
  };

  return (
    <section className="qa-section" aria-labelledby="qa-title">
      <div className="section-heading qa-heading">
        <span>03</span>
        <div><p>ASK THE DOCUMENT</p><h2 id="qa-title">继续问这份 PDF</h2></div>
      </div>

      <div className="qa-layout">
        <div className="qa-intro">
          <p>Herbert 会先寻找与问题最相关的页面，再依据原文回答并标注页码。</p>
          <div className="suggested-questions" aria-label="推荐问题">
            {suggestedQuestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => setQuestion(suggestion)}
                disabled={isAnswering}
              >
                {suggestion}<span aria-hidden="true">↗</span>
              </button>
            ))}
          </div>
          <small>为了回答问题，相关页文字、问题和最近对话会发送给 DeepSeek。原 PDF 文件不会上传。</small>
        </div>

        <div className="qa-desk">
          <div className="qa-messages" aria-live="polite">
            {messages.length === 0 ? (
              <div className="qa-empty">
                <span aria-hidden="true">H</span>
                <p>从一个具体问题开始。比如：某个概念是什么意思，或某项结论有什么依据？</p>
              </div>
            ) : (
              messages.map((message) => (
                <article className={`qa-message is-${message.role}`} key={message.id}>
                  <div className="qa-message-label">{message.role === "user" ? "你" : "Herbert"}</div>
                  <p>{message.text}</p>
                  {message.role === "assistant" ? (
                    <div className="qa-evidence">
                      {message.sourcePages.length > 0 ? (
                        <span className="page-reference">第{message.sourcePages.join("、")}页</span>
                      ) : (
                        <span className="insufficient-label">文档中没有找到足够依据</span>
                      )}
                      {message.consideredPages?.length ? (
                        <small>本次检索：第{message.consideredPages.join("、")}页</small>
                      ) : null}
                    </div>
                  ) : null}
                </article>
              ))
            )}
            {isAnswering ? <div className="qa-thinking" role="status"><i /><i /><i /> Herbert 正在核对原文</div> : null}
          </div>

          <form
            className="qa-form"
            onSubmit={(event) => {
              event.preventDefault();
              void askQuestion();
            }}
          >
            <label htmlFor="document-question">你的问题</label>
            <textarea
              id="document-question"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              maxLength={500}
              rows={3}
              placeholder="例如：作者为什么认为软件需要不断演化？"
              disabled={isAnswering}
            />
            <div className="qa-form-footer">
              <span>{question.length}/500</span>
              <button type="submit" disabled={question.trim().length < 2 || isAnswering}>
                {isAnswering ? "正在查找" : "向 PDF 提问"}<span aria-hidden="true">→</span>
              </button>
            </div>
            {errorMessage ? <p className="qa-error" role="alert">{errorMessage}</p> : null}
          </form>
        </div>
      </div>
    </section>
  );
}
