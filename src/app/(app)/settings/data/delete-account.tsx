"use client";

import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/misc";

export function DeleteAccount({ configured }: { configured: boolean }) {
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  if (!configured) {
    return (
      <Alert tone="warning">
        Account deletion isn&apos;t set up on this server yet (SUPABASE_SECRET_KEY is missing). Contact support to delete your account.
      </Alert>
    );
  }
  return (
    <form
      className="grid gap-3 sm:max-w-sm"
      onSubmit={async (e) => {
        e.preventDefault();
        setPending(true);
        const res = await fetch("/api/account/delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirm: text }),
        });
        if (res.ok) {
          window.location.assign("/?deleted=1");
        } else {
          setPending(false);
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          toast.error(j.error ?? "Couldn't delete your account.");
        }
      }}
    >
      <Field label='Type "DELETE" to confirm' htmlFor="confirm-delete">
        <Input id="confirm-delete" value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" />
      </Field>
      <Button type="submit" variant="destructive" disabled={pending || text !== "DELETE"}>
        {pending ? <Loader2 className="animate-spin" /> : <Trash2 />} Permanently delete my account
      </Button>
    </form>
  );
}
