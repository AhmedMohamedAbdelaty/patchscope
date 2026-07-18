import type { ReviewFinding } from "../review/notebook.ts";

export interface ReviewRecord {
  documentId: string;
  viewedFileIds: string[];
  selectedFileId?: string;
  findings?: ReviewFinding[];
  updatedAt: string;
}

const DATABASE = "patchscope";
const VERSION = 1;
const STORE = "reviews";
let databasePromise: Promise<IDBDatabase> | undefined;

export async function loadReview(
  documentId: string,
): Promise<ReviewRecord | undefined> {
  const database = await openDatabase();
  return await request<ReviewRecord | undefined>(
    database.transaction(STORE).objectStore(STORE).get(documentId),
  );
}

export async function saveReview(record: ReviewRecord): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(STORE, "readwrite");
  transaction.objectStore(STORE).put(record);
  await completed(transaction);
}

export async function deleteReview(documentId: string): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(STORE, "readwrite");
  transaction.objectStore(STORE).delete(documentId);
  await completed(transaction);
}

function openDatabase(): Promise<IDBDatabase> {
  databasePromise ??= new Promise((resolve, reject) => {
    const opening = indexedDB.open(DATABASE, VERSION);
    opening.onupgradeneeded = () => {
      if (!opening.result.objectStoreNames.contains(STORE)) {
        opening.result.createObjectStore(STORE, { keyPath: "documentId" });
      }
    };
    opening.onsuccess = () => {
      opening.result.onversionchange = () => {
        opening.result.close();
        databasePromise = undefined;
      };
      resolve(opening.result);
    };
    opening.onerror = () => {
      databasePromise = undefined;
      reject(opening.error ?? new Error("Review storage could not be opened."));
    };
  });
  return databasePromise;
}

function request<T = undefined>(operation: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    operation.onsuccess = () => resolve(operation.result);
    operation.onerror = () =>
      reject(operation.error ?? new Error("Review storage operation failed."));
  });
}

function completed(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(
        transaction.error ?? new Error("Review storage transaction failed."),
      );
    transaction.onabort = transaction.onerror;
  });
}
