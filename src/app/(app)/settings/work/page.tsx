import type { Metadata } from "next";
import { CalendarX2 } from "lucide-react";
import { requireAppContext } from "@/lib/auth";
import { ActionForm, FieldError, SubmitButton } from "@/components/action-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, NativeSelect } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert } from "@/components/ui/misc";
import { WEEKDAYS } from "@/lib/constants";
import { formatLocal } from "@/lib/time/calc";
import type { PublicHoliday } from "@/lib/types";
import { addHoliday, updateWorkRules } from "../actions";
import { DeleteHolidayButton } from "./delete-holiday";

export const metadata: Metadata = { title: "Work rules" };

export default async function WorkRulesPage() {
  const ctx = await requireAppContext();
  const r = ctx.rules;
  const { data: holidays } = await ctx.supabase.from("public_holidays").select("*").order("holiday_date", { ascending: false }).limit(100);

  return (
    <div className="grid gap-5">
      <Alert tone="primary">
        Set these to match your employment contract or award. Apprentice OS doesn&apos;t assume a universal arrangement, and these rules only
        change how your hours are grouped. They aren&apos;t a pay calculation.
      </Alert>
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Ordinary hours & overtime</CardTitle>
            <CardDescription>How your timesheet splits hours into ordinary, overtime, weekend and public holiday.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <ActionForm action={updateWorkRules}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Ordinary hours per day" htmlFor="daily_ordinary_hours">
                <Input id="daily_ordinary_hours" name="daily_ordinary_hours" type="number" step="0.1" min={0} max={24} defaultValue={r.daily_ordinary_hours} />
                <FieldError name="daily_ordinary_hours" />
              </Field>
              <Field label="Ordinary hours per week" htmlFor="weekly_ordinary_hours">
                <Input id="weekly_ordinary_hours" name="weekly_ordinary_hours" type="number" step="0.1" min={0} max={168} defaultValue={r.weekly_ordinary_hours} />
                <FieldError name="weekly_ordinary_hours" />
              </Field>
              <Field label="Count overtime" htmlFor="overtime_mode">
                <NativeSelect id="overtime_mode" name="overtime_mode" defaultValue={r.overtime_mode}>
                  <option value="daily_and_weekly">After daily and weekly ordinary hours</option>
                  <option value="daily">After daily ordinary hours only</option>
                  <option value="weekly">After weekly ordinary hours only</option>
                  <option value="none">Don&apos;t separate overtime</option>
                </NativeSelect>
              </Field>
              <Field label="Week starts on" htmlFor="week_starts_on">
                <NativeSelect id="week_starts_on" name="week_starts_on" defaultValue={String(r.week_starts_on)}>
                  {WEEKDAYS.map((d, i) => (
                    <option key={d} value={i}>
                      {d}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Timesheet due" htmlFor="timesheet_due_weekday" hint="Get a reminder on this day if sessions are still drafts.">
                <NativeSelect id="timesheet_due_weekday" name="timesheet_due_weekday" defaultValue={r.timesheet_due_weekday === null ? "" : String(r.timesheet_due_weekday)}>
                  <option value="">No reminder</option>
                  {WEEKDAYS.map((d, i) => (
                    <option key={d} value={i}>
                      {d}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Flag a forgotten clock-out after (hours)" htmlFor="forgotten_clock_out_hours">
                <Input id="forgotten_clock_out_hours" name="forgotten_clock_out_hours" type="number" step="0.5" min={1} max={24} defaultValue={r.forgotten_clock_out_hours} />
                <FieldError name="forgotten_clock_out_hours" />
              </Field>
            </div>
            <Checkbox name="separate_weekend" defaultChecked={r.separate_weekend} label="Show Saturday and Sunday hours separately" description="Weekend hours are grouped on their own instead of counting toward ordinary hours." />
            <div>
              <SubmitButton>Save rules</SubmitButton>
            </div>
          </ActionForm>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Public holidays</CardTitle>
            <CardDescription>Hours on these dates are grouped as public holiday. Add the ones that apply to you.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="grid gap-5">
          <ActionForm action={addHoliday} resetOnSuccess className="sm:grid-cols-[160px_1fr_auto] sm:items-end">
            <Field label="Date" htmlFor="holiday_date">
              <Input id="holiday_date" name="holiday_date" type="date" required />
            </Field>
            <Field label="Name" htmlFor="holiday_name">
              <Input id="holiday_name" name="name" placeholder="e.g. Australia Day" maxLength={120} required />
            </Field>
            <SubmitButton variant="outline">Add</SubmitButton>
          </ActionForm>
          {holidays?.length ? (
            <ul className="divide-y divide-border rounded-xl border border-border">
              {(holidays as PublicHoliday[]).map((h) => (
                <li key={h.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[14px]">
                  <span>
                    <span className="font-medium">{h.name}</span>
                    <span className="ml-2 text-muted-foreground">{formatLocal(`${h.holiday_date}T12:00:00Z`, "UTC", "EEE d MMM yyyy")}</span>
                  </span>
                  <DeleteHolidayButton id={h.id} />
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
              <CalendarX2 className="size-4" /> No public holidays added.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
