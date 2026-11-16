import type { Metadata } from "next";
import { MapPin } from "lucide-react";
import { requireAppContext } from "@/lib/auth";
import { Logo } from "@/components/brand";
import { ActionForm, FieldError, SubmitButton } from "@/components/action-form";
import { Card, CardContent } from "@/components/ui/card";
import { Field, Input, NativeSelect } from "@/components/ui/input";
import { STATES, TRADES } from "@/lib/constants";
import { completeOnboarding } from "./actions";
import { Checkbox } from "@/components/ui/checkbox";

export const metadata: Metadata = { title: "Set up your account" };

export default async function OnboardingPage() {
  const ctx = await requireAppContext({ allowIncompleteOnboarding: true });
  const { data: app } = await ctx.supabase.from("apprenticeships").select("*").eq("is_current", true).maybeSingle();
  const p = ctx.profile;

  return (
    <div className="mx-auto max-w-xl px-5 py-10 sm:py-16">
      <Logo />
      <h1 className="mt-10 text-[28px] font-semibold tracking-tight">Let&apos;s set up your apprenticeship</h1>
      <p className="mt-2 text-[15px] text-muted-foreground">
        This takes about a minute. You can change any of it later in Settings.
      </p>

      <ActionForm action={completeOnboarding} redirectTo="/dashboard" successMessage="You're all set" className="mt-8 gap-6">
        <Card>
          <CardContent className="grid gap-4">
            <Field label="Your name" htmlFor="full_name">
              <Input id="full_name" name="full_name" defaultValue={p.full_name ?? ""} autoComplete="name" required />
              <FieldError name="full_name" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Trade" htmlFor="trade">
                <NativeSelect id="trade" name="trade" defaultValue={p.trade}>
                  {TRADES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="State or territory" htmlFor="state" hint="Sets your timezone for timesheets.">
                <NativeSelect id="state" name="state" defaultValue={p.state ?? "NSW"}>
                  {STATES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="grid gap-4">
            <div className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">Your apprenticeship</div>
            <Field label="Employer (optional)" htmlFor="employer_name">
              <Input id="employer_name" name="employer_name" placeholder="e.g. Smith Electrical Pty Ltd" />
            </Field>
            <Field label="Qualification (optional)" htmlFor="qualification" hint="As it appears on your training plan.">
              <Input id="qualification" name="qualification" defaultValue={app?.qualification ?? ""} placeholder="e.g. Certificate III in Electrotechnology" />
            </Field>
            <Field label="Training provider (optional)" htmlFor="training_provider">
              <Input id="training_provider" name="training_provider" defaultValue={app?.training_provider ?? ""} placeholder="e.g. TAFE NSW" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Start date" htmlFor="start_date">
                <Input id="start_date" name="start_date" type="date" defaultValue={app?.start_date ?? ""} required />
                <FieldError name="start_date" />
              </Field>
              <Field label="Expected completion" htmlFor="expected_completion_date">
                <Input id="expected_completion_date" name="expected_completion_date" type="date" defaultValue={app?.expected_completion_date ?? ""} required />
                <FieldError name="expected_completion_date" />
              </Field>
            </div>
            <Checkbox name="starter_categories" defaultChecked label="Add a starter skills checklist for my trade" description="Generic skill areas to organise your own records. These aren't official units, and you can rename or delete them." />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="grid gap-3">
            <div className="flex items-start gap-3">
              <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
                <MapPin className="size-4" />
              </div>
              <div>
                <div className="font-medium">Location at clock-in</div>
                <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                  When you press Clock in or Clock out, Apprentice OS can record your approximate location once, so your
                  timesheet shows which job site you were at. There&apos;s no background tracking. Your phone will ask for
                  permission the first time, you can always type the address instead, and clock-in works with location off.
                </p>
              </div>
            </div>
            <Checkbox name="location_enabled" defaultChecked={p.location_enabled} label="Use my location when I clock in or out" />
          </CardContent>
        </Card>

        <SubmitButton size="lg">Continue to dashboard</SubmitButton>
      </ActionForm>
    </div>
  );
}
