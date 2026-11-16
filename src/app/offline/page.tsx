import { WifiOff } from "lucide-react";

export default function OfflinePage() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center px-6 text-center">
      <div className="mb-5 grid size-12 place-items-center rounded-2xl bg-muted text-muted-foreground">
        <WifiOff className="size-5" />
      </div>
      <h1 className="text-xl font-semibold tracking-tight">You&apos;re offline</h1>
      <p className="mt-2 text-[14px] text-muted-foreground">
        This page isn&apos;t available without a connection. Diary drafts you start offline are kept on this device and
        will sync automatically when you&apos;re back online. Clock-ins can&apos;t be saved while offline.
      </p>
    </div>
  );
}
