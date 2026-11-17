import Link from "next/link";
import type { Metadata } from "next";
import { Logo } from "@/components/brand";
import { isAiEnabled } from "@/lib/ai/config";

export const metadata: Metadata = { title: "Privacy & location" };

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-2xl px-5 py-14">
      <Link href="/">
        <Logo />
      </Link>
      <h1 className="mt-10 text-3xl font-semibold tracking-tight">Privacy & location</h1>
      <p className="mt-3 text-muted-foreground">A plain-English summary of how Apprentice OS handles your information.</p>

      <div className="mt-10 space-y-8 text-[15px] leading-relaxed">
        <section>
          <h2 className="text-lg font-semibold">Location</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-muted-foreground">
            <li>Location is read only when you press Clock in, Clock out or Update location. Apprentice OS never tracks you in the background or throughout the day.</li>
            <li>We store the coordinates, the GPS accuracy (in metres), the time they were captured, and whether the address was detected by GPS or typed by you.</li>
            <li>Coordinates are sent from our server to a reverse-geocoding provider to look up an approximate address. That address is an estimate, not a verified property.</li>
            <li>You can turn location off in Settings and still clock in. You can correct an address, or remove location data from any session.</li>
            <li>Your employer can&apos;t see your location or any other records. Sharing with employers would need a separate feature that you explicitly opt in to.</li>
          </ul>
        </section>
        <section>
          <h2 className="text-lg font-semibold">Your records</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-muted-foreground">
            <li>Timesheets, diary entries, tools, expenses and documents are private to your account. Access is enforced in the database with row-level security.</li>
            <li>Files are stored privately and are only shown through short-lived links.</li>
            <li>Changes to timesheet times are kept in an audit trail so you can show what changed and when.</li>
            <li>You can download all of your data, or permanently delete your account, from Settings.</li>
            <li>Expenses are never automatically marked as tax-deductible. Check with a registered tax agent.</li>
          </ul>
        </section>
        {isAiEnabled() ? (
          <section>
            <h2 className="text-lg font-semibold">AI features</h2>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-muted-foreground">
              <li>When you use an AI feature, the text or image you submit is sent to our AI provider to produce a response. We don&apos;t use it for anything else.</li>
              <li>AI output can be wrong. It never replaces qualified supervision, official training, Australian Standards or a professional safety assessment.</li>
            </ul>
          </section>
        ) : null}
      </div>
    </div>
  );
}
