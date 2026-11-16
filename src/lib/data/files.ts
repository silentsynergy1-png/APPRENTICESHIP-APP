import "server-only";
import type { AppContext } from "@/lib/auth";

/** Short-lived signed URLs for private files. Never exposes a public bucket URL. */
export async function signedUrls(ctx: AppContext, paths: string[], expiresIn = 3600): Promise<Record<string, string>> {
  const unique = [...new Set(paths.filter(Boolean))];
  if (!unique.length) return {};
  const { data } = await ctx.supabase.storage.from("user-files").createSignedUrls(unique, expiresIn);
  const out: Record<string, string> = {};
  for (const item of data ?? []) if (item.signedUrl && item.path) out[item.path] = item.signedUrl;
  return out;
}
