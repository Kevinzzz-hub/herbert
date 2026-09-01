import type { Course, CourseDocument, StudyPackResult, SummaryResult } from "./types";
import type { TextPage } from "./herbert";
import { createCourseBackup, type CourseBackupV1 } from "./course-backup";

const DATABASE_NAME = "herbert-learning-library";
const DATABASE_VERSION = 2;
const COURSE_STORE = "courses";
const DOCUMENT_STORE = "documents";
const OWNER_INDEX = "ownerId";
const OWNER_COURSE_INDEX = "ownerCourse";

interface StoredCourse {
  id: string;
  ownerId: string;
  title: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export class LocalLibraryError extends Error {
  constructor(message = "浏览器无法打开本地学习记录，请检查是否处于隐私浏览模式。") {
    super(message);
    this.name = "LocalLibraryError";
  }
}

export async function claimLegacyLocalRecords(ownerId: string): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction([COURSE_STORE, DOCUMENT_STORE], "readwrite");
  claimUnownedRecords(transaction.objectStore(COURSE_STORE), ownerId);
  claimUnownedRecords(transaction.objectStore(DOCUMENT_STORE), ownerId);
  await transactionComplete(transaction);
  database.close();
}

export async function listLocalCourses(ownerId: string): Promise<Course[]> {
  const database = await openDatabase();
  const courses = await requestResult<StoredCourse[]>(
    database.transaction(COURSE_STORE, "readonly")
      .objectStore(COURSE_STORE)
      .index(OWNER_INDEX)
      .getAll(IDBKeyRange.only(ownerId)),
  );
  const counts = await documentCounts(database, ownerId, courses.map((course) => course.id));
  database.close();
  return courses
    .map((course) => ({ ...course, documentCount: counts.get(course.id) ?? 0 }))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function createLocalCourseBackup(ownerId: string, courseId: string): Promise<CourseBackupV1> {
  const database = await openDatabase();
  const transaction = database.transaction([COURSE_STORE, DOCUMENT_STORE], "readonly");
  const completion = transactionComplete(transaction);
  const [course, documents] = await Promise.all([
    requestResult<StoredCourse | undefined>(transaction.objectStore(COURSE_STORE).get(courseId)),
    requestResult<CourseDocument[]>(
      transaction.objectStore(DOCUMENT_STORE).index(OWNER_COURSE_INDEX).getAll(IDBKeyRange.only([ownerId, courseId])),
    ),
  ]);
  await completion;
  database.close();
  if (!course || course.ownerId !== ownerId) throw new LocalLibraryError("没有找到需要备份的课程。");
  return createCourseBackup({ ...course, documentCount: documents.length }, documents);
}

export async function importLocalCourseBackup(ownerId: string, backup: CourseBackupV1): Promise<Course> {
  const timestamp = new Date().toISOString();
  const course: Course = {
    id: crypto.randomUUID(),
    ownerId,
    title: backup.course.title,
    description: backup.course.description,
    documentCount: backup.documents.length,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const documents: CourseDocument[] = backup.documents.map((document) => ({
    ...document,
    id: crypto.randomUUID(),
    ownerId,
    courseId: course.id,
    studyRecord: document.studyRecord ?? null,
  }));
  const database = await openDatabase();
  const transaction = database.transaction([COURSE_STORE, DOCUMENT_STORE], "readwrite");
  transaction.objectStore(COURSE_STORE).put(stripDocumentCount(course));
  const documentStore = transaction.objectStore(DOCUMENT_STORE);
  documents.forEach((document) => documentStore.put(document));
  await transactionComplete(transaction);
  database.close();
  return course;
}

export async function createLocalCourse(input: { ownerId: string; title: string; description: string }): Promise<Course> {
  const title = input.title.trim();
  const description = input.description.trim();
  if (!title || title.length > 80 || description.length > 240) {
    throw new LocalLibraryError("课程名称或说明不符合要求，请检查后重试。");
  }
  const timestamp = new Date().toISOString();
  const course: Course = {
    id: crypto.randomUUID(),
    ownerId: input.ownerId,
    title,
    description,
    documentCount: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const database = await openDatabase();
  const transaction = database.transaction(COURSE_STORE, "readwrite");
  transaction.objectStore(COURSE_STORE).put(stripDocumentCount(course));
  await transactionComplete(transaction);
  database.close();
  return course;
}

export async function deleteLocalCourse(ownerId: string, courseId: string): Promise<void> {
  const database = await openDatabase();
  const course = await requestResult<StoredCourse | undefined>(
    database.transaction(COURSE_STORE, "readonly").objectStore(COURSE_STORE).get(courseId),
  );
  if (!course || course.ownerId !== ownerId) {
    database.close();
    throw new LocalLibraryError("没有找到这门课程。");
  }
  const transaction = database.transaction([COURSE_STORE, DOCUMENT_STORE], "readwrite");
  transaction.objectStore(COURSE_STORE).delete(courseId);
  const documentStore = transaction.objectStore(DOCUMENT_STORE);
  const cursorRequest = documentStore.index("courseId").openKeyCursor(IDBKeyRange.only(courseId));
  cursorRequest.onsuccess = () => {
    const cursor = cursorRequest.result;
    if (!cursor) return;
    documentStore.delete(cursor.primaryKey);
    cursor.continue();
  };
  await transactionComplete(transaction);
  database.close();
}

export async function listLocalDocuments(ownerId: string, courseId: string): Promise<CourseDocument[]> {
  const database = await openDatabase();
  const documents = await requestResult<CourseDocument[]>(
    database.transaction(DOCUMENT_STORE, "readonly")
      .objectStore(DOCUMENT_STORE)
      .index(OWNER_COURSE_INDEX)
      .getAll(IDBKeyRange.only([ownerId, courseId])),
  );
  database.close();
  return documents.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function getLocalDocument(ownerId: string, documentId: string): Promise<CourseDocument | null> {
  const database = await openDatabase();
  const document = await requestResult<CourseDocument | undefined>(
    database.transaction(DOCUMENT_STORE, "readonly").objectStore(DOCUMENT_STORE).get(documentId),
  );
  database.close();
  return document?.ownerId === ownerId ? document : null;
}

export async function createPendingDocument(input: {
  ownerId: string;
  courseId: string;
  fileName: string;
  fileSize: number;
  pages: TextPage[];
  model: string;
}): Promise<CourseDocument> {
  const timestamp = new Date().toISOString();
  const document: CourseDocument = {
    id: crypto.randomUUID(),
    ownerId: input.ownerId,
    courseId: input.courseId,
    fileName: input.fileName,
    fileSize: input.fileSize,
    pageCount: input.pages.length,
    pages: input.pages,
    summary: null,
    summaryMeta: null,
    studyRecord: null,
    model: input.model,
    status: "pending",
    errorMessage: "",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  await putDocument(input.ownerId, document);
  return document;
}

export async function completeLocalDocument(
  ownerId: string,
  documentId: string,
  result: SummaryResult,
): Promise<CourseDocument> {
  const document = await requireDocument(ownerId, documentId);
  const completed: CourseDocument = {
    ...document,
    summary: result.summary,
    summaryMeta: result.meta,
    status: "complete",
    errorMessage: "",
    updatedAt: new Date().toISOString(),
  };
  await putDocument(ownerId, completed);
  return completed;
}

export async function markLocalDocumentFailed(ownerId: string, documentId: string, message: string): Promise<void> {
  const document = await requireDocument(ownerId, documentId);
  await putDocument(ownerId, {
    ...document,
    status: "failed",
    errorMessage: message.slice(0, 500),
    updatedAt: new Date().toISOString(),
  });
}

export async function markLocalDocumentPending(ownerId: string, documentId: string): Promise<CourseDocument> {
  const document = await requireDocument(ownerId, documentId);
  const pending = {
    ...document,
    status: "pending" as const,
    errorMessage: "",
    updatedAt: new Date().toISOString(),
  };
  await putDocument(ownerId, pending);
  return pending;
}

export async function saveLocalStudyPack(
  ownerId: string,
  documentId: string,
  result: StudyPackResult,
): Promise<CourseDocument> {
  const document = await requireDocument(ownerId, documentId);
  const timestamp = new Date().toISOString();
  const updated: CourseDocument = {
    ...document,
    studyRecord: {
      studyPack: result.studyPack,
      consideredPages: result.meta.consideredPages,
      generatedAt: timestamp,
      lastStudiedAt: timestamp,
      quizAttempts: [],
    },
    updatedAt: timestamp,
  };
  await putDocument(ownerId, updated);
  return updated;
}

export async function saveLocalQuizAttempt(
  ownerId: string,
  documentId: string,
  correctCount: number,
  totalCount: number,
): Promise<CourseDocument> {
  const document = await requireDocument(ownerId, documentId);
  if (!document.studyRecord || totalCount < 1 || correctCount < 0 || correctCount > totalCount) {
    throw new LocalLibraryError("这次测验成绩无法保存，请重新打开学习材料后再试。");
  }
  const timestamp = new Date().toISOString();
  const updated: CourseDocument = {
    ...document,
    studyRecord: {
      ...document.studyRecord,
      lastStudiedAt: timestamp,
      quizAttempts: [
        ...document.studyRecord.quizAttempts,
        { correctCount, totalCount, completedAt: timestamp },
      ].slice(-20),
    },
    updatedAt: timestamp,
  };
  await putDocument(ownerId, updated);
  return updated;
}

export async function deleteLocalDocument(ownerId: string, documentId: string): Promise<void> {
  await requireDocument(ownerId, documentId);
  const database = await openDatabase();
  const transaction = database.transaction(DOCUMENT_STORE, "readwrite");
  transaction.objectStore(DOCUMENT_STORE).delete(documentId);
  await transactionComplete(transaction);
  database.close();
}

async function requireDocument(ownerId: string, documentId: string): Promise<CourseDocument> {
  const document = await getLocalDocument(ownerId, documentId);
  if (!document) throw new LocalLibraryError("没有找到这份本地文档记录。");
  return document;
}

async function putDocument(ownerId: string, document: CourseDocument): Promise<void> {
  if (document.ownerId !== ownerId) throw new LocalLibraryError("这份文档不属于当前账号。");
  const database = await openDatabase();
  const transaction = database.transaction([COURSE_STORE, DOCUMENT_STORE], "readwrite");
  transaction.objectStore(DOCUMENT_STORE).put(document);
  const courseStore = transaction.objectStore(COURSE_STORE);
  const courseRequest = courseStore.get(document.courseId);
  courseRequest.onsuccess = () => {
    const course = courseRequest.result as StoredCourse | undefined;
    if (!course || course.ownerId !== ownerId) {
      transaction.abort();
      return;
    }
    courseStore.put({ ...course, updatedAt: document.updatedAt });
  };
  await transactionComplete(transaction);
  database.close();
}

async function documentCounts(database: IDBDatabase, ownerId: string, courseIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (!courseIds.length) return counts;
  const transaction = database.transaction(DOCUMENT_STORE, "readonly");
  const completion = transactionComplete(transaction);
  const index = transaction.objectStore(DOCUMENT_STORE).index(OWNER_COURSE_INDEX);
  await Promise.all(courseIds.map(async (courseId) => {
    counts.set(courseId, await requestResult<number>(index.count(IDBKeyRange.only([ownerId, courseId]))));
  }));
  await completion;
  return counts;
}

function stripDocumentCount(course: Course): StoredCourse {
  return {
    id: course.id,
    ownerId: course.ownerId,
    title: course.title,
    description: course.description,
    createdAt: course.createdAt,
    updatedAt: course.updatedAt,
  };
}

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new LocalLibraryError());
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      const courseStore = database.objectStoreNames.contains(COURSE_STORE)
        ? request.transaction!.objectStore(COURSE_STORE)
        : database.createObjectStore(COURSE_STORE, { keyPath: "id" });
      if (!courseStore.indexNames.contains(OWNER_INDEX)) {
        courseStore.createIndex(OWNER_INDEX, "ownerId", { unique: false });
      }
      if (!database.objectStoreNames.contains(DOCUMENT_STORE)) {
        const documentStore = database.createObjectStore(DOCUMENT_STORE, { keyPath: "id" });
        documentStore.createIndex("courseId", "courseId", { unique: false });
        documentStore.createIndex(OWNER_INDEX, "ownerId", { unique: false });
        documentStore.createIndex(OWNER_COURSE_INDEX, ["ownerId", "courseId"], { unique: false });
      } else {
        const documentStore = request.transaction!.objectStore(DOCUMENT_STORE);
        if (!documentStore.indexNames.contains(OWNER_INDEX)) {
          documentStore.createIndex(OWNER_INDEX, "ownerId", { unique: false });
        }
        if (!documentStore.indexNames.contains(OWNER_COURSE_INDEX)) {
          documentStore.createIndex(OWNER_COURSE_INDEX, ["ownerId", "courseId"], { unique: false });
        }
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new LocalLibraryError());
    request.onblocked = () => reject(new LocalLibraryError("本地学习记录正在被另一个页面占用，请关闭其他 Herbert 页面后重试。"));
  });
}

function claimUnownedRecords(store: IDBObjectStore, ownerId: string): void {
  const cursorRequest = store.openCursor();
  cursorRequest.onsuccess = () => {
    const cursor = cursorRequest.result;
    if (!cursor) return;
    const value = cursor.value as { ownerId?: string };
    if (!value.ownerId) cursor.update({ ...value, ownerId });
    cursor.continue();
  };
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new LocalLibraryError());
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(new LocalLibraryError());
    transaction.onabort = () => reject(new LocalLibraryError());
  });
}
