import type { Metadata } from "next";
import { requireAppContext } from "@/lib/auth";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { updateNotificationPrefs } from "../actions";

export const metadata: Metadata = { title: "Notifications" };

const PREFS = [
  { key: "assessments", label: "TAFE assessments", description: "Two weeks before an assessment is due." },
  { key: "timesheets", label: "Timesheet submissions", description: "On your timesheet due day, if sessions are still drafts." },
  { key: "forgotten_clock_out", label: "Forgotten clock-outs", description: "When a session has been running longer than your limit." },
  { key: "milestones", label: "Apprenticeship milestones", description: "Two weeks before a milestone's target date." },
  { key: "goals", label: "Learning goals", description: "A week before a goal's target date." },
  { key: "warranties", label: "Tool warranties & maintenance", description: "30 days before a warranty ends, and when maintenance is due." },
  { key: "documents", label: "Licence & document expiry", description: "60 days before a document expires." },
];

export default async function NotificationSettingsPage() {
  const { profile } = await requireAppContext();
  const prefs = profile.notification_prefs ?? {};
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>In-app reminders</CardTitle>
          <CardDescription>Choose what shows up in your notifications. Your own custom reminders always appear.</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <ActionForm action={updateNotificationPrefs}>
          <div className="grid gap-2">
            {PREFS.map((p) => (
              <Checkbox key={p.key} name={p.key} label={p.label} description={p.description} defaultChecked={prefs[p.key] !== false} />
            ))}
          </div>
          <p className="text-[12.5px] text-muted-foreground">
            Push notifications to your phone will be added later. The groundwork is in place, but nothing is sent outside the app yet.
          </p>
          <div>
            <SubmitButton>Save preferences</SubmitButton>
          </div>
        </ActionForm>
      </CardContent>
    </Card>
  );
}
