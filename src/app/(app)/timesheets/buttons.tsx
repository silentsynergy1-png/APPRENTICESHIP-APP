"use client";

import { useRouter } from "next/navigation";
import { Loader2, MapPinOff, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useActionCall } from "@/components/action-form";
import { clearSessionLocation, deleteSession, submitSessions } from "./actions";

export function SubmitWeekButton({ ids }: { ids: string[] }) {
  const { pending, run } = useActionCall();
  return (
    <Button
      variant="outline"
      disabled={pending || ids.length === 0}
      onClick={() => {
        if (confirm(`Mark ${ids.length} draft session${ids.length === 1 ? "" : "s"} as submitted?`)) run(() => submitSessions(ids));
      }}
      title={ids.length ? undefined : "No draft sessions this week"}
    >
      {pending ? <Loader2 className="animate-spin" /> : <Send />} Mark submitted
    </Button>
  );
}

export function DeleteSessionButton({ id }: { id: string }) {
  const router = useRouter();
  const { pending, run } = useActionCall();
  return (
    <Button
      variant="ghost"
      className="text-destructive hover:bg-destructive-soft"
      disabled={pending}
      onClick={() => {
        if (confirm("Delete this session? Its deletion is kept in your timesheet history.")) {
          run(() => deleteSession(id), { onSuccess: () => router.push("/timesheets"), refresh: false });
        }
      }}
    >
      <Trash2 /> Delete session
    </Button>
  );
}

export function RemoveLocationButton({ id }: { id: string }) {
  const { pending, run } = useActionCall();
  return (
    <Button
      variant="ghost"
      size="sm"
      className="text-muted-foreground"
      disabled={pending}
      onClick={() => {
        if (confirm("Remove all location data (coordinates and addresses) from this session?")) run(() => clearSessionLocation(id));
      }}
    >
      <MapPinOff /> Remove location data
    </Button>
  );
}
