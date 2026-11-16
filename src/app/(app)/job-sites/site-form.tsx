"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, Loader2, LocateFixed, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ActionForm, FieldError, SubmitButton, useActionCall } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/misc";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Dialog, DialogContent } from "@/components/ui/overlay";
import { geoErrorMessage, useGeolocation } from "@/hooks/use-geolocation";
import { accuracyLabel } from "@/lib/geo/distance";
import type { JobSite } from "@/lib/types";
import { deleteJobSite, saveJobSite, setJobSiteArchived } from "./actions";

type Option = { id: string; name: string };

export function SiteFields({ site, employers }: { site?: Partial<JobSite>; employers: Option[] }) {
  const { read } = useGeolocation();
  const [address, setAddress] = useState(site?.address ?? "");
  const [coords, setCoords] = useState<{ lat: number; lng: number; acc: number | null } | null>(
    site?.latitude != null && site?.longitude != null ? { lat: site.latitude, lng: site.longitude, acc: null } : null,
  );
  const [locating, setLocating] = useState(false);

  async function useHere() {
    setLocating(true);
    const r = await read();
    if (r.status !== "ok") {
      setLocating(false);
      toast.error(geoErrorMessage(r.status));
      return;
    }
    setCoords({ lat: r.reading.latitude, lng: r.reading.longitude, acc: r.reading.accuracy });
    try {
      const res = await fetch("/api/geocode/reverse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ latitude: r.reading.latitude, longitude: r.reading.longitude }),
      });
      const json = (await res.json()) as { result?: { label: string } | null; configured?: boolean };
      if (json.result?.label) setAddress(json.result.label);
      else if (json.configured === false) toast.info("Location saved. Address lookup isn't set up, so please type the address.");
    } catch {
      toast.info("Location saved, but the address couldn't be looked up.");
    }
    setLocating(false);
  }

  const acc = accuracyLabel(coords?.acc);
  return (
    <>
      {site?.id ? <input type="hidden" name="id" value={site.id} /> : null}
      <input type="hidden" name="latitude" value={coords?.lat ?? ""} />
      <input type="hidden" name="longitude" value={coords?.lng ?? ""} />
      <Field label="Name" htmlFor="name">
        <Input id="name" name="name" defaultValue={site?.name ?? ""} maxLength={160} placeholder="e.g. Westmead Residential Project" required />
        <FieldError name="name" />
      </Field>
      <Field label="Address" htmlFor="address" hint="Approximate is fine.">
        <div className="flex gap-2">
          <Input id="address" name="address" value={address} onChange={(e) => setAddress(e.target.value)} maxLength={300} placeholder="Street, suburb, state" />
          <Button type="button" variant="outline" size="icon" onClick={useHere} disabled={locating} aria-label="Use my current location" title="Use my current location">
            {locating ? <Loader2 className="animate-spin" /> : <LocateFixed />}
          </Button>
        </div>
      </Field>
      {coords ? (
        <div className="-mt-2 flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
          <Badge tone="primary">Location saved</Badge>
          {coords.acc != null ? <Badge tone={acc.tone}>{acc.label}</Badge> : null}
          <button type="button" className="underline" onClick={() => setCoords(null)}>
            Remove
          </button>
          <span>Used to recognise this site when you clock in nearby.</span>
        </div>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Employer" htmlFor="employer_id">
          <NativeSelect id="employer_id" name="employer_id" defaultValue={site?.employer_id ?? ""}>
            <option value="">None</option>
            {employers.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Recognition radius" htmlFor="match_radius_m" hint="How close counts as being here.">
          <NativeSelect id="match_radius_m" name="match_radius_m" defaultValue={String(site?.match_radius_m ?? 150)}>
            <option value="75">75 m: small site</option>
            <option value="150">150 m: typical</option>
            <option value="300">300 m: large site</option>
            <option value="800">800 m: estate / campus</option>
          </NativeSelect>
        </Field>
      </div>
      <Field label="Project description" htmlFor="description">
        <Textarea id="description" name="description" defaultValue={site?.description ?? ""} rows={2} maxLength={2000} placeholder="e.g. 12-townhouse development, full rough-in and fit-off" />
      </Field>
      <Field label="Notes" htmlFor="notes">
        <Textarea id="notes" name="notes" defaultValue={site?.notes ?? ""} rows={2} maxLength={4000} placeholder="Gate codes go in your own notes. Don't store anything sensitive here." />
      </Field>
    </>
  );
}

export function NewSiteButton({ employers }: { employers: Option[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus /> New job site
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="New job site">
          <ActionForm action={saveJobSite} onSuccess={() => setOpen(false)} redirectTo={(d) => `/job-sites/${d.id}`}>
            <SiteFields employers={employers} />
            <SubmitButton size="lg">Save job site</SubmitButton>
          </ActionForm>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function EditSiteForm({ site, employers }: { site: JobSite; employers: Option[] }) {
  return (
    <ActionForm action={saveJobSite}>
      <SiteFields site={site} employers={employers} />
      <SubmitButton>Save changes</SubmitButton>
    </ActionForm>
  );
}

export function SiteDangerZone({ id, archived }: { id: string; archived: boolean }) {
  const router = useRouter();
  const { pending, run } = useActionCall();
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" disabled={pending} onClick={() => run(() => setJobSiteArchived(id, !archived))}>
        {archived ? <ArchiveRestore /> : <Archive />} {archived ? "Restore" : "Archive"}
      </Button>
      <Button
        variant="ghost"
        className="text-destructive hover:bg-destructive-soft"
        disabled={pending}
        onClick={() => {
          if (confirm("Delete this job site? Your sessions stay, but they'll no longer be linked to it.")) {
            run(() => deleteJobSite(id), { onSuccess: () => router.push("/job-sites"), refresh: false });
          }
        }}
      >
        <Trash2 /> Delete
      </Button>
    </div>
  );
}
