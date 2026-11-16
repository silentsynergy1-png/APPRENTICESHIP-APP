import Link from "next/link";
import { Logo } from "@/components/brand";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_480px] xl:grid-cols-[1fr_560px]">
      <div className="hidden flex-col justify-between border-r border-border bg-subtle p-10 lg:flex">
        <Link href="/">
          <Logo />
        </Link>
        <div className="max-w-md">
          <p className="text-2xl font-semibold leading-snug tracking-tight">
            “Hours, diary, tools and TAFE, all in one spot. I just clock in and get on with it.”
          </p>
          <p className="mt-4 text-[13px] text-muted-foreground">How Apprentice OS is meant to feel.</p>
        </div>
        <p className="text-[12px] text-muted-foreground">Made for Australian trade apprentices.</p>
      </div>
      <div className="flex flex-col px-5 py-8 sm:px-10">
        <Link href="/" className="lg:hidden">
          <Logo />
        </Link>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">{children}</div>
      </div>
    </div>
  );
}
