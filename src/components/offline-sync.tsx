"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CloudOff, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { listDrafts, markDraftError, onQueueChange, removeDraft } from "@/lib/offline/diary-queue";
import { saveDiaryEntry } from "@/app/(app)/diary/actions";
import { useOnline } from "@/hooks/use-geolocation";

/**
 * Syncs offline diary drafts when the device is back online. A draft is only removed from
 * the device after the server confirms it was saved.
 */
export function OfflineSync({ userId }: { userId: string }) {
  const router = useRouter();
  const online = useOnline();
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const busy = useRef(false);

  const refresh = useCallback(async () => setPending((await listDrafts(userId)).length), [userId]);

  const sync = useCallback(async () => {
    if (busy.current || !navigator.onLine) return;
    const drafts = await listDrafts(userId);
    if (!drafts.length) return;
    busy.current = true;
    setSyncing(true);
    let synced = 0;
    for (const d of drafts) {
      try {
        const res = await saveDiaryEntry(d.input);
        if (res.ok) {
          await removeDraft(d.clientId);
          synced++;
        } else {
          await markDraftError(d, res.error);
        }
      } catch {
        break; // network dropped again; keep the rest queued
      }
    }
    busy.current = false;
    setSyncing(false);
    await refresh();
    if (synced) {
      toast.success(`${synced} offline diary ${synced === 1 ? "entry" : "entries"} synced`);
      router.refresh();
    }
  }, [userId, refresh, router]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial read of the local queue
    void refresh();
    return onQueueChange(() => void refresh());
  }, [refresh]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reacting to the browser coming back online
    if (online) void sync();
  }, [online, sync]);

  if (!pending) return null;
  return (
    <div className="fixed inset-x-0 bottom-20 z-40 mx-auto flex w-fit items-center gap-2 rounded-full border border-border bg-popover px-3.5 py-2 text-[12.5px] shadow-pop lg:bottom-6">
      {syncing ? <Loader2 className="size-3.5 animate-spin text-primary" /> : <CloudOff className="size-3.5 text-warning" />}
      <span>
        {pending} diary {pending === 1 ? "draft" : "drafts"} saved on this device{online ? "" : ", waiting for a connection"}
      </span>
      {online && !syncing ? (
        <button onClick={() => void sync()} className="inline-flex items-center gap-1 font-medium text-primary">
          <RefreshCw className="size-3" /> Sync
        </button>
      ) : null}
    </div>
  );
}
