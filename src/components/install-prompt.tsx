"use client";

import { useEffect, useState } from "react";
import { Download, PlusSquare, Share, X } from "lucide-react";
import { LogoMark } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/overlay";

/** Chrome/Edge/Samsung Internet fire this when the PWA is installable. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "aos.install-dismissed-at";
const SNOOZE_DAYS = 14;

function isStandalone() {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos() {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
}

function recentlyDismissed() {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
    return at > 0 && Date.now() - at < SNOOZE_DAYS * 86_400_000;
  } catch {
    return false;
  }
}

type Mode = "android" | "ios" | null;

/** Hook shared by the banner and the Settings button. */
function useInstall() {
  const [mode, setMode] = useState<Mode>(null);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    if (isStandalone()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of display mode after hydration
      setInstalled(true);
      return;
    }
    if (isIos()) setMode("ios");
    const onPrompt = (e: Event) => {
      e.preventDefault(); // we show our own, friendlier prompt
      setDeferred(e as BeforeInstallPromptEvent);
      setMode("android");
    };
    const onInstalled = () => {
      setInstalled(true);
      setMode(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function installAndroid() {
    if (!deferred) return false;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    setDeferred(null);
    if (outcome === "accepted") setMode(null);
    return outcome === "accepted";
  }

  return { mode, installed, installAndroid };
}

function IosSteps() {
  return (
    <ol className="grid gap-3 text-[14px]">
      <li className="flex items-center gap-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
          <Share className="size-4" />
        </span>
        <span>
          Tap the <strong>Share</strong> button in Safari&apos;s toolbar
        </span>
      </li>
      <li className="flex items-center gap-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
          <PlusSquare className="size-4" />
        </span>
        <span>
          Scroll down and choose <strong>Add to Home Screen</strong>
        </span>
      </li>
      <li className="flex items-center gap-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
          <LogoMark className="size-5" />
        </span>
        <span>
          Open <strong>Apprentice OS</strong> from your home screen
        </span>
      </li>
    </ol>
  );
}

/**
 * Friendly install banner for the signed-in app. Android/Chrome gets a one-tap install
 * (the browser's own prompt); iPhone gets two-step Add to Home Screen instructions.
 * Hidden when already installed, and snoozed for two weeks after "Not now".
 */
export function InstallPrompt() {
  const { mode, installed, installAndroid } = useInstall();
  const [visible, setVisible] = useState(false);
  const [iosOpen, setIosOpen] = useState(false);

  useEffect(() => {
    if (!mode || installed || recentlyDismissed()) return;
    // Give people a moment to land before asking.
    const t = setTimeout(() => setVisible(true), 2500);
    return () => clearTimeout(t);
  }, [mode, installed]);

  function dismiss() {
    setVisible(false);
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {}
  }

  if (!visible || !mode) return null;
  return (
    <>
      <div
        role="dialog"
        aria-label="Install Apprentice OS"
        className="fixed inset-x-3 bottom-20 z-40 mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-border bg-popover p-3 shadow-pop animate-in fade-in slide-in-from-bottom-4 lg:bottom-6 lg:left-auto lg:right-6 lg:mx-0"
      >
        <LogoMark className="size-10 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-semibold">Install Apprentice OS</div>
          <div className="text-[12.5px] text-muted-foreground">One tap from your home screen, full-screen like a normal app.</div>
        </div>
        <Button
          size="sm"
          onClick={async () => {
            if (mode === "android") {
              const ok = await installAndroid();
              if (ok) setVisible(false);
            } else setIosOpen(true);
          }}
        >
          <Download /> Install
        </Button>
        <button type="button" aria-label="Not now" onClick={dismiss} className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted">
          <X className="size-4" />
        </button>
      </div>
      <Dialog open={iosOpen} onOpenChange={setIosOpen}>
        <DialogContent title="Add to your home screen" description="Two quick steps in Safari.">
          <IosSteps />
          <p className="mt-4 text-[12.5px] text-muted-foreground">On iPhone this only works in Safari. If you&apos;re in another browser, open this page in Safari first.</p>
          <Button className="mt-5 w-full" size="lg" onClick={() => { setIosOpen(false); dismiss(); }}>
            Got it
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Always-available install option for Settings, even after the banner was dismissed. */
export function InstallAppCard() {
  const { mode, installed, installAndroid } = useInstall();
  const [iosOpen, setIosOpen] = useState(false);
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-[13px] text-muted-foreground">
        {installed
          ? "You're using the installed app. 👍"
          : mode === "android"
            ? "Add Apprentice OS to your home screen for one-tap access."
            : mode === "ios"
              ? "On iPhone, add it to your home screen from Safari."
              : "Open Apprentice OS on your phone (Chrome on Android, Safari on iPhone) to install it to your home screen."}
      </p>
      {!installed && mode ? (
        <Button variant="outline" onClick={() => (mode === "android" ? void installAndroid() : setIosOpen(true))}>
          <Download /> Install app
        </Button>
      ) : null}
      <Dialog open={iosOpen} onOpenChange={setIosOpen}>
        <DialogContent title="Add to your home screen" description="Two quick steps in Safari.">
          <IosSteps />
          <Button className="mt-5 w-full" size="lg" onClick={() => setIosOpen(false)}>
            Got it
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
