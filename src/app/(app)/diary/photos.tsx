"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, FileText, ImagePlus, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/overlay";
import { compressImage, uploadUserFile } from "@/lib/upload";
import { addDiaryPhoto, deleteDiaryPhoto } from "./actions";

export interface PhotoView {
  id: string;
  url: string | null;
  caption: string | null;
  mime: string;
}

export function PhotoUploader({ userId, entryId, compact }: { userId: string; entryId: string; compact?: boolean }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  async function handle(files: FileList | null) {
    if (!files?.length) return;
    const list = [...files].slice(0, 20);
    setProgress({ done: 0, total: list.length });
    let ok = 0;
    for (const [i, raw] of list.entries()) {
      try {
        const file = await compressImage(raw);
        const up = await uploadUserFile(userId, `diary/${entryId}`, file);
        const res = await addDiaryPhoto({ entryId, path: up.path, mime: up.mime, size: up.size });
        if (!res.ok) throw new Error(res.error);
        ok++;
      } catch (e) {
        toast.error(`${raw.name}: ${e instanceof Error ? e.message : "upload failed"}`);
      }
      setProgress({ done: i + 1, total: list.length });
    }
    setProgress(null);
    if (ok) {
      toast.success(`${ok} file${ok === 1 ? "" : "s"} added`);
      router.refresh();
    }
    if (inputRef.current) inputRef.current.value = "";
    if (cameraRef.current) cameraRef.current.value = "";
  }

  return (
    <div className="flex flex-wrap gap-2">
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => handle(e.target.files)} />
      <input ref={inputRef} type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={(e) => handle(e.target.files)} />
      <Button type="button" variant={compact ? "outline" : "default"} disabled={Boolean(progress)} onClick={() => cameraRef.current?.click()} className="sm:hidden">
        <Camera /> Take photo
      </Button>
      <Button type="button" variant="outline" disabled={Boolean(progress)} onClick={() => inputRef.current?.click()}>
        {progress ? <Loader2 className="animate-spin" /> : <ImagePlus />}
        {progress ? `Uploading ${progress.done}/${progress.total}…` : "Add photos or files"}
      </Button>
    </div>
  );
}

export function PhotoGrid({ photos, editable }: { photos: PhotoView[]; editable?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState<PhotoView | null>(null);
  const [busy, setBusy] = useState(false);
  if (!photos.length) return null;
  return (
    <>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {photos.map((p) =>
          p.mime === "application/pdf" ? (
            <a key={p.id} href={p.url ?? "#"} target="_blank" rel="noreferrer" className="grid aspect-square place-items-center rounded-xl border border-border bg-subtle text-center text-[12px] text-muted-foreground hover:bg-muted">
              <span>
                <FileText className="mx-auto mb-1 size-6" /> {p.caption ?? "PDF"}
              </span>
            </a>
          ) : (
            <button key={p.id} type="button" onClick={() => setOpen(p)} className="group relative aspect-square overflow-hidden rounded-xl bg-muted">
              {p.url ? (
                // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URLs; next/image would cache private files
                <img src={p.url} alt={p.caption ?? "Diary photo"} className="size-full object-cover transition-transform group-hover:scale-[1.03]" loading="lazy" />
              ) : null}
            </button>
          ),
        )}
      </div>
      <Dialog open={Boolean(open)} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent title={open?.caption ?? "Photo"} className="sm:max-w-3xl">
          {open?.url ? (
            // eslint-disable-next-line @next/next/no-img-element -- private signed URL
            <img src={open.url} alt={open.caption ?? "Diary photo"} className="max-h-[70dvh] w-full rounded-xl object-contain" />
          ) : null}
          {editable && open ? (
            <Button
              variant="ghost"
              className="mt-3 text-destructive"
              disabled={busy}
              onClick={async () => {
                if (!confirm("Remove this photo?")) return;
                setBusy(true);
                const res = await deleteDiaryPhoto(open.id);
                setBusy(false);
                if (!res.ok) toast.error(res.error);
                else {
                  setOpen(null);
                  router.refresh();
                }
              }}
            >
              <Trash2 /> Remove photo
            </Button>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
