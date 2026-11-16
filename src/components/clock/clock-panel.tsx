"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  BookOpenText,
  Coffee,
  Loader2,
  LocateFixed,
  MapPin,
  MapPinOff,
  Pencil,
  Play,
  Save,
  Square,
  Trash2,
  WifiOff,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge, Alert } from "@/components/ui/misc";
import { Input, NativeSelect, Field } from "@/components/ui/input";
import { Dialog, DialogContent } from "@/components/ui/overlay";
import { geoErrorMessage, useGeolocation, useOnline, type GeoReading } from "@/hooks/use-geolocation";
import { accuracyLabel } from "@/lib/geo/distance";
import { formatLocal, formatMinutes, isoToLocalInput, sessionWorkedMinutes, breakMinutes } from "@/lib/time/calc";
import type { Employer, JobSite, SessionWithBreaks } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  assignJobSite,
  clearSessionLocation,
  clockIn,
  clockOut,
  correctSessionAddress,
  endBreak,
  refreshSessionLocation,
  saveSessionAsJobSite,
  startBreak,
  type LocationOutcome,
} from "@/app/(app)/timesheets/actions";

export interface ClockPanelProps {
  session: SessionWithBreaks | null;
  employers: Pick<Employer, "id" | "name" | "is_primary">[];
  jobSites: Pick<JobSite, "id" | "name" | "employer_id">[];
  locationEnabled: boolean;
  timezone: string;
  forgottenHours: number;
  variant?: "card" | "sheet";
}

const EXPLAINER_KEY = "aos.location-explained";

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

function formatClock(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export function ClockPanel(props: ClockPanelProps) {
  const { session, employers, jobSites, locationEnabled, timezone, forgottenHours, variant = "card" } = props;
  const router = useRouter();
  const online = useOnline();
  const { permission, read } = useGeolocation();
  const [phase, setPhase] = useState<"idle" | "locating" | "saving">("idle");
  const [, startTransition] = useTransition();
  const [outcome, setOutcome] = useState<LocationOutcome | null>(null);
  const [explainOpen, setExplainOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<"in" | "out" | null>(null);
  const [addressDialog, setAddressDialog] = useState(false);
  const [saveSiteDialog, setSaveSiteDialog] = useState(false);
  const [forgotDialog, setForgotDialog] = useState(false);
  const [summary, setSummary] = useState<{ sessionId: string; minutes: number; hasDiary: boolean } | null>(null);
  const [geoNote, setGeoNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const primaryEmployer = employers.find((e) => e.is_primary)?.id ?? "";
  const [employerId, setEmployerId] = useState<string>(primaryEmployer);
  const [jobSiteId, setJobSiteId] = useState<string>("");
  const [manualAddress, setManualAddress] = useState("");

  const now = useNow(Boolean(session));
  const openBreak = session?.breaks.find((b) => !b.ended_at) ?? null;
  const workedSeconds = session ? sessionWorkedMinutes(session, session.breaks, now) * 60 : 0;
  const breakSecondsNow = openBreak ? (now - new Date(openBreak.started_at).getTime()) / 1000 : 0;
  const totalBreakMins = session ? breakMinutes(session, session.breaks, now) : 0;
  const elapsedHours = session ? (now - new Date(session.started_at).getTime()) / 3_600_000 : 0;
  const forgotten = Boolean(session) && elapsedHours >= forgottenHours;
  const sitesForEmployer = useMemo(
    () => jobSites.filter((s) => !employerId || !s.employer_id || s.employer_id === employerId),
    [jobSites, employerId],
  );

  async function getLocation(): Promise<GeoReading | null> {
    if (!locationEnabled) return null;
    setPhase("locating");
    const res = await read();
    if (res.status === "ok") {
      setGeoNote(null);
      return res.reading;
    }
    setGeoNote(geoErrorMessage(res.status));
    return null;
  }

  function begin(kind: "in" | "out") {
    if (!online) {
      toast.error("You're offline. Clock-ins and clock-outs can't be saved until you reconnect.");
      return;
    }
    let explained = false;
    try {
      explained = localStorage.getItem(EXPLAINER_KEY) === "1";
    } catch {
      explained = true;
    }
    if (locationEnabled && permission === "prompt" && !explained) {
      setPendingAction(kind);
      setExplainOpen(true);
      return;
    }
    void (kind === "in" ? doClockIn() : doClockOut());
  }

  async function doClockIn() {
    const pressedAt = new Date().toISOString();
    const reading = await getLocation();
    setPhase("saving");
    const res = await clockIn({
      employerId: employerId || null,
      jobSiteId: jobSiteId || null,
      location: reading,
      manualAddress: !reading && manualAddress ? manualAddress : null,
      pressedAt,
    });
    setPhase("idle");
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    if (res.data.alreadyActive) toast.info("You're already clocked in, so here's your current session.");
    else toast.success(`Clocked in at ${formatLocal(res.data.startedAt, timezone, "h:mm a")}`);
    setOutcome(res.data.location);
    setManualAddress("");
    startTransition(() => router.refresh());
  }

  async function doClockOut(finishLocal?: string) {
    if (!session) return;
    const pressedAt = new Date().toISOString();
    const reading = finishLocal ? null : await getLocation();
    setPhase("saving");
    const res = await clockOut({ sessionId: session.id, location: reading, pressedAt, finishLocal });
    setPhase("idle");
    if (!res.ok) {
      toast.error(res.error);
      if (res.fieldErrors?.finishLocal) setForgotDialog(true);
      return;
    }
    setForgotDialog(false);
    setOutcome(null);
    setSummary({ sessionId: res.data.sessionId, minutes: res.data.workedMinutes, hasDiary: res.data.hasDiaryEntry });
    startTransition(() => router.refresh());
  }

  async function run(label: string, fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) {
    setBusy(label);
    const res = await fn();
    setBusy(null);
    if (!res.ok) toast.error(res.error ?? "Something went wrong");
    else {
      if (res.message) toast.success(res.message);
      startTransition(() => router.refresh());
    }
    return res.ok;
  }

  const loading = phase !== "idle";
  const acc = accuracyLabel(session?.start_accuracy_m);
  const suggestion = outcome?.suggestedJobSite && session && !session.job_site_id ? outcome.suggestedJobSite : null;
  const offerSave =
    !suggestion && session && !session.job_site_id && session.start_latitude != null && (outcome?.repeatVisits ?? 0) >= 2;

  /* ------------------------------ clocked out ------------------------------ */
  if (!session) {
    return (
      <div className={cn(variant === "card" && "rounded-2xl border border-border bg-card p-5 shadow-card sm:p-6")}>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[13px] text-muted-foreground">Not clocked in</div>
            <div className="mt-0.5 text-lg font-semibold tracking-tight">Ready when you are</div>
          </div>
          <Badge tone="neutral">Off the clock</Badge>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <Field label="Employer" htmlFor="clock-employer">
            <NativeSelect id="clock-employer" value={employerId} onChange={(e) => setEmployerId(e.target.value)}>
              <option value="">No employer</option>
              {employers.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Job site" htmlFor="clock-site">
            <NativeSelect id="clock-site" value={jobSiteId} onChange={(e) => setJobSiteId(e.target.value)}>
              <option value="">{locationEnabled ? "Detect from location" : "None"}</option>
              {sitesForEmployer.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          {!locationEnabled || permission === "denied" || permission === "unsupported" ? (
            <Field label="Address (optional)" htmlFor="clock-address" className="sm:col-span-2">
              <Input
                id="clock-address"
                value={manualAddress}
                onChange={(e) => setManualAddress(e.target.value)}
                placeholder="Type the job address"
                maxLength={300}
              />
            </Field>
          ) : null}
        </div>

        {!online ? (
          <Alert tone="warning" icon={<WifiOff />} className="mt-4" title="You're offline">
            Clocking in needs a connection, because nothing is saved until the server confirms it. If you start work offline, add the session manually once you reconnect.
          </Alert>
        ) : null}
        {geoNote ? <Alert tone="warning" icon={<MapPinOff />} className="mt-4">{geoNote}</Alert> : null}

        <Button size="xl" className="mt-5 w-full text-[17px]" disabled={loading || !online} onClick={() => begin("in")}>
          {loading ? <Loader2 className="size-5 animate-spin" /> : <Play className="size-5 fill-current" />}
          {phase === "locating" ? "Getting location…" : phase === "saving" ? "Clocking in…" : "Clock in"}
        </Button>
        <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-[12px] text-muted-foreground">
          {locationEnabled ? (
            <>
              <MapPin className="size-3.5" /> Location is captured once at clock-in. No background tracking.
            </>
          ) : (
            <>
              <MapPinOff className="size-3.5" /> Location is off. You can turn it on in Settings.
            </>
          )}
        </p>

        <ExplainerDialog
          open={explainOpen}
          onOpenChange={setExplainOpen}
          onContinue={() => {
            try {
              localStorage.setItem(EXPLAINER_KEY, "1");
            } catch {}
            setExplainOpen(false);
            void (pendingAction === "out" ? doClockOut() : doClockIn());
          }}
        />
        <SummaryDialog summary={summary} onClose={() => setSummary(null)} />
      </div>
    );
  }

  /* ------------------------------- clocked in ------------------------------ */
  const site = jobSites.find((s) => s.id === session.job_site_id);
  const employer = employers.find((e) => e.id === session.employer_id);

  return (
    <div className={cn(variant === "card" && "rounded-2xl border border-border bg-card p-5 shadow-card sm:p-6")}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[13px] text-muted-foreground">
            Clocked in {formatLocal(session.started_at, timezone, "h:mm a")} · {formatLocal(session.started_at, timezone, "EEE d MMM")}
          </div>
          <div className="mt-1 font-mono text-[40px] font-semibold leading-none tracking-tight tabular sm:text-5xl" aria-live="off">
            {formatClock(workedSeconds)}
          </div>
          <div className="mt-1.5 text-[12.5px] text-muted-foreground">
            Worked today{totalBreakMins >= 1 ? ` · ${formatMinutes(totalBreakMins)} break` : ""}
            {employer ? ` · ${employer.name}` : ""}
          </div>
        </div>
        {openBreak ? (
          <Badge tone="warning">
            <Coffee /> On break · {formatClock(breakSecondsNow)}
          </Badge>
        ) : (
          <Badge tone="success">
            <span className="relative size-1.5 rounded-full bg-success text-success live-dot" /> On the clock
          </Badge>
        )}
      </div>

      {forgotten ? (
        <Alert tone="warning" icon={<AlertTriangle />} className="mt-4" title="Did you forget to clock out?">
          You&apos;ve been clocked in for {Math.floor(elapsedHours)} hours.{" "}
          <button className="font-medium text-foreground underline" onClick={() => setForgotDialog(true)}>
            Set your real finish time
          </button>
        </Alert>
      ) : null}

      {/* Location card */}
      <div className="mt-5 rounded-xl border border-border bg-subtle p-4">
        <div className="flex items-start gap3 gap-3">
          <div className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
            {session.start_location_source === "none" ? <MapPinOff className="size-4" /> : <MapPin className="size-4" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-medium">{site?.name ?? (session.start_location_source === "none" ? "No location recorded" : "Work location")}</div>
            {session.start_address ? (
              <div className="text-[13px] text-muted-foreground">
                {session.start_location_source === "gps" ? "Approx. " : ""}
                {session.start_address}
              </div>
            ) : session.start_latitude != null ? (
              <div className="text-[13px] text-muted-foreground">
                {outcome && !outcome.geocoderConfigured
                  ? "Coordinates saved. Address lookup isn't set up yet, so you can add the address yourself."
                  : "Coordinates saved. No street address was found."}
              </div>
            ) : (
              <div className="text-[13px] text-muted-foreground">Add an address so your timesheet shows where you worked.</div>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {session.start_location_source === "gps" ? (
                <>
                  <Badge tone="primary">GPS detected</Badge>
                  <Badge tone={acc.tone}>{acc.label}</Badge>
                </>
              ) : session.start_location_source === "manual" ? (
                <Badge tone="neutral">Entered manually</Badge>
              ) : null}
              {session.start_location_captured_at ? (
                <span className="text-[11.5px] text-muted-foreground">
                  Captured {formatLocal(session.start_location_captured_at, timezone, "h:mm a")}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        {suggestion ? (
          <div className="mt-3 flex flex-col gap-2 rounded-lg border border-primary/20 bg-primary-soft/50 p-3 text-[13px] sm:flex-row sm:items-center sm:justify-between">
            <span>
              Looks like <strong>{suggestion.name}</strong> ({suggestion.distance} m away).
            </span>
            <Button size="sm" variant="subtle" disabled={busy === "site"} onClick={() => run("site", () => assignJobSite(session.id, suggestion.id))}>
              Use this site
            </Button>
          </div>
        ) : null}
        {offerSave ? (
          <div className="mt-3 flex flex-col gap-2 rounded-lg border border-border bg-card p-3 text-[13px] sm:flex-row sm:items-center sm:justify-between">
            <span>You&apos;ve clocked in here {outcome!.repeatVisits} times before. Save it as a job site?</span>
            <Button size="sm" variant="outline" onClick={() => setSaveSiteDialog(true)}>
              <Save /> Save site
            </Button>
          </div>
        ) : null}

        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setAddressDialog(true)}>
            <Pencil /> {session.start_address ? "Correct address" : "Add address"}
          </Button>
          {locationEnabled ? (
            <Button
              size="sm"
              variant="outline"
              disabled={busy === "refresh"}
              onClick={async () => {
                setBusy("refresh");
                const r = await read();
                if (r.status !== "ok") {
                  setBusy(null);
                  toast.error(geoErrorMessage(r.status));
                  return;
                }
                const res = await refreshSessionLocation({ sessionId: session.id, location: r.reading });
                setBusy(null);
                if (!res.ok) toast.error(res.error);
                else {
                  setOutcome(res.data);
                  toast.success("Location updated");
                  router.refresh();
                }
              }}
            >
              {busy === "refresh" ? <Loader2 className="animate-spin" /> : <LocateFixed />} Update location
            </Button>
          ) : null}
          {!session.job_site_id && session.start_latitude != null && !offerSave ? (
            <Button size="sm" variant="ghost" onClick={() => setSaveSiteDialog(true)}>
              <Save /> Save as job site
            </Button>
          ) : null}
          {session.start_location_source !== "none" ? (
            <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => run("clear", () => clearSessionLocation(session.id))}>
              <Trash2 /> Remove location
            </Button>
          ) : null}
        </div>
        {!session.job_site_id && jobSites.length > 0 ? (
          <div className="mt-3">
            <NativeSelect
              aria-label="Choose job site"
              defaultValue=""
              onChange={(e) => e.target.value && run("site", () => assignJobSite(session.id, e.target.value))}
            >
              <option value="">Choose a saved job site…</option>
              {jobSites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </NativeSelect>
          </div>
        ) : null}
      </div>

      {geoNote ? <Alert tone="warning" icon={<MapPinOff />} className="mt-4">{geoNote}</Alert> : null}

      <div className="mt-5 grid grid-cols-[1fr_1.4fr] gap-3">
        <Button
          size="xl"
          variant="outline"
          disabled={busy === "break" || loading}
          onClick={() => run("break", () => (openBreak ? endBreak(session.id) : startBreak(session.id)))}
        >
          {busy === "break" ? <Loader2 className="animate-spin" /> : <Coffee className="size-5" />}
          {openBreak ? "End break" : "Break"}
        </Button>
        <Button size="xl" variant="destructive" disabled={loading || !online} onClick={() => (forgotten ? setForgotDialog(true) : begin("out"))}>
          {loading ? <Loader2 className="size-5 animate-spin" /> : <Square className="size-4 fill-current" />}
          {phase === "locating" ? "Getting location…" : phase === "saving" ? "Saving…" : "Clock out"}
        </Button>
      </div>
      {!online ? (
        <p className="mt-3 flex items-center justify-center gap-1.5 text-[12px] text-warning">
          <WifiOff className="size-3.5" /> Offline. Reconnect to clock out.
        </p>
      ) : null}

      <AddressDialog
        open={addressDialog}
        onOpenChange={setAddressDialog}
        initial={session.start_address ?? ""}
        onSave={async (address) => {
          const okd = await run("addr", () => correctSessionAddress({ sessionId: session.id, which: "start", address }));
          if (okd) setAddressDialog(false);
        }}
      />
      <SaveSiteDialog
        open={saveSiteDialog}
        onOpenChange={setSaveSiteDialog}
        address={session.start_address}
        onSave={async (name) => {
          const okd = await run("save", () => saveSessionAsJobSite({ sessionId: session.id, name }));
          if (okd) setSaveSiteDialog(false);
        }}
      />
      <ForgotDialog
        open={forgotDialog}
        onOpenChange={setForgotDialog}
        startedAt={session.started_at}
        timezone={timezone}
        pending={loading}
        onSubmit={(finishLocal) => void doClockOut(finishLocal)}
      />
      <ExplainerDialog
        open={explainOpen}
        onOpenChange={setExplainOpen}
        onContinue={() => {
          try {
            localStorage.setItem(EXPLAINER_KEY, "1");
          } catch {}
          setExplainOpen(false);
          void (pendingAction === "out" ? doClockOut() : doClockIn());
        }}
      />
      <SummaryDialog summary={summary} onClose={() => setSummary(null)} />
    </div>
  );
}

/* --------------------------------- dialogs -------------------------------- */

function ExplainerDialog({ open, onOpenChange, onContinue }: { open: boolean; onOpenChange: (o: boolean) => void; onContinue: () => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Why we ask for your location" description="So your timesheet can show where you worked.">
        <ul className="space-y-3 text-[14px] text-muted-foreground">
          <li className="flex gap-3">
            <MapPin className="mt-0.5 size-4 shrink-0 text-primary" /> Your location is read <strong className="text-foreground">once</strong>, only when you clock in or out, or tap Update location.
          </li>
          <li className="flex gap-3">
            <LocateFixed className="mt-0.5 size-4 shrink-0 text-primary" /> It&apos;s turned into an approximate address, with the GPS accuracy saved next to it.
          </li>
          <li className="flex gap-3">
            <MapPinOff className="mt-0.5 size-4 shrink-0 text-primary" /> There&apos;s no background tracking. If you say no, you can still clock in and type the address.
          </li>
        </ul>
        <div className="mt-6 grid gap-2">
          <Button size="lg" onClick={onContinue}>
            Continue
          </Button>
          <p className="text-center text-[12px] text-muted-foreground">Your browser will now ask for permission.</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AddressDialog({ open, onOpenChange, initial, onSave }: { open: boolean; onOpenChange: (o: boolean) => void; initial: string; onSave: (a: string) => Promise<void> }) {
  const [value, setValue] = useState(initial);
  const [pending, setPending] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- reset field when the dialog reopens
  useEffect(() => setValue(initial), [initial, open]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Correct address" description="This will be marked as entered manually.">
        <form
          className="grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setPending(true);
            await onSave(value.trim());
            setPending(false);
          }}
        >
          <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="e.g. 15 Hawkesbury Rd, Westmead NSW 2145" maxLength={300} autoFocus />
          <Button type="submit" size="lg" disabled={pending || value.trim().length < 3}>
            {pending ? <Loader2 className="animate-spin" /> : null} Save address
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SaveSiteDialog({ open, onOpenChange, address, onSave }: { open: boolean; onOpenChange: (o: boolean) => void; address: string | null; onSave: (n: string) => Promise<void> }) {
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Save as job site" description={address ? `Approx. ${address}` : "Uses this session's location."}>
        <form
          className="grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setPending(true);
            await onSave(name.trim());
            setPending(false);
          }}
        >
          <Field label="Job site name" htmlFor="site-name">
            <Input id="site-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Westmead Residential Project" maxLength={160} autoFocus />
          </Field>
          <Button type="submit" size="lg" disabled={pending || !name.trim()}>
            {pending ? <Loader2 className="animate-spin" /> : null} Save job site
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ForgotDialog({
  open,
  onOpenChange,
  startedAt,
  timezone,
  pending,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  startedAt: string;
  timezone: string;
  pending: boolean;
  onSubmit: (finishLocal: string) => void;
}) {
  const min = isoToLocalInput(new Date(new Date(startedAt).getTime() + 60_000).toISOString(), timezone);
  const max = isoToLocalInput(new Date().toISOString(), timezone);
  const [value, setValue] = useState("");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="When did you finish?" description={`You clocked in ${formatLocal(startedAt, timezone, "h:mm a 'on' EEE d MMM")}.`}>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (value) onSubmit(value);
          }}
        >
          <Field label="Finish time" htmlFor="finish" hint="The session will be flagged so you can double-check it on your timesheet.">
            <Input id="finish" type="datetime-local" min={min} max={max} value={value} onChange={(e) => setValue(e.target.value)} required />
          </Field>
          <Button type="submit" size="lg" disabled={pending || !value}>
            {pending ? <Loader2 className="animate-spin" /> : null} Clock out at this time
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SummaryDialog({ summary, onClose }: { summary: { sessionId: string; minutes: number; hasDiary: boolean } | null; onClose: () => void }) {
  return (
    <Dialog open={Boolean(summary)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Clocked out" description="Your session has been saved.">
        <div className="rounded-2xl bg-subtle p-5 text-center">
          <div className="text-[13px] text-muted-foreground">Worked this session</div>
          <div className="mt-1 text-4xl font-semibold tracking-tight tabular">{formatMinutes(summary?.minutes ?? 0)}</div>
        </div>
        {summary && !summary.hasDiary ? (
          <div className="mt-5 grid gap-2">
            <p className="text-center text-[14px] text-muted-foreground">Add a quick diary entry while it&apos;s fresh?</p>
            <Button asChild size="lg">
              <Link href={`/diary/new?session=${summary.sessionId}`} onClick={onClose}>
                <BookOpenText /> Add diary entry
              </Link>
            </Button>
            <Button variant="ghost" onClick={onClose}>
              Later
            </Button>
          </div>
        ) : (
          <Button className="mt-5 w-full" size="lg" onClick={onClose}>
            Done
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
