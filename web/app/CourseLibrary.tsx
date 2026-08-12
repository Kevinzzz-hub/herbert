"use client";

import { useEffect, useState } from "react";
import type { ApiErrorBody, Course, CourseListResult, CourseResult } from "@/lib/types";
import { HerbertReader } from "./HerbertReader";

type LibraryState = "loading" | "ready" | "error";

export function CourseLibrary() {
  const [state, setState] = useState<LibraryState>("loading");
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [courseToDelete, setCourseToDelete] = useState<Course | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  const loadCourses = async () => {
    setState("loading");
    setErrorMessage("");
    try {
      const response = await fetch("/api/courses", { cache: "no-store" });
      const body = await response.json() as CourseListResult | ApiErrorBody;
      if (!response.ok || "error" in body) {
        throw new Error("error" in body ? body.error.message : "课程书架暂时无法打开。");
      }
      setCourses(body.courses);
      setState("ready");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "课程书架暂时无法打开。");
      setState("error");
    }
  };

  useEffect(() => {
    let isCurrent = true;

    async function loadInitialCourses() {
      try {
        const response = await fetch("/api/courses", { cache: "no-store" });
        const body = await response.json() as CourseListResult | ApiErrorBody;
        if (!response.ok || "error" in body) {
          throw new Error("error" in body ? body.error.message : "课程书架暂时无法打开。");
        }
        if (isCurrent) {
          setCourses(body.courses);
          setState("ready");
        }
      } catch (error) {
        if (isCurrent) {
          setErrorMessage(error instanceof Error ? error.message : "课程书架暂时无法打开。");
          setState("error");
        }
      }
    }

    void loadInitialCourses();
    return () => {
      isCurrent = false;
    };
  }, []);

  if (selectedCourse) {
    return (
      <HerbertReader
        courseName={selectedCourse.title}
        onBackToCourses={() => setSelectedCourse(null)}
      />
    );
  }

  return (
    <main className="library-shell">
      <LibraryHeader />
      <section className="library-page">
        <div className="library-intro">
          <div>
            <p className="eyebrow">YOUR STUDY LIBRARY</p>
            <h1>把每门课，<br /><em>放进自己的书架。</em></h1>
            <p>课程会把同一主题的 PDF、总结和复习材料组织在一起。现在先建立书架，下一步再把文档真正保存进课程。</p>
          </div>
          <button className="primary-button library-create-button" type="button" onClick={() => setIsCreating(true)}>
            新建课程 <span aria-hidden="true">＋</span>
          </button>
        </div>

        {isCreating ? (
          <CourseForm
            onCancel={() => setIsCreating(false)}
            onCreated={(course) => {
              setCourses((current) => [course, ...current]);
              setIsCreating(false);
            }}
          />
        ) : null}

        {state === "loading" ? <LibraryLoading /> : null}
        {state === "error" ? (
          <div className="library-message" role="alert">
            <span>!</span><h2>课程书架暂时打不开</h2><p>{errorMessage}</p>
            <button type="button" onClick={() => void loadCourses()}>重新尝试</button>
          </div>
        ) : null}
        {state === "ready" && courses.length === 0 && !isCreating ? (
          <div className="library-message empty-library">
            <span aria-hidden="true">01</span><h2>从第一门课程开始</h2>
            <p>例如：Software Engineering、人工智能导论，或任何你正在系统学习的主题。</p>
            <button type="button" onClick={() => setIsCreating(true)}>创建第一门课程</button>
          </div>
        ) : null}
        {state === "ready" && courses.length > 0 ? (
          <section className="course-collection" aria-labelledby="course-list-title">
            <div className="collection-heading">
              <h2 id="course-list-title">我的课程</h2><span>{courses.length} 门</span>
            </div>
            <div className="course-grid">
              {courses.map((course, index) => (
                <article className="course-card" key={course.id}>
                  <div className="course-card-number">{String(index + 1).padStart(2, "0")}</div>
                  <p>COURSE</p>
                  <h3>{course.title}</h3>
                  <div className="course-description">{course.description || "还没有课程说明。进入后可以开始阅读第一份 PDF。"}</div>
                  <div className="course-card-meta"><span>等待添加 PDF</span><span>云端保存</span></div>
                  <div className="course-card-actions">
                    <button className="open-course" type="button" onClick={() => setSelectedCourse(course)}>进入课程 <span>→</span></button>
                    <button className="delete-course" type="button" onClick={() => setCourseToDelete(course)} aria-label={`删除课程 ${course.title}`}>删除</button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}
      </section>
      <footer className="site-footer"><span>HERBERT · V0.4</span><p>One shelf for every course.</p></footer>
      {courseToDelete ? (
        <DeleteCourseDialog
          course={courseToDelete}
          onCancel={() => setCourseToDelete(null)}
          onDeleted={(courseId) => {
            setCourses((current) => current.filter((course) => course.id !== courseId));
            setCourseToDelete(null);
          }}
        />
      ) : null}
    </main>
  );
}

function LibraryHeader() {
  return (
    <header className="site-header library-header">
      <div className="brand" aria-label="Herbert 课程书架">
        <span className="brand-mark" aria-hidden="true"><span /></span>
        <span className="brand-copy"><strong>HERBERT</strong><small>COURSE READING LIBRARY</small></span>
      </div>
      <span className="privacy-note"><i aria-hidden="true" />课程已保存在你的私人工作区</span>
    </header>
  );
}

function CourseForm({ onCancel, onCreated }: { onCancel: () => void; onCreated: (course: Course) => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const createCourse = async () => {
    if (!title.trim() || isSaving) return;
    setIsSaving(true);
    setErrorMessage("");
    try {
      const response = await fetch("/api/courses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description }),
      });
      const body = await response.json() as CourseResult | ApiErrorBody;
      if (!response.ok || "error" in body) {
        throw new Error("error" in body ? body.error.message : "课程暂时无法创建。");
      }
      onCreated(body.course);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "课程暂时无法创建。");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form className="course-form" onSubmit={(event) => { event.preventDefault(); void createCourse(); }}>
      <div className="course-form-heading"><span>NEW COURSE</span><h2>建立一门课程</h2><p>先写课程名称即可，说明可以留空。</p></div>
      <label>课程名称<input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} maxLength={80} placeholder="例如：Software Engineering" /></label>
      <label>课程说明（可选）<textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={240} rows={3} placeholder="这门课主要学习什么？" /></label>
      <div className="course-form-footer">
        <span>{description.length}/240</span>
        <button type="button" onClick={onCancel} disabled={isSaving}>取消</button>
        <button className="save-course" type="submit" disabled={!title.trim() || isSaving}>{isSaving ? "正在保存" : "创建课程"}</button>
      </div>
      {errorMessage ? <p className="course-form-error" role="alert">{errorMessage}</p> : null}
    </form>
  );
}

function DeleteCourseDialog({ course, onCancel, onDeleted }: { course: Course; onCancel: () => void; onDeleted: (id: string) => void }) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const remove = async () => {
    setIsDeleting(true);
    setErrorMessage("");
    try {
      const response = await fetch(`/api/courses/${course.id}`, { method: "DELETE" });
      if (!response.ok) {
        const body = await response.json() as ApiErrorBody;
        throw new Error(body.error.message);
      }
      onDeleted(course.id);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "课程暂时无法删除。");
      setIsDeleting(false);
    }
  };

  return (
    <div className="dialog-backdrop" role="presentation">
      <div className="delete-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-course-title">
        <p>REMOVE COURSE</p><h2 id="delete-course-title">删除“{course.title}”？</h2>
        <div>当前版本还没有把 PDF 存进课程，因此这次只会删除课程书架中的记录。</div>
        {errorMessage ? <span role="alert">{errorMessage}</span> : null}
        <footer><button type="button" onClick={onCancel} disabled={isDeleting}>保留课程</button><button className="confirm-delete" type="button" onClick={() => void remove()} disabled={isDeleting}>{isDeleting ? "正在删除" : "确认删除"}</button></footer>
      </div>
    </div>
  );
}

function LibraryLoading() {
  return <div className="library-loading" role="status"><i /><div><strong>正在打开你的课程书架</strong><span>Herbert 正在连接私人工作区</span></div></div>;
}
