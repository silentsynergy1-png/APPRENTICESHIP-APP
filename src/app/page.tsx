import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  Check,
  Clock,
  FileText,
  GraduationCap,
  MapPin,
  Receipt,
  ShieldCheck,
  Sparkles,
  Wrench,
} from "lucide-react";
import { Logo } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { PLANS, planHighlights } from "@/lib/plans";
import { isAiEnabled } from "@/lib/ai/config";

const featureList = (ai: boolean) => [
  {
    icon: Clock,
    title: "One-tap clock in",
    body: "Start your day in a second. Breaks, overtime and weekend hours are worked out with your own employment rules.",
  },
  {
    icon: MapPin,
    title: "Knows your job site",
    body: "Location is captured once, only when you clock in or out, and Apprentice OS recognises sites you've been to before.",
  },
  {
    icon: BookOpen,
    title: "A diary you'll actually keep",
    body: ai
      ? "Jot rough notes on the job. AI tidies them into a professional entry without adding anything you didn't do."
      : "Jot quick notes on the job, add photos and log the skills you practised. Search every past job in seconds.",
  },
  {
    icon: GraduationCap,
    title: "See your progress",
    body: "Track units, competencies, TAFE deadlines and supervisor sign-offs, organised the way your qualification works.",
  },
  {
    icon: Wrench,
    title: "Every tool accounted for",
    body: "Serial numbers, warranties, receipts and maintenance in one searchable kit list, with its total value.",
  },
  {
    icon: Receipt,
    title: "Receipts sorted",
    body: ai
      ? "Snap a receipt and check the extracted details. Monthly reports are ready to review at tax time."
      : "Photograph receipts, sort them by category and get monthly reports ready to review at tax time.",
  },
];

export default function Landing() {
  const ai = isAiEnabled();
  const features = featureList(ai);
  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <Logo />
          <nav className="flex items-center gap-2">
            <ThemeToggle className="hidden sm:inline-flex" />
            <Button asChild variant="ghost" size="sm">
              <Link href="/login">Sign in</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/signup">Get started</Link>
            </Button>
          </nav>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-5 pb-16 pt-16 sm:pt-24">
          <div className="max-w-3xl">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-[12.5px] text-muted-foreground shadow-soft">
              <span className="size-1.5 rounded-full bg-primary" />
              Built for Australian trade apprentices
            </div>
            <h1 className="text-[40px] font-semibold leading-[1.05] tracking-tight sm:text-6xl">
              Your whole apprenticeship,
              <br className="hidden sm:block" />
              <span className="text-muted-foreground"> in your pocket.</span>
            </h1>
            <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-muted-foreground">
              Apprentice OS replaces the paper timesheets, notes app, spreadsheets and shoebox of receipts with one calm,
              fast app made for the way you actually work on site.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg">
                <Link href="/signup">
                  Start free <ArrowRight />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="#pricing">See pricing</Link>
              </Button>
            </div>
            <p className="mt-4 text-[13px] text-muted-foreground">Free forever plan · No card required</p>
          </div>
        </section>

        <section className="border-y border-border bg-subtle">
          <div className="mx-auto grid max-w-6xl gap-px overflow-hidden px-5 py-16 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <div key={f.title} className="p-5">
                <div className="mb-4 grid size-10 place-items-center rounded-xl bg-primary-soft text-primary">
                  <f.icon className="size-[18px]" />
                </div>
                <h3 className="font-semibold tracking-tight">{f.title}</h3>
                <p className="mt-1.5 text-[14px] leading-relaxed text-muted-foreground">{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-20">
          <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 text-[13px] font-medium text-primary">
                <ShieldCheck className="size-4" /> Private by design
              </div>
              <h2 className="text-3xl font-semibold tracking-tight">Your records belong to you.</h2>
              <ul className="mt-6 space-y-3 text-[15px] text-muted-foreground">
                {[
                  "Location is captured only when you clock in, clock out or ask. There's no background tracking.",
                  "Your employer can't see your data. You decide what you export and share.",
                  "Download everything or delete your account at any time.",
                  ...(ai ? ["AI suggestions are clearly marked and never replace your supervisor or the standards."] : []),
                ].map((t) => (
                  <li key={t} className="flex gap-3">
                    <Check className="mt-0.5 size-4 shrink-0 text-success" />
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-3xl border border-border bg-card p-6 shadow-card">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[12px] text-muted-foreground">Example session</div>
                  <div className="mt-1 text-lg font-semibold">Clocked in · 7:30 AM</div>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-2.5 py-1 text-[12px] font-medium text-success">
                  <span className="relative size-1.5 rounded-full bg-success live-dot text-success" /> On the clock
                </span>
              </div>
              <div className="mt-5 rounded-2xl bg-subtle p-4">
                <div className="flex items-start gap-3">
                  <MapPin className="mt-0.5 size-4 text-primary" />
                  <div className="text-[14px]">
                    <div className="font-medium">Example job site</div>
                    <div className="text-muted-foreground">Approximate address · Parramatta NSW</div>
                    <div className="mt-1 text-[12px] text-muted-foreground">GPS ±15 m · captured at clock-in only</div>
                  </div>
                </div>
              </div>
              <div className="mt-4 flex items-center gap-2 rounded-2xl border border-dashed border-border p-4 text-[13px] text-muted-foreground">
                <Sparkles className="size-4 text-primary" />
                {ai
                  ? "“Ran cable through roof space, installed 4 double GPOs” becomes a structured diary entry."
                  : "Clock out, and your diary entry is ready with the times, site and hours already filled in."}
              </div>
              <p className="mt-4 text-[11.5px] text-muted-foreground">Illustration only. This isn&apos;t live data.</p>
            </div>
          </div>
        </section>

        <section id="pricing" className="border-t border-border bg-subtle">
          <div className="mx-auto max-w-6xl px-5 py-20">
            <h2 className="text-3xl font-semibold tracking-tight">Simple pricing</h2>
            <p className="mt-2 text-muted-foreground">Start free. Upgrade when you want the full toolkit.</p>
            <div className="mt-10 grid gap-5 md:grid-cols-2">
              {(["free", "pro"] as const).map((tier) => {
                const p = PLANS[tier];
                return (
                  <div
                    key={tier}
                    className={
                      tier === "pro"
                        ? "rounded-3xl border-2 border-primary/50 bg-card p-7 shadow-card"
                        : "rounded-3xl border border-border bg-card p-7 shadow-card"
                    }
                  >
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-semibold">{p.name}</h3>
                      {tier === "pro" ? (
                        <span className="rounded-full bg-primary-soft px-2.5 py-0.5 text-[12px] font-medium text-primary">
                          Most popular
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-4 flex items-baseline gap-1">
                      <span className="text-4xl font-semibold tracking-tight">${p.priceMonthlyAud.toFixed(2)}</span>
                      <span className="text-muted-foreground">AUD / month</span>
                    </div>
                    <p className="mt-2 text-[14px] text-muted-foreground">{p.tagline}</p>
                    <ul className="mt-6 space-y-2.5 text-[14px]">
                      {planHighlights(tier, ai).map((h) => (
                        <li key={h} className="flex gap-2.5">
                          <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                          {h}
                        </li>
                      ))}
                    </ul>
                    <Button asChild className="mt-7 w-full" variant={tier === "pro" ? "default" : "outline"} size="lg">
                      <Link href="/signup">{tier === "pro" ? "Start with Free, upgrade anytime" : "Create free account"}</Link>
                    </Button>
                  </div>
                );
              })}
            </div>
            <p className="mt-6 text-[12.5px] text-muted-foreground">
              Prices in AUD. Employer plans for businesses that want to cover their apprentices are on the roadmap.
            </p>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-5 py-8 text-[13px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <Logo className="text-foreground" />
          <div className="flex items-center gap-4">
            <Link href="/privacy" className="hover:text-foreground">
              <FileText className="mr-1 inline size-3.5" />
              Privacy & location
            </Link>
            <span>© {new Date().getFullYear()} Apprentice OS</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
