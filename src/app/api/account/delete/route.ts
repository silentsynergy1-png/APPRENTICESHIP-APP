import { NextResponse, type NextRequest } from "next/server";
import { getAppContext } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "user-files";

/** Deletes every stored file under the user's folder, then the auth user (rows cascade). */
export async function POST(request: NextRequest) {
  const ctx = await getAppContext();
  if (!ctx) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { confirm?: string };
  if (body.confirm !== "DELETE") return NextResponse.json({ error: "Confirmation text didn't match." }, { status: 400 });

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json({ error: "Account deletion isn't configured on this server." }, { status: 503 });
  }

  // Storage objects aren't removed by the database cascade, so delete them first.
  const { data: files } = await ctx.supabase.from("diary_photos").select("storage_path");
  const paths = new Set<string>((files ?? []).map((f) => f.storage_path as string));
  for (const table of ["receipts", "documents"] as const) {
    const { data } = await ctx.supabase.from(table).select("storage_path");
    (data ?? []).forEach((r) => paths.add(r.storage_path as string));
  }
  const { data: tools } = await ctx.supabase.from("tools").select("photo_path, receipt_path");
  (tools ?? []).forEach((t) => {
    if (t.photo_path) paths.add(t.photo_path);
    if (t.receipt_path) paths.add(t.receipt_path);
  });
  const list = [...paths].filter((p) => p.startsWith(`${ctx.userId}/`));
  for (let i = 0; i < list.length; i += 100) {
    await admin.storage.from(BUCKET).remove(list.slice(i, i + 100));
  }

  const { error } = await admin.auth.admin.deleteUser(ctx.userId);
  if (error) return NextResponse.json({ error: "Couldn't delete the account. Please try again." }, { status: 500 });
  await ctx.supabase.auth.signOut();
  return NextResponse.json({ ok: true });
}
