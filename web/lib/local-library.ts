import type { Course, CourseDocument, SummaryResult } from "./types";
import type { TextPage } from "./herbert";

const DATABASE_NAME = "herbert-learning-library";
const DATABASE_VERSION = 1;
const COURSE_STORE = "courses";
const DOCUMENT_STORE = "documents";

interface StoredCourse {
  id: string;
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

export async function listLocalCourses(): Promise<Course[]> {
  const database = await openDatabase();
  const courses = await requestResult<StoredCourse[]>(
    database.transaction(COURSE_STORE, "readonly").objectStore(COURSE_STORE).getAll(),
  );
  const counts = await documentCounts(database, courses.map((course) => course.id));
  database.close();
  return courses
    .map((course) => ({ ...course, documentCount: counts.get(course.id) ?? 0 }))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function createLocalCourse(input: { title: string; description: string }): Promise<Course> {
  const title = input.title.trim();
  const description = input.description.trim();
  if (!title || title.length > 80 || description.length > 240) {
    throw new LocalLibraryError("课程名称或说明不符合要求，请检查后重试。");
  }
  const timestamp = new Date().toISOString();
  const course: Course = {
    id: crypto.randomUUID(),
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

export async function deleteLocalCourse(courseId: string): Promise<void> {
  const database = await openDatabase();
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

export async function listLocalDocuments(courseId: string): Promise<CourseDocument[]> {
  const database = await openDatabase();
  const documents = await requestResult<CourseDocument[]>(
    database.transaction(DOCUMENT_STORE, "readonly")
      .objectStore(DOCUMENT_STORE)
      .index("courseId")
      .getAll(IDBKeyRange.only(courseId)),
  );
  database.close();
  return documents.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function getLocalDocument(documentId: string): Promise<CourseDocument | null> {
  const database = await openDatabase();
  const document = await requestResult<CourseDocument | undefined>(
    database.transaction(DOCUMENT_STORE, "readonly").objectStore(DOCUMENT_STORE).get(documentId),
  );
  database.close();
  return document ?? null;
}

export async function createPendingDocument(input: {
  courseId: string;
  fileName: string;
  fileSize: number;
  pages: TextPage[];
  model: string;
}): Promise<CourseDocument> {
  const timestamp = new Date().toISOString();
  const document: CourseDocument = {
    id: crypto.randomUUID(),
    courseId: input.courseId,
    fileName: input.fileName,
    fileSize: input.fileSize,
    pageCount: input.pages.length,
    pages: input.pages,
    summary: null,
    summaryMeta: null,
    model: input.model,
    status: "pending",
    errorMessage: "",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  await putDocument(document);
  return document;
}

export async function completeLocalDocument(
  documentId: string,
  result: SummaryResult,
): Promise<CourseDocument> {
  const document = await requireDocument(documentId);
  const completed: CourseDocument = {
    ...document,
    summary: result.summary,
    summaryMeta: result.meta,
    status: "complete",
    errorMessage: "",
    updatedAt: new Date().toISOString(),
  };
  await putDocument(completed);
  return completed;
}

export async function markLocalDocumentFailed(documentId: string, message: string): Promise<void> {
  const document = await requireDocument(documentId);
  await putDocument({
    ...document,
    status: "failed",
    errorMessage: message.slice(0, 500),
    updatedAt: new Date().toISOString(),
  });
}

export async function markLocalDocumentPending(documentId: string): Promise<CourseDocument> {
  const document = await requireDocument(documentId);
  const pending = {
    ...document,
    status: "pending" as const,
    errorMessage: "",
    updatedAt: new Date().toISOString(),
  };
  await putDocument(pending);
  return pending;
}

export async function deleteLocalDocument(documentId: string): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(DOCUMENT_STORE, "readwrite");
  transaction.objectStore(DOCUMENT_STORE).delete(documentId);
  await transactionComplete(transaction);
  database.close();
}

async function requireDocument(documentId: string): Promise<CourseDocument> {
  const document = await getLocalDocument(documentId);
  if (!document) throw new LocalLibraryError("没有找到这份本地文档记录。");
  return document;
}

async function putDocument(document: CourseDocument): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction([COURSE_STORE, DOCUMENT_STORE], "readwrite");
  transaction.objectStore(DOCUMENT_STORE).put(document);
  const courseStore = transaction.objectStore(COURSE_STORE);
  const courseRequest = courseStore.get(document.courseId);
  courseRequest.onsuccess = () => {
    const course = courseRequest.result as StoredCourse | undefined;
    if (course) courseStore.put({ ...course, updatedAt: document.updatedAt });
  };
  await transactionComplete(transaction);
  database.close();
}

async function documentCounts(database: IDBDatabase, courseIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (!courseIds.length) return counts;
  const transaction = database.transaction(DOCUMENT_STORE, "readonly");
  const completion = transactionComplete(transaction);
  const index = transaction.objectStore(DOCUMENT_STORE).index("courseId");
  await Promise.all(courseIds.map(async (courseId) => {
    counts.set(courseId, await requestResult<number>(index.count(IDBKeyRange.only(courseId))));
  }));
  await completion;
  return counts;
}

function stripDocumentCount(course: Course): StoredCourse {
  return {
    id: course.id,
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
      if (!database.objectStoreNames.contains(COURSE_STORE)) {
        database.createObjectStore(COURSE_STORE, { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains(DOCUMENT_STORE)) {
        const documentStore = database.createObjectStore(DOCUMENT_STORE, { keyPath: "id" });
        documentStore.createIndex("courseId", "courseId", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new LocalLibraryError());
    request.onblocked = () => reject(new LocalLibraryError("本地学习记录正在被另一个页面占用，请关闭其他 Herbert 页面后重试。"));
  });
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
