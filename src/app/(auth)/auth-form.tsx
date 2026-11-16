"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, MailCheck } from "lucide-react";
import { getBrowserClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/misc";

type Mode = "login" | "signup" | "forgot";

function safeNext(next: string | null): string {
  // Only allow same-site relative paths to avoid open redirects.
  if (next && next.startsWith("/") && !next.startsWith("//")) return next;
  return "/dashboard";
}

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(params.get("error"));
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email") ?? "").trim();
    const password = String(fd.get("password") ?? "");
    const fullName = String(fd.get("full_name") ?? "").trim();
    if (!email) return setError("Enter your email address.");
    if (mode !== "forgot" && password.length < 8) return setError("Passwords need at least 8 characters.");

    setPending(true);
    const supabase = getBrowserClient();
    const origin = window.location.origin;
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.replace(safeNext(params.get("next")));
        router.refresh();
      } else if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName.slice(0, 120) },
            emailRedirectTo: `${origin}/auth/confirm?next=/onboarding`,
          },
        });
        if (error) throw error;
        if (data.session) {
          router.replace("/onboarding");
          router.refresh();
        } else {
          setSent(true);
        }
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${origin}/auth/confirm?next=/reset-password`,
        });
        if (error) throw error;
        setSent(true);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      setError(
        /invalid login/i.test(msg)
          ? "That email and password don't match."
          : /already registered/i.test(msg)
            ? "An account with that email already exists. Try signing in."
            : /rate limit/i.test(msg)
              ? "Too many attempts. Wait a minute and try again."
              : msg || "Something went wrong. Please try again.",
      );
    } finally {
      setPending(false);
    }
  }

  if (sent) {
    return (
      <div className="text-center">
        <div className="mx-auto mb-5 grid size-12 place-items-center rounded-2xl bg-primary-soft text-primary">
          <MailCheck className="size-5" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Check your email</h1>
        <p className="mt-2 text-[14px] text-muted-foreground">
          {mode === "signup"
            ? "We've sent a confirmation link. Open it on this device to finish creating your account."
            : "If an account exists for that email, we've sent a link to reset your password."}
        </p>
        <Button asChild variant="outline" className="mt-6">
          <Link href="/login">Back to sign in</Link>
        </Button>
      </div>
    );
  }

  const copy = {
    login: { title: "Welcome back", sub: "Sign in to Apprentice OS.", cta: "Sign in" },
    signup: { title: "Create your account", sub: "Free forever plan. Takes under a minute.", cta: "Create account" },
    forgot: { title: "Reset your password", sub: "We'll email you a secure reset link.", cta: "Send reset link" },
  }[mode];

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">{copy.title}</h1>
      <p className="mt-1.5 text-[14px] text-muted-foreground">{copy.sub}</p>
      <form onSubmit={onSubmit} className="mt-8 grid gap-4" noValidate>
        {error ? <Alert tone="danger">{error}</Alert> : null}
        {mode === "signup" ? (
          <Field label="Your name" htmlFor="full_name">
            <Input id="full_name" name="full_name" autoComplete="name" maxLength={120} placeholder="Jordan Smith" />
          </Field>
        ) : null}
        <Field label="Email" htmlFor="email">
          <Input id="email" name="email" type="email" autoComplete="email" inputMode="email" required placeholder="you@example.com" />
        </Field>
        {mode !== "forgot" ? (
          <Field
            label="Password"
            htmlFor="password"
            hint={mode === "signup" ? "At least 8 characters." : undefined}
          >
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              required
              minLength={8}
            />
          </Field>
        ) : null}
        <Button type="submit" size="lg" disabled={pending} className="mt-2">
          {pending ? <Loader2 className="animate-spin" /> : null}
          {copy.cta}
        </Button>
      </form>
      <div className="mt-6 flex flex-col gap-2 text-center text-[13px] text-muted-foreground">
        {mode === "login" ? (
          <>
            <Link href="/forgot-password" className="hover:text-foreground">
              Forgot your password?
            </Link>
            <span>
              New here?{" "}
              <Link href="/signup" className="font-medium text-primary hover:underline">
                Create an account
              </Link>
            </span>
          </>
        ) : (
          <span>
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-primary hover:underline">
              Sign in
            </Link>
          </span>
        )}
      </div>
      {mode === "signup" ? (
        <p className="mt-6 text-center text-[12px] leading-relaxed text-muted-foreground">
          By creating an account you agree to how we handle your data, described in{" "}
          <Link href="/privacy" className="underline">
            Privacy & location
          </Link>
          .
        </p>
      ) : null}
    </div>
  );
}
