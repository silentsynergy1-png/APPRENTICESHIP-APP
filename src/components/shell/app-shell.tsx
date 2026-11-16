"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, LogOut, Menu, Play, Sparkles, Timer } from "lucide-react";
import { Logo, LogoMark } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { ClockPanel, type ClockPanelProps } from "@/components/clock/clock-panel";
import { Dialog, DialogContent } from "@/components/ui/overlay";
import { cn, initials } from "@/lib/utils";
import type { Feature } from "@/lib/plans";
import { MOBILE_PRIMARY, NAV_ITEMS } from "./nav-items";
import { OfflineSync } from "@/components/offline-sync";

export interface ShellProps {
  user: { id: string; name: string | null; tier: "free" | "pro" };
  unreadCount: number;
  features: Feature[];
  clock: ClockPanelProps;
  children: React.ReactNode;
}

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

export function AppShell({ user, unreadCount, features, clock, children }: ShellProps) {
  const pathname = usePathname();
  const [clockOpen, setClockOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const active = Boolean(clock.session);

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[260px_1fr]">
      {/* ------------------------------ Sidebar ------------------------------ */}
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-border bg-sidebar lg:flex">
        <div className="flex h-16 items-center px-5">
          <Link href="/dashboard" aria-label="Apprentice OS home">
            <Logo />
          </Link>
        </div>

        <button
          type="button"
          onClick={() => setClockOpen(true)}
          className={cn(
            "mx-3 mb-4 flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-[13px] transition-colors",
            active ? "border-success/30 bg-success-soft/60 hover:bg-success-soft" : "border-border bg-card shadow-soft hover:bg-muted",
          )}
        >
          <span className={cn("grid size-8 place-items-center rounded-lg text-white", active ? "bg-success" : "bg-primary")}>
            {active ? <Timer className="size-4" /> : <Play className="size-3.5 fill-current" />}
          </span>
          <span className="min-w-0">
            <span className="block font-medium">{active ? "On the clock" : "Clock in"}</span>
            <span className="block truncate text-[12px] text-muted-foreground">
              {active ? "Manage your session" : "Start your workday"}
            </span>
          </span>
        </button>

        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-4" aria-label="Main">
          {NAV_ITEMS.map((item) => {
            const on = isActive(pathname, item.href);
            const locked = item.feature && !features.includes(item.feature);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "group flex items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                  on && "bg-card text-foreground shadow-soft ring-1 ring-border hover:bg-card",
                )}
              >
                <item.icon className={cn("size-4", on ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
                <span className="flex-1">{item.label}</span>
                {locked ? (
                  <span className="rounded-md bg-primary-soft px-1.5 py-px text-[10px] font-semibold tracking-wide text-primary">PRO</span>
                ) : null}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-border p-3">
          {user.tier === "free" ? (
            <Link
              href="/settings/plan"
              className="mb-3 flex items-center gap-2 rounded-xl bg-primary-soft/60 px-3 py-2.5 text-[12.5px] font-medium text-primary hover:bg-primary-soft"
            >
              <Sparkles className="size-4" /> Explore Pro
            </Link>
          ) : null}
          <div className="flex items-center gap-3 px-1">
            <div className="grid size-8 place-items-center rounded-full bg-muted text-[12px] font-semibold">{initials(user.name)}</div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-medium">{user.name ?? "Apprentice"}</div>
              <div className="truncate text-[11.5px] text-muted-foreground">{user.tier === "pro" ? "Pro plan" : "Free plan"}</div>
            </div>
            <form action="/auth/signout" method="post">
              <button
                className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Sign out"
                title="Sign out"
              >
                <LogOut className="size-4" />
              </button>
            </form>
          </div>
          <div className="mt-3 flex items-center justify-between px-1 text-[12px] text-muted-foreground">
            Theme <ThemeToggle />
          </div>
        </div>
      </aside>

      {/* ------------------------------- Main -------------------------------- */}
      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-background/85 px-4 backdrop-blur-md lg:h-16 lg:px-8">
          <Link href="/dashboard" className="lg:hidden" aria-label="Home">
            <LogoMark />
          </Link>
          <div className="hidden lg:block" />
          <div className="flex items-center gap-1.5">
            {active ? (
              <button
                type="button"
                onClick={() => setClockOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-2.5 py-1 text-[12px] font-medium text-success lg:hidden"
              >
                <span className="relative size-1.5 rounded-full bg-success text-success live-dot" /> On the clock
              </button>
            ) : null}
            <Link
              href="/notifications"
              className="relative grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`}
            >
              <Bell className="size-[18px]" />
              {unreadCount > 0 ? (
                <span className="absolute right-1 top-1 grid min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-4 text-white">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              ) : null}
            </Link>
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-32 pt-6 sm:px-6 lg:px-8 lg:pb-12 lg:pt-8">{children}</main>
      </div>

      {/* ---------------------------- Mobile nav ----------------------------- */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/90 pb-safe backdrop-blur-lg lg:hidden" aria-label="Main">
        <div className="mx-auto grid h-16 max-w-md grid-cols-5 items-center">
          <MobileLink href={MOBILE_PRIMARY[0]} pathname={pathname} />
          <MobileLink href={MOBILE_PRIMARY[1]} pathname={pathname} />
          <div className="grid place-items-center">
            <button
              type="button"
              onClick={() => setClockOpen(true)}
              aria-label={active ? "Manage current session" : "Clock in"}
              className={cn(
                "-mt-7 grid size-[60px] place-items-center rounded-2xl text-white shadow-pop ring-4 ring-background transition-transform active:scale-95",
                active ? "bg-success" : "bg-primary",
              )}
            >
              {active ? <Timer className="size-6" /> : <Play className="size-6 fill-current" />}
            </button>
          </div>
          <MobileLink href={MOBILE_PRIMARY[2]} pathname={pathname} />
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className="flex h-full flex-col items-center justify-center gap-1 text-[10.5px] font-medium text-muted-foreground"
          >
            <Menu className="size-5" />
            More
          </button>
        </div>
      </nav>

      <OfflineSync userId={user.id} />

      <Dialog open={clockOpen} onOpenChange={setClockOpen}>
        <DialogContent title={active ? "Current session" : "Clock in"}>
          <ClockPanel {...clock} variant="sheet" />
        </DialogContent>
      </Dialog>

      <Dialog open={moreOpen} onOpenChange={setMoreOpen}>
        <DialogContent title="Menu">
          <div className="grid grid-cols-3 gap-2">
            {NAV_ITEMS.filter((i) => !(MOBILE_PRIMARY as readonly string[]).includes(i.href)).map((item) => {
              const locked = item.feature && !features.includes(item.feature);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMoreOpen(false)}
                  className={cn(
                    "relative flex flex-col items-center gap-2 rounded-2xl border border-border bg-card px-2 py-3.5 text-center text-[12px] font-medium shadow-soft active:scale-[0.97]",
                    isActive(pathname, item.href) && "border-primary/40 bg-primary-soft/40",
                  )}
                >
                  <item.icon className="size-5 text-primary" />
                  {item.label}
                  {locked ? <span className="absolute right-1.5 top-1.5 text-[9px] font-semibold text-primary">PRO</span> : null}
                </Link>
              );
            })}
          </div>
          <div className="mt-5 flex items-center justify-between rounded-2xl border border-border p-3">
            <div className="min-w-0">
              <div className="truncate text-[14px] font-medium">{user.name ?? "Apprentice"}</div>
              <div className="truncate text-[12px] text-muted-foreground">{user.tier === "pro" ? "Pro plan" : "Free plan"}</div>
            </div>
            <ThemeToggle />
          </div>
          <form action="/auth/signout" method="post" className="mt-3">
            <button className="flex w-full items-center justify-center gap-2 rounded-xl py-3 text-[14px] font-medium text-muted-foreground hover:bg-muted">
              <LogOut className="size-4" /> Sign out
            </button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MobileLink({ href, pathname }: { href: string; pathname: string }) {
  const item = NAV_ITEMS.find((i) => i.href === href)!;
  const on = isActive(pathname, href);
  return (
    <Link
      href={href}
      aria-current={on ? "page" : undefined}
      className={cn("flex h-full flex-col items-center justify-center gap-1 text-[10.5px] font-medium", on ? "text-primary" : "text-muted-foreground")}
    >
      <item.icon className="size-5" />
      {item.short}
    </Link>
  );
}
