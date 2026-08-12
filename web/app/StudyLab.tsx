"use client";

import { useState } from "react";
import type { TextPage } from "@/lib/herbert";
import type {
  ApiErrorBody,
  DocumentSummary,
  StudyPack,
  StudyPackResult,
} from "@/lib/types";

type StudyMode = "cards" | "quiz";

export function StudyLab({
  fileName,
  pages,
  summary,
}: {
  fileName: string;
  pages: TextPage[];
  summary: DocumentSummary;
}) {
  const [studyPack, setStudyPack] = useState<StudyPack | null>(null);
  const [consideredPages, setConsideredPages] = useState<number[]>([]);
  const [mode, setMode] = useState<StudyMode>("cards");
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const generate = async () => {
    if (isGenerating) return;
    setIsGenerating(true);
    setErrorMessage("");
    try {
      const response = await fetch("/api/study", {
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
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Herbert 暂时无法生成学习材料。");
    } finally {
      setIsGenerating(false);
    }
  };

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
            <small>相关页文字和当前总结会发送给 DeepSeek；生成结果目前只保留在本次页面中。</small>
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
          {mode === "cards" ? (
            <FlashcardDeck cards={studyPack.cards} />
          ) : (
            <Quiz questions={studyPack.quiz} />
          )}
        </div>
      )}
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

function Quiz({ questions }: { questions: StudyPack["quiz"] }) {
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
    setAnswers((current) => current.map((answer, index) => (
      index === questionIndex ? optionIndex : answer
    )));
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
