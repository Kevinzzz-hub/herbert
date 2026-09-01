"use client";

import { useEffect, useRef, useState } from "react";
import {
  claimLegacyLocalRecords,
  createLocalCourse,
  createLocalCourseBackup,
  deleteLocalCourse,
  importLocalCourseBackup,
  listLocalCourses,
} from "@/lib/local-library";
import {
  courseBackupFileName,
  MAX_COURSE_BACKUP_BYTES,
  parseCourseBackup,
  serializeCourseBackup,
} from "@/lib/course-backup";
import type { Course } from "@/lib/types";
import { HERBERT_VERSION } from "@/lib/version";
import { HerbertReader } from "./HerbertReader";

type LibraryState = "loading" | "ready" | "error";

export function CourseLibrary({
  ownerId,
  accountEmail,
  keyHint,
  aiModelLabel,
  onManageKey,
  onSignOut,
}: {
  ownerId: string;
  accountEmail: string;
  keyHint: string;
  aiModelLabel: string;
  onManageKey: () => void;
  onSignOut: () => void;
}) {
  const importInputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<LibraryState>("loading");
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [courseToDelete, setCourseToDelete] = useState<Course | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [backupMessage, setBackupMessage] = useState("");
  const [backupError, setBackupError] = useState("");
  const [busyCourseId, setBusyCourseId] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const totalDocuments = courses.reduce((total, course) => total + course.documentCount, 0);

  const loadCourses = async () => {
    setState("loading");
    setErrorMessage("");
    try {
      setCourses(await listLocalCourses(ownerId));
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
        await claimLegacyLocalRecords(ownerId);
        const localCourses = await listLocalCourses(ownerId);
        if (isCurrent) {
          setCourses(localCourses);
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
  }, [ownerId]);

  const exportCourse = async (course: Course) => {
    if (busyCourseId) return;
    setBusyCourseId(course.id);
    setBackupMessage("");
    setBackupError("");
    try {
      const backup = await createLocalCourseBackup(ownerId, course.id);
      const url = URL.createObjectURL(new Blob([serializeCourseBackup(backup)], { type: "application/json;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = courseBackupFileName(course.title);
      link.click();
      URL.revokeObjectURL(url);
      setBackupMessage(`“${course.title}”已经导出。请妥善保存下载的备份文件。`);
    } catch (error) {
      setBackupError(error instanceof Error ? error.message : "课程暂时无法导出。");
    } finally {
      setBusyCourseId(null);
    }
  };

  const importCourse = async (file: File | undefined) => {
    if (!file || isImporting) return;
    setIsImporting(true);
    setBackupMessage("");
    setBackupError("");
    try {
      if (file.size > MAX_COURSE_BACKUP_BYTES) throw new Error("备份文件超过 25 MB，当前版本暂时无法导入。");
      const backup = parseCourseBackup(await file.text());
      const course = await importLocalCourseBackup(ownerId, backup);
      setCourses((current) => [course, ...current]);
      setState("ready");
      setBackupMessage(`已导入“${course.title}”，包含 ${course.documentCount} 份 PDF 记录。`);
    } catch (error) {
      setBackupError(error instanceof Error ? error.message : "课程备份暂时无法导入。");
    } finally {
      setIsImporting(false);
    }
  };

  if (selectedCourse) {
    return (
      <HerbertReader
        courseId={selectedCourse.id}
        courseName={selectedCourse.title}
        ownerId={ownerId}
        aiModelLabel={aiModelLabel}
        onBackToCourses={() => {
          setSelectedCourse(null);
          void loadCourses();
        }}
      />
    );
  }

  return (
    <main className="library-shell">
      <LibraryHeader accountEmail={accountEmail} keyHint={keyHint} onManageKey={onManageKey} onSignOut={onSignOut} />
      <section className="library-page">
        <div className="library-intro">
          <div>
            <p className="eyebrow">YOUR STUDY LIBRARY</p>
            <h1>把每门课，<br /><em>放进自己的书架。</em></h1>
            <p>课程会把同一主题的 PDF、总结和复习材料组织在一起。学习记录保存在当前浏览器，并按登录账号隔离。</p>
          </div>
          <div className="library-primary-actions">
            <button className="library-import-button" type="button" onClick={() => importInputRef.current?.click()} disabled={isImporting}>
              {isImporting ? "正在导入" : "导入课程备份"}
            </button>
            <button className="primary-button library-create-button" type="button" onClick={() => setIsCreating(true)}>
              新建课程 <span aria-hidden="true">＋</span>
            </button>
          </div>
          <input
            ref={importInputRef}
            className="visually-hidden"
            type="file"
            accept="application/json,.json"
            aria-label="选择 Herbert 课程备份文件"
            onChange={(event) => {
              const selectedFile = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              void importCourse(selectedFile);
            }}
          />
        </div>

        {backupMessage ? <p className="backup-notice" role="status">{backupMessage}</p> : null}
        {backupError ? <p className="backup-notice is-error" role="alert">{backupError}</p> : null}

        {state === "ready" && totalDocuments === 0 ? (
          <OnboardingGuide
            hasCourse={courses.length > 0}
            onContinue={() => {
              if (courses[0]) setSelectedCourse(courses[0]);
              else setIsCreating(true);
            }}
          />
        ) : null}

        {isCreating ? (
          <CourseForm
            ownerId={ownerId}
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
                  <div className="course-card-meta"><span>{course.documentCount} 份 PDF</span><span>本机保存</span></div>
                  <div className="course-card-actions">
                    <button className="open-course" type="button" onClick={() => setSelectedCourse(course)} disabled={busyCourseId === course.id}>进入课程 <span>→</span></button>
                    <div className="course-card-secondary-actions">
                      <button className="export-course" type="button" onClick={() => void exportCourse(course)} disabled={busyCourseId !== null} aria-label={`导出课程 ${course.title}`}>
                        {busyCourseId === course.id ? "导出中" : "备份"}
                      </button>
                      <button className="delete-course" type="button" onClick={() => setCourseToDelete(course)} disabled={busyCourseId === course.id} aria-label={`删除课程 ${course.title}`}>删除</button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}
      </section>
      <footer className="site-footer account-footer">
        <span>HERBERT · {HERBERT_VERSION}</span>
        <nav aria-label="Herbert 帮助链接">
          <a href="/privacy">隐私与数据</a>
          <a href="https://github.com/Kevinzzz-hub/herbert/issues/new" target="_blank" rel="noreferrer">反馈问题</a>
        </nav>
      </footer>
      {courseToDelete ? (
        <DeleteCourseDialog
          ownerId={ownerId}
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

function LibraryHeader({
  accountEmail,
  keyHint,
  onManageKey,
  onSignOut,
}: {
  accountEmail: string;
  keyHint: string;
  onManageKey: () => void;
  onSignOut: () => void;
}) {
  return (
    <header className="site-header library-header">
      <div className="brand" aria-label="Herbert 课程书架">
        <span className="brand-mark" aria-hidden="true"><span /></span>
        <span className="brand-copy"><strong>HERBERT</strong><small>COURSE READING LIBRARY</small></span>
      </div>
      <div className="library-header-actions">
        <nav className="library-product-links" aria-label="产品信息">
          <a href="/privacy">隐私</a>
          <a href="https://github.com/Kevinzzz-hub/herbert/issues/new" target="_blank" rel="noreferrer">反馈</a>
        </nav>
        <div className="library-account-actions">
          <div><span>{accountEmail}</span><strong>{keyHint}</strong></div>
          <button type="button" onClick={onManageKey}>管理 AI</button>
          <button type="button" onClick={onSignOut}>退出</button>
        </div>
      </div>
    </header>
  );
}

function OnboardingGuide({ hasCourse, onContinue }: { hasCourse: boolean; onContinue: () => void }) {
  return (
    <section className="onboarding-guide" aria-labelledby="onboarding-title">
      <div className="onboarding-heading">
        <p>FIRST STUDY SESSION</p>
        <h2 id="onboarding-title">第一次使用，只需要三步</h2>
        <span>{hasCourse ? "2 / 3" : "1 / 3"}</span>
      </div>
      <ol>
        <li className="is-complete"><span>01</span><div><strong>连接自己的 AI</strong><p>AI 服务和 API Key 已经安全连接。</p></div><i aria-hidden="true">✓</i></li>
        <li className={hasCourse ? "is-complete" : ""}><span>02</span><div><strong>建立一门课程</strong><p>把同一主题的资料放进一个学习空间。</p></div><i aria-hidden="true">{hasCourse ? "✓" : "→"}</i></li>
        <li><span>03</span><div><strong>加入第一份 PDF</strong><p>支持可复制文字、最多 12 MB、120 页的 PDF。</p></div><i aria-hidden="true">→</i></li>
      </ol>
      <div className="onboarding-action">
        <p>原始 PDF 不会上传保存；AI 处理规则可在“隐私与数据”中查看。</p>
        <button type="button" onClick={onContinue}>{hasCourse ? "进入课程并上传 PDF" : "创建第一门课程"}<span>→</span></button>
      </div>
    </section>
  );
}

function CourseForm({ ownerId, onCancel, onCreated }: { ownerId: string; onCancel: () => void; onCreated: (course: Course) => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const createCourse = async () => {
    if (!title.trim() || isSaving) return;
    setIsSaving(true);
    setErrorMessage("");
    try {
      onCreated(await createLocalCourse({ ownerId, title, description }));
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

function DeleteCourseDialog({ ownerId, course, onCancel, onDeleted }: { ownerId: string; course: Course; onCancel: () => void; onDeleted: (id: string) => void }) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const remove = async () => {
    setIsDeleting(true);
    setErrorMessage("");
    try {
      await deleteLocalCourse(ownerId, course.id);
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
        <div>课程中的文档记录、提取文字和总结也会从这个浏览器中删除。原始 PDF 从未被保存。</div>
        {errorMessage ? <span role="alert">{errorMessage}</span> : null}
        <footer><button type="button" onClick={onCancel} disabled={isDeleting}>保留课程</button><button className="confirm-delete" type="button" onClick={() => void remove()} disabled={isDeleting}>{isDeleting ? "正在删除" : "确认删除"}</button></footer>
      </div>
    </div>
  );
}

function LibraryLoading() {
  return <div className="library-loading" role="status"><i /><div><strong>正在打开你的课程书架</strong><span>Herbert 正在读取本机学习记录</span></div></div>;
}
