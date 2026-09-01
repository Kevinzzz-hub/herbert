"use client";

import { useState } from "react";
import { authenticatedFetch } from "@/lib/authenticated-fetch";
import { saveLocalQuizAttempt, saveLocalStudyPack } from "@/lib/local-library";
import type { TextPage } from "@/lib/herbert";
import type {
  ApiErrorBody,
  DocumentStudyRecord,
  DocumentSummary,
  StudyPack,
  StudyPackResult,
} from "@/lib/types";

type StudyMode = "cards" | "quiz";

export function StudyLab({
  ownerId,
  documentId,
  fileName,
  pages,
  summary,
  initialStudyRecord,
  onStudyRecordChange,
}: {
  ownerId: string;
  documentId: string;
  fileName: string;
  pages: TextPage[];
  summary: DocumentSummary;
  initialStudyRecord: DocumentStudyRecord | null;
  onStudyRecordChange: (record: DocumentStudyRecord) => void;
}) {
  const [studyRecord, setStudyRecord] = useState<DocumentStudyRecord | null>(initialStudyRecord);
  const [studyPack, setStudyPack] = useState<StudyPack | null>(() => initialStudyRecord?.studyPack ?? null);
  const [consideredPages, setConsideredPages] = useState<number[]>(() => initialStudyRecord?.consideredPages ?? []);
  const [mode, setMode] = useState<StudyMode>("cards");
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [saveMessage, setSaveMessage] = useState(initialStudyRecord ? "已从本机恢复学习材料" : "");

  const generate = async () => {
    if (isGenerating) return;
    setIsGenerating(true);
    setErrorMessage("");
    try {
      const response = await authenticatedFetch("/api/study", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName, pages, summary }),
      });
      const body = await response.json() as StudyPackResult | ApiErrorBody;
      if (!response.ok || "error" in body) {
        throw new Error("error" in body ? body.error.message : "Herbert 暂时无法生成学习材料。");
      }
      setStudyPack(body.studyPack);
      setConsideredPages(body.meta.consideredPages);
      setMode("cards");
      try {
        const updated = await saveLocalStudyPack(ownerId, documentId, body);
        const record = updated.studyRecord ?? null;
        setStudyRecord(record);
        if (record) onStudyRecordChange(record);
        setSaveMessage("学习材料已保存到本机，下次打开无需重新生成");
      } catch {
        setSaveMessage("");
        setErrorMessage("学习材料已经生成，但暂时无法保存；离开页面前仍可继续使用。");
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Herbert 暂时无法生成学习材料。");
    } finally {
      setIsGenerating(false);
    }
  };

  const recordQuizAttempt = async (correctCount: number, totalCount: number) => {
    setSaveMessage("正在保存本次成绩…");
    try {
      const updated = await saveLocalQuizAttempt(ownerId, documentId, correctCount, totalCount);
      const record = updated.studyRecord ?? null;
      setStudyRecord(record);
      if (record) onStudyRecordChange(record);
      setSaveMessage("本次成绩已保存到课程记录");
    } catch (error) {
      setSaveMessage("");
      setErrorMessage(error instanceof Error ? error.message : "本次测验成绩暂时无法保存。");
    }
  };

  const latestAttempt = studyRecord?.quizAttempts.at(-1);

  return (
    <section className="study-section" aria-labelledby="study-title">
      <div className="section-heading study-heading">
        <span>04</span>
        <div><p>TURN READING INTO RECALL</p><h2 id="study-title">把重点真正记下来</h2></div>
      </div>

      {!studyPack ? (
        <div className="study-start">
          <div>
            <p className="study-kicker">ACTIVE RECALL</p>
            <h3>知识卡片 + 5 道小测验</h3>
            <p>Herbert 会从总结引用过的原文页面中制作学习材料。先主动回忆，再查看答案，比反复阅读更能暴露理解盲区。</p>
            <small>相关页文字和当前总结会发送给当前 AI 服务；生成结果会保存在当前浏览器的课程记录中。</small>
          </div>
          <button type="button" onClick={() => void generate()} disabled={isGenerating}>
            {isGenerating ? "正在制作学习材料" : "生成学习材料"}<span aria-hidden="true">→</span>
          </button>
          {errorMessage ? <p className="study-error" role="alert">{errorMessage}</p> : null}
        </div>
      ) : (
        <div className="study-workspace">
          <div className="study-tabs" role="tablist" aria-label="学习方式">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "cards"}
              onClick={() => setMode("cards")}
            >
              知识卡片 <span>{studyPack.cards.length}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "quiz"}
              onClick={() => setMode("quiz")}
            >
              小测验 <span>{studyPack.quiz.length}</span>
            </button>
            <small>取材页：第{consideredPages.join("、")}页</small>
          </div>
          <div className="study-record-summary">
            <span>{studyRecord ? `已复习 ${studyRecord.quizAttempts.length} 次` : "学习材料尚未保存"}</span>
            {latestAttempt ? <span>最近成绩 {latestAttempt.correctCount} / {latestAttempt.totalCount}</span> : <span>完成测验后会保存成绩</span>}
            {studyRecord ? <span>上次学习 {formatStudyDate(studyRecord.lastStudiedAt)}</span> : null}
          </div>
          {mode === "cards" ? (
            <FlashcardDeck cards={studyPack.cards} />
          ) : (
            <Quiz questions={studyPack.quiz} onComplete={(correctCount, totalCount) => void recordQuizAttempt(correctCount, totalCount)} />
          )}
        </div>
      )}
      {saveMessage ? <p className="study-save-message" role="status">{saveMessage}</p> : null}
      {errorMessage && studyPack ? <p className="study-error" role="alert">{errorMessage}</p> : null}
    </section>
  );
}

function FlashcardDeck({ cards }: { cards: StudyPack["cards"] }) {
  const [cardIndex, setCardIndex] = useState(0);
  const [isRevealed, setIsRevealed] = useState(false);
  const card = cards[cardIndex];

  const move = (nextIndex: number) => {
    setCardIndex(nextIndex);
    setIsRevealed(false);
  };

  return (
    <div className="flashcard-area" role="tabpanel">
      <p className="study-progress">卡片 {cardIndex + 1} / {cards.length}</p>
      <button
        type="button"
        className={`flashcard ${isRevealed ? "is-revealed" : ""}`}
        onClick={() => setIsRevealed((current) => !current)}
        aria-label={isRevealed ? "隐藏答案" : "显示答案"}
      >
        <span>{isRevealed ? "ANSWER" : "QUESTION"}</span>
        <strong>{isRevealed ? card.back : card.front}</strong>
        <small>{isRevealed ? `依据：第${card.sourcePages.join("、")}页 · 点击回到问题` : "想好后点击查看答案"}</small>
      </button>
      <div className="study-navigation">
        <button type="button" onClick={() => move(cardIndex - 1)} disabled={cardIndex === 0}>← 上一张</button>
        <button type="button" onClick={() => move(cardIndex + 1)} disabled={cardIndex === cards.length - 1}>下一张 →</button>
      </div>
    </div>
  );
}

function Quiz({ questions, onComplete }: { questions: StudyPack["quiz"]; onComplete: (correctCount: number, totalCount: number) => void }) {
  const [answers, setAnswers] = useState<Array<number | null>>(() => questions.map(() => null));
  const [questionIndex, setQuestionIndex] = useState(0);
  const question = questions[questionIndex];
  const selectedOption = answers[questionIndex];
  const completedCount = answers.filter((answer) => answer !== null).length;
  const correctCount = answers.reduce<number>(
    (total, answer, index) => total + (answer === questions[index].correctOptionIndex ? 1 : 0),
    0,
  );
  const isComplete = completedCount === questions.length;

  const chooseOption = (optionIndex: number) => {
    if (selectedOption !== null) return;
    const nextAnswers = answers.map((answer, index) => (
      index === questionIndex ? optionIndex : answer
    ));
    setAnswers(nextAnswers);
    if (nextAnswers.every((answer) => answer !== null)) {
      const nextCorrectCount = nextAnswers.reduce<number>(
        (total, answer, index) => total + (answer === questions[index].correctOptionIndex ? 1 : 0),
        0,
      );
      onComplete(nextCorrectCount, questions.length);
    }
  };

  const restart = () => {
    setAnswers(questions.map(() => null));
    setQuestionIndex(0);
  };

  return (
    <div className="quiz-area" role="tabpanel">
      <div className="quiz-topline">
        <p className="study-progress">题目 {questionIndex + 1} / {questions.length}</p>
        <span>已完成 {completedCount} 题</span>
      </div>
      <article className="quiz-card">
        <h3>{question.question}</h3>
        <div className="quiz-options">
          {question.options.map((option, optionIndex) => {
            const wasChosen = selectedOption === optionIndex;
            const isCorrect = selectedOption !== null && optionIndex === question.correctOptionIndex;
            const className = isCorrect ? "is-correct" : wasChosen ? "is-wrong" : "";
            return (
              <button
                type="button"
                className={className}
                key={option}
                onClick={() => chooseOption(optionIndex)}
                disabled={selectedOption !== null}
              >
                <span>{String.fromCharCode(65 + optionIndex)}</span>{option}
              </button>
            );
          })}
        </div>
        {selectedOption !== null ? (
          <div className={`quiz-feedback ${selectedOption === question.correctOptionIndex ? "is-correct" : "is-wrong"}`} role="status">
            <strong>{selectedOption === question.correctOptionIndex ? "回答正确" : "这次没有答对"}</strong>
            <p>{question.explanation}</p>
            <small>依据：第{question.sourcePages.join("、")}页</small>
          </div>
        ) : null}
      </article>
      <div className="study-navigation quiz-navigation">
        <button type="button" onClick={() => setQuestionIndex((current) => current - 1)} disabled={questionIndex === 0}>← 上一题</button>
        {questionIndex < questions.length - 1 ? (
          <button type="button" onClick={() => setQuestionIndex((current) => current + 1)} disabled={selectedOption === null}>下一题 →</button>
        ) : null}
      </div>
      {isComplete ? (
        <div className="quiz-result" aria-live="polite">
          <span>YOUR SCORE</span>
          <strong>{correctCount} / {questions.length}</strong>
          <p>{correctCount === questions.length ? "全部答对。你已经掌握了这组重点。" : "错题已经暴露了下一轮应该重点复习的内容。"}</p>
          <button type="button" onClick={restart}>重新测试</button>
        </div>
      ) : null}
    </div>
  );
}

function formatStudyDate(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}
