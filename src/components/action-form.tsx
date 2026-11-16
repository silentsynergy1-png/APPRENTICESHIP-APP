"use client";

import { createContext, useContext, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Alert } from "@/components/ui/misc";
import { cn } from "@/lib/utils";

export type ClientActionResult<T = unknown> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string>; upgrade?: boolean };

const FormCtx = createContext<{ pending: boolean; fieldErrors: Record<string, string> }>({ pending: false, fieldErrors: {} });

export function useFormState() {
  return useContext(FormCtx);
}

/**
 * Small wrapper for forms backed by server actions: pending state, field errors,
 * a toast on success, and optional redirect / refresh.
 */
export function ActionForm<T>({
  action,
  children,
  className,
  successMessage,
  redirectTo,
  onSuccess,
  resetOnSuccess = false,
  refresh = true,
}: {
  action: (fd: FormData) => Promise<ClientActionResult<T>>;
  children: React.ReactNode;
  className?: string;
  successMessage?: string | ((data: T) => string);
  redirectTo?: string | ((data: T) => string);
  onSuccess?: (data: T) => void;
  resetOnSuccess?: boolean;
  refresh?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<{ message: string; upgrade?: boolean } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    start(async () => {
      setError(null);
      setFieldErrors({});
      const res = await action(fd);
      if (!res.ok) {
        setError({ message: res.error, upgrade: res.upgrade });
        setFieldErrors(res.fieldErrors ?? {});
        return;
      }
      const msg = typeof successMessage === "function" ? successMessage(res.data) : (successMessage ?? res.message);
      if (msg) toast.success(msg);
      if (resetOnSuccess) form.reset();
      onSuccess?.(res.data);
      if (redirectTo) router.push(typeof redirectTo === "function" ? redirectTo(res.data) : redirectTo);
      else if (refresh) router.refresh();
    });
  }

  return (
    <FormCtx.Provider value={{ pending, fieldErrors }}>
      <form onSubmit={onSubmit} className={cn("grid gap-4", className)} noValidate>
        {error ? (
          <Alert tone={error.upgrade ? "primary" : "danger"}>
            {error.message}
            {error.upgrade ? (
              <>
                {" "}
                <Link href="/settings/plan" className="font-medium text-primary underline">
                  See Pro
                </Link>
              </>
            ) : null}
          </Alert>
        ) : null}
        {children}
      </form>
    </FormCtx.Provider>
  );
}

export function SubmitButton({ children, className, ...props }: ButtonProps) {
  const { pending } = useFormState();
  return (
    <Button type="submit" disabled={pending || props.disabled} className={className} {...props}>
      {pending ? <Loader2 className="animate-spin" /> : null}
      {children}
    </Button>
  );
}

export function FieldError({ name }: { name: string }) {
  const { fieldErrors } = useFormState();
  const msg = fieldErrors[name];
  if (!msg) return null;
  return (
    <p className="text-[12px] text-destructive" role="alert">
      {msg}
    </p>
  );
}

/** Calls a server action from a button (non-form) with pending state and toasts. */
export function useActionCall() {
  const router = useRouter();
  const [pending, start] = useTransition();
  function run<T>(
    fn: () => Promise<ClientActionResult<T>>,
    opts: { success?: string; onSuccess?: (d: T) => void; refresh?: boolean } = {},
  ) {
    start(async () => {
      const res = await fn();
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      if (opts.success ?? res.message) toast.success(opts.success ?? res.message);
      opts.onSuccess?.(res.data);
      if (opts.refresh !== false) router.refresh();
    });
  }
  return { pending, run };
}
