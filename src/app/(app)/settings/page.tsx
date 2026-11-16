import type { Metadata } from "next";
import { requireAppContext } from "@/lib/auth";
import { ActionForm, FieldError, SubmitButton } from "@/components/action-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, NativeSelect } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ThemeToggle } from "@/components/theme-toggle";
import { InstallAppCard } from "@/components/install-prompt";
import { STATES, TIMEZONES, TRADES } from "@/lib/constants";
import { updateProfile } from "./actions";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsProfilePage() {
  const { profile, email } = await requireAppContext();
  return (
    <div className="grid gap-5">
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Profile</CardTitle>
            <CardDescription>Signed in as {email}</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <ActionForm action={updateProfile}>
            <Field label="Name" htmlFor="full_name">
              <Input id="full_name" name="full_name" defaultValue={profile.full_name ?? ""} maxLength={120} />
              <FieldError name="full_name" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Trade" htmlFor="trade">
                <NativeSelect id="trade" name="trade" defaultValue={profile.trade}>
                  {TRADES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="State" htmlFor="state">
                <NativeSelect id="state" name="state" defaultValue={profile.state ?? "NSW"}>
                  {STATES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.value}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Timezone" htmlFor="timezone" hint="Used to work out days and hours.">
                <NativeSelect id="timezone" name="timezone" defaultValue={profile.timezone}>
                  {TIMEZONES.map((t) => (
                    <option key={t} value={t}>
                      {t.replace("Australia/", "").replace("_", " ")}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            </div>
            <Checkbox
              name="location_enabled"
              defaultChecked={profile.location_enabled}
              label="Use my location when I clock in or out"
              description="Read once per clock-in or clock-out, or when you tap Update location. There's no background tracking. With this off you can still clock in and type the address."
            />
            <div>
              <SubmitButton>Save</SubmitButton>
            </div>
          </ActionForm>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Install the app</CardTitle>
            <CardDescription>Use Apprentice OS like a normal app, straight from your home screen.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <InstallAppCard />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Appearance</CardTitle>
            <CardDescription>Light, dark, or follow your device.</CardDescription>
          </div>
          <ThemeToggle />
        </CardHeader>
        <CardContent />
      </Card>
    </div>
  );
}
