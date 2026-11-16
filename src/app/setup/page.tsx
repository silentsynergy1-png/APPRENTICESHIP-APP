import { CheckCircle2, CircleDashed } from "lucide-react";
import { Logo } from "@/components/brand";
import { isSupabaseConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";

/** Shown when the deployment is missing required configuration. Lists variable NAMES only, never values. */
export default function SetupPage() {
  const checks = [
    { name: "NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", ok: isSupabaseConfigured(), required: true, what: "Accounts, database and file storage" },
    { name: "SUPABASE_SECRET_KEY", ok: Boolean(process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY), required: false, what: "Account deletion and the Stripe webhook" },
    { name: "ANTHROPIC_API_KEY", ok: Boolean(process.env.ANTHROPIC_API_KEY), required: false, what: "AI diary, assistant, receipt scanning, weekly recap" },
    { name: "GEOCODER_PROVIDER (+ key)", ok: Boolean(process.env.GEOCODER_PROVIDER && process.env.GEOCODER_PROVIDER !== "none"), required: false, what: "Turning GPS coordinates into an approximate street address" },
  ];
  return (
    <div className="mx-auto max-w-xl px-5 py-16">
      <Logo />
      <h1 className="mt-10 text-2xl font-semibold tracking-tight">Finish setting up Apprentice OS</h1>
      <p className="mt-2 text-[14px] text-muted-foreground">
        This deployment is missing configuration. Add the environment variables below (see README → Environment variables), then redeploy.
      </p>
      <ul className="mt-8 divide-y divide-border rounded-2xl border border-border bg-card">
        {checks.map((c) => (
          <li key={c.name} className="flex items-start gap-3 p-4">
            {c.ok ? <CheckCircle2 className="mt-0.5 size-4 text-success" /> : <CircleDashed className="mt-0.5 size-4 text-muted-foreground" />}
            <div>
              <div className="font-mono text-[12.5px]">{c.name}</div>
              <div className="text-[13px] text-muted-foreground">
                {c.what} · {c.required ? "required" : "optional"}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
