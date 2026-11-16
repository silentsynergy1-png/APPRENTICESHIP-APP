import type { Metadata } from "next";
import Link from "next/link";
import { Download, ShieldCheck } from "lucide-react";
import { requireAppContext } from "@/lib/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DeleteAccount } from "./delete-account";

export const metadata: Metadata = { title: "Privacy & data" };

export default async function DataPage() {
  await requireAppContext();
  const deletionConfigured = Boolean(process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY);
  return (
    <div className="grid gap-5">
      <Card>
        <CardHeader>
          <div>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-success" /> How your data is handled
            </CardTitle>
            <CardDescription>
              Your records are private to your account and protected in the database itself. Location is only captured when you clock in, clock out
              or ask. <Link href="/privacy" className="text-primary underline">Read the full summary</Link>.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent />
      </Card>
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Download your data</CardTitle>
            <CardDescription>
              Everything in your account as a JSON file: timesheets, location records, diary, progress, tools, expenses, documents (as a file list) and AI conversations.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <a href="/api/export/all">
              <Download /> Download everything
            </a>
          </Button>
        </CardContent>
      </Card>
      <Card className="border-destructive/30">
        <CardHeader>
          <div>
            <CardTitle>Delete account</CardTitle>
            <CardDescription>Permanently deletes your account, every record and every uploaded file. This can&apos;t be undone.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <DeleteAccount configured={deletionConfigured} />
        </CardContent>
      </Card>
    </div>
  );
}
