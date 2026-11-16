import Link from "next/link";
import type { Metadata } from "next";
import { Bookmark, MessageSquare, Plus } from "lucide-react";
import { z } from "zod";
import { requireAppContext } from "@/lib/auth";
import { getAnthropic, tradeLabel } from "@/lib/ai/client";
import { UpgradeGate } from "@/components/upgrade-gate";
import { Button } from "@/components/ui/button";
import { Alert, PageHeader } from "@/components/ui/misc";
import { Card } from "@/components/ui/card";
import { Markdown } from "@/components/markdown";
import type { AiConversation, AiMessage } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Chat, type ChatMessage } from "./chat";
import { DeleteConversationButton } from "./delete-conversation";

export const metadata: Metadata = { title: "AI Assistant" };

export default async function AssistantPage({ searchParams }: { searchParams: Promise<{ c?: string; saved?: string }> }) {
  const ctx = await requireAppContext();
  if (!ctx.entitlements.has("ai_assistant")) {
    return (
      <UpgradeGate
        title="AI Assistant"
        description="Your trade-savvy study mate."
        points={["Explains concepts in plain language", "Practice quizzes and flashcards", "Study notes and TAFE planning", "Saves useful answers for revision"]}
      />
    );
  }
  const sp = await searchParams;
  const convId = sp.c && z.uuid().safeParse(sp.c).success ? sp.c : null;
  const savedView = sp.saved === "1";

  const [{ data: convs }, msgsRes, savedRes] = await Promise.all([
    ctx.supabase.from("ai_conversations").select("id, title, updated_at").order("updated_at", { ascending: false }).limit(50),
    convId ? ctx.supabase.from("ai_messages").select("*").eq("conversation_id", convId).order("created_at") : Promise.resolve({ data: [] as AiMessage[] }),
    savedView ? ctx.supabase.from("ai_messages").select("*").eq("saved", true).order("created_at", { ascending: false }).limit(100) : Promise.resolve({ data: [] as AiMessage[] }),
  ]);
  const conversations = (convs ?? []) as AiConversation[];
  const messages: ChatMessage[] = ((msgsRes.data ?? []) as AiMessage[]).map((m) => ({ id: m.id, role: m.role, content: m.content, saved: m.saved }));
  const configured = Boolean(getAnthropic());

  return (
    <div>
      <PageHeader title="AI Assistant" description={`Study help for ${tradeLabel(ctx.profile.trade).toLowerCase()} apprentices, in Australian terms.`} />
      {!configured ? (
        <Alert tone="warning" className="mb-5" title="AI isn't set up yet">
          The server is missing its ANTHROPIC_API_KEY, so the assistant can&apos;t answer yet. Add the key and redeploy (see README).
        </Alert>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
        <aside className="space-y-3">
          <Button asChild className="w-full">
            <Link href="/assistant">
              <Plus /> New chat
            </Link>
          </Button>
          <Link href="/assistant?saved=1" className={cn("flex items-center gap-2 rounded-lg px-3 py-2 text-[13.5px] font-medium text-muted-foreground hover:bg-muted", savedView && "bg-card text-foreground shadow-soft ring-1 ring-border")}>
            <Bookmark className="size-4" /> Saved answers
          </Link>
          <nav className="-mx-4 flex gap-1.5 overflow-x-auto px-4 scrollbar-none lg:mx-0 lg:block lg:space-y-0.5 lg:px-0" aria-label="Conversations">
            {conversations.map((c) => (
              <div key={c.id} className={cn("group flex shrink-0 items-center rounded-lg lg:shrink", c.id === convId ? "bg-card shadow-soft ring-1 ring-border" : "hover:bg-muted")}>
                <Link href={`/assistant?c=${c.id}`} className="flex min-w-0 max-w-56 flex-1 items-center gap-2 px-3 py-2 text-[13px] lg:max-w-none">
                  <MessageSquare className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">{c.title}</span>
                </Link>
                <DeleteConversationButton id={c.id} active={c.id === convId} />
              </div>
            ))}
          </nav>
        </aside>
        <div className="min-w-0">
          {savedView ? (
            (savedRes.data ?? []).length ? (
              <div className="grid gap-4">
                {(savedRes.data as AiMessage[]).map((m) => (
                  <Card key={m.id} className="p-5">
                    <Markdown>{m.content}</Markdown>
                    <Link href={`/assistant?c=${m.conversation_id}`} className="mt-3 inline-block text-[12.5px] text-primary hover:underline">
                      Open conversation →
                    </Link>
                  </Card>
                ))}
              </div>
            ) : (
              <p className="rounded-2xl border border-dashed border-border p-8 text-center text-[13px] text-muted-foreground">Save useful answers with the bookmark button and they&apos;ll collect here for revision.</p>
            )
          ) : (
            <Chat key={convId ?? "new"} conversationId={convId} initial={messages} trade={tradeLabel(ctx.profile.trade)} />
          )}
        </div>
      </div>
    </div>
  );
}
