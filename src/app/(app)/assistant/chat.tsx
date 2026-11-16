"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUp, Bookmark, BookmarkCheck, Bot, Copy, Loader2, ShieldAlert, Square } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Markdown } from "@/components/markdown";
import { useActionCall } from "@/components/action-form";
import { cn } from "@/lib/utils";
import { toggleSavedMessage } from "./actions";

export interface ChatMessage {
  id?: string;
  role: "user" | "assistant";
  content: string;
  saved?: boolean;
}

const MODES = [
  { value: "chat", label: "Ask" },
  { value: "explain", label: "Explain simply" },
  { value: "quiz", label: "Practice quiz" },
  { value: "flashcards", label: "Flashcards" },
  { value: "notes", label: "Study notes" },
  { value: "summarise", label: "Summarise" },
  { value: "tafe", label: "Plan TAFE study" },
] as const;

const ELECTRICAL_STARTERS = [
  { mode: "explain", text: "What's the difference between an RCD and a circuit breaker?" },
  { mode: "quiz", text: "Quiz me on voltage drop calculations" },
  { mode: "flashcards", text: "Flashcards for common cable types and their uses" },
  { mode: "notes", text: "Study notes on the MEN system" },
] as const;

const GENERAL_STARTERS = [
  { mode: "explain", text: "Explain a concept from this week's TAFE block in simple terms" },
  { mode: "quiz", text: "Quiz me on the tools and safety basics for my trade" },
  { mode: "flashcards", text: "Make flashcards for common terms in my trade" },
  { mode: "tafe", text: "Help me plan my study for an upcoming assessment" },
] as const;

export function Chat({ conversationId, initial, trade }: { conversationId: string | null; initial: ChatMessage[]; trade: string }) {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>(initial);
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<(typeof MODES)[number]["value"]>("chat");
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const { run } = useActionCall();

  // eslint-disable-next-line react-hooks/set-state-in-effect -- sync when navigating between conversations
  useEffect(() => setMessages(initial), [conversationId, initial]);
  useEffect(() => bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }), [messages]);

  async function send(text: string, m = mode) {
    const content = text.trim();
    if (!content || streaming) return;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content }, { role: "assistant", content: "" }]);
    setStreaming(true);
    const controller = new AbortController();
    abortRef.current = controller;
    let newId: string | null = conversationId;
    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: conversationId ?? undefined, message: content, mode: m }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setMessages((prev) => [...prev.slice(0, -1), { role: "assistant", content: `_${j.error ?? "The assistant isn't available right now."}_` }]);
        setStreaming(false);
        return;
      }
      newId = res.headers.get("X-Conversation-Id");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        setMessages((prev) => {
          const last = prev[prev.length - 1]!;
          return [...prev.slice(0, -1), { ...last, content: last.content + chunk }];
        });
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") toast.error("Connection lost. Your message may not have been answered.");
    }
    setStreaming(false);
    abortRef.current = null;
    if (newId && newId !== conversationId) router.replace(`/assistant?c=${newId}`);
    else router.refresh();
  }

  return (
    <div className="flex min-h-[calc(100dvh-14rem)] flex-col lg:min-h-[calc(100dvh-12rem)]">
      <div className="flex-1 space-y-5 pb-4">
        {messages.length === 0 ? (
          <div className="mx-auto max-w-xl py-8 text-center">
            <div className="mx-auto mb-4 grid size-12 place-items-center rounded-2xl bg-primary-soft text-primary">
              <Bot className="size-5" />
            </div>
            <h2 className="text-lg font-semibold tracking-tight">Your {trade.toLowerCase()} study mate</h2>
            <p className="mt-1 text-[14px] text-muted-foreground">Ask about concepts, terminology or TAFE topics, or turn your notes into quizzes and flashcards.</p>
            <div className="mt-6 grid gap-2 sm:grid-cols-2">
              {(trade === "Electrical" ? ELECTRICAL_STARTERS : GENERAL_STARTERS).map((s) => (
                <button
                  key={s.text}
                  type="button"
                  onClick={() => {
                    setMode(s.mode);
                    void send(s.text, s.mode);
                  }}
                  className="rounded-xl border border-border bg-card p-3 text-left text-[13.5px] shadow-soft hover:bg-subtle"
                >
                  {s.text}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) =>
            m.role === "user" ? (
              <div key={i} className="flex justify-end">
                <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-[14.5px] text-primary-foreground">{m.content}</div>
              </div>
            ) : (
              <div key={i} className="flex gap-3">
                <div className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
                  <Bot className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  {m.content ? <Markdown>{m.content}</Markdown> : <Loader2 className="mt-1 size-4 animate-spin text-muted-foreground" />}
                  {m.content && !(streaming && i === messages.length - 1) ? (
                    <div className="mt-2 flex gap-1 text-muted-foreground">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          void navigator.clipboard.writeText(m.content);
                          toast.success("Copied");
                        }}
                      >
                        <Copy /> Copy
                      </Button>
                      {m.id ? (
                        <Button size="sm" variant="ghost" onClick={() => run(() => toggleSavedMessage(m.id!, !m.saved))}>
                          {m.saved ? <BookmarkCheck className="text-primary" /> : <Bookmark />} {m.saved ? "Saved" : "Save"}
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            ),
          )
        )}
        <div ref={bottomRef} />
      </div>

      <div className="sticky bottom-16 z-10 -mx-4 border-t border-border bg-background/90 px-4 pb-3 pt-3 backdrop-blur-md sm:mx-0 sm:rounded-2xl sm:border sm:px-3 lg:bottom-4">
        <div className="mb-2 flex gap-1.5 overflow-x-auto scrollbar-none">
          {MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              onClick={() => setMode(m.value)}
              className={cn("shrink-0 rounded-full border px-2.5 py-1 text-[12px]", mode === m.value ? "border-primary/40 bg-primary-soft text-primary" : "border-border text-muted-foreground")}
            >
              {m.label}
            </button>
          ))}
        </div>
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(input);
              }
            }}
            rows={1}
            maxLength={8000}
            placeholder={mode === "summarise" ? "Paste your study material…" : "Ask anything about your trade…"}
            className="max-h-40 min-h-11 flex-1 resize-none rounded-xl border border-input bg-card px-3.5 py-2.5 text-[15px] shadow-soft outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/25 sm:text-sm"
            aria-label="Message"
          />
          {streaming ? (
            <Button type="button" size="icon" variant="outline" aria-label="Stop" onClick={() => abortRef.current?.abort()}>
              <Square className="size-3.5 fill-current" />
            </Button>
          ) : (
            <Button type="submit" size="icon" aria-label="Send" disabled={!input.trim()}>
              <ArrowUp />
            </Button>
          )}
        </form>
        <p className="mt-2 flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
          <ShieldAlert className="size-3.5 shrink-0" /> AI can be wrong. It doesn&apos;t replace your supervisor, your training or the standards.{" "}
          <Link href="/privacy" className="underline">
            More
          </Link>
        </p>
      </div>
    </div>
  );
}
