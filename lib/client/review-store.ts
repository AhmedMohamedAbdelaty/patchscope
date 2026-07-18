export interface ReviewRecord {
  documentId: string;
  viewedFileIds: string[];
  selectedFileId?: string;
  updatedAt: string;
}

const DATABASE = "patchscope";
const VERSION = 1;
const STORE = "reviews";

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
  await request(
    database.transaction(STORE, "readwrite").objectStore(STORE).put(record),
  );
}

export async function deleteReview(documentId: string): Promise<void> {
  const database = await openDatabase();
  await request(
    database.transaction(STORE, "readwrite").objectStore(STORE).delete(
      documentId,
    ),
  );
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const opening = indexedDB.open(DATABASE, VERSION);
    opening.onupgradeneeded = () => {
      if (!opening.result.objectStoreNames.contains(STORE)) {
        opening.result.createObjectStore(STORE, { keyPath: "documentId" });
      }
    };
    opening.onsuccess = () => resolve(opening.result);
    opening.onerror = () =>
      reject(opening.error ?? new Error("Review storage could not be opened."));
  });
}

function request<T = undefined>(operation: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    operation.onsuccess = () => resolve(operation.result);
    operation.onerror = () =>
      reject(operation.error ?? new Error("Review storage operation failed."));
  });
}
