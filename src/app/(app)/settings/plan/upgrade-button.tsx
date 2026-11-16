"use client";

import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/** Only rendered when STRIPE_ENABLED=true and Stripe keys are configured. */
export function UpgradeButton() {
  const [pending, setPending] = useState(false);
  return (
    <Button
      size="lg"
      className="w-full"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        const res = await fetch("/api/billing/checkout", { method: "POST" });
        const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
        if (json.url) window.location.assign(json.url);
        else {
          setPending(false);
          toast.error(json.error ?? "Checkout isn't available right now.");
        }
      }}
    >
      {pending ? <Loader2 className="animate-spin" /> : <Sparkles />} Upgrade to Pro
    </Button>
  );
}
