"use client";

import { createStore, del, entries, set } from "idb-keyval";
import type { DiaryInput } from "@/app/(app)/diary/actions";

/**
 * Offline diary drafts live in IndexedDB on this device until the server confirms them.
 * Each draft carries a client_id, so syncing is idempotent: re-sending never duplicates.
 * Drafts are tagged with the user id, so a different account on the same device never syncs them.
 */
export interface QueuedDraft {
  clientId: string;
  userId: string;
  queuedAt: string;
  input: DiaryInput;
  lastError?: string;
}

const store = typeof indexedDB !== "undefined" ? createStore("apprentice-os", "diary-drafts") : undefined;
const EVENT = "aos:diary-queue";

export async function queueDraft(userId: string, input: DiaryInput): Promise<QueuedDraft> {
  const clientId = input.client_id ?? crypto.randomUUID();
  const draft: QueuedDraft = { clientId, userId, queuedAt: new Date().toISOString(), input: { ...input, client_id: clientId } };
  await set(clientId, draft, store);
  window.dispatchEvent(new Event(EVENT));
  return draft;
}

export async function listDrafts(userId: string): Promise<QueuedDraft[]> {
  if (!store) return [];
  const all = (await entries<string, QueuedDraft>(store)).map(([, v]) => v);
  return all.filter((d) => d.userId === userId).sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));
}

export async function removeDraft(clientId: string) {
  await del(clientId, store);
  window.dispatchEvent(new Event(EVENT));
}

export async function markDraftError(draft: QueuedDraft, message: string) {
  await set(draft.clientId, { ...draft, lastError: message }, store);
  window.dispatchEvent(new Event(EVENT));
}

export function onQueueChange(cb: () => void) {
  window.addEventListener(EVENT, cb);
  return () => window.removeEventListener(EVENT, cb);
}
