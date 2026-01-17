"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import type { ChatMessage } from "@/lib/types";
import {
  createInitialMessage,
  loadMessages,
  resetMessages,
  saveMessages,
} from "@/lib/storage";

const ERROR_MESSAGES: Record<string, string> = {
  TIMEOUT: "The AI service is taking too long. Please retry.",
  AI_SERVICE_FAILED: "The AI service failed. Please retry.",
  MESSAGE_TOO_LONG: "Your message is too long. Keep it under 2000 characters.",
  EMPTY_INPUT: "Type something to continue.",
};

const buildId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
};

const createMessage = (role: ChatMessage["role"], content: string): ChatMessage => ({
  id: buildId(),
  role,
  content,
  timestamp: new Date().toISOString(),
});

export default function Home() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [inFlight, setInFlight] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryMessage, setRetryMessage] = useState<ChatMessage | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const lastAssistant = useMemo(() => {
    return [...messages].reverse().find((message) => message.role === "assistant");
  }, [messages]);

  const errorMessage = error
    ? ERROR_MESSAGES[error] ?? ERROR_MESSAGES.AI_SERVICE_FAILED
    : null;

  useEffect(() => {
    const stored = loadMessages();
    if (stored.length === 0) {
      const initial = createInitialMessage();
      setMessages([initial]);
      saveMessages([initial]);
      return;
    }
    setMessages(stored);
  }, []);

  useEffect(() => {
    if (!listRef.current) {
      return;
    }
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, inFlight]);

  const persistMessages = (nextMessages: ChatMessage[]) => {
    setMessages(nextMessages);
    saveMessages(nextMessages);
  };

  const sendMessage = async (overrideMessage?: ChatMessage) => {
    if (inFlight) {
      return;
    }

    const trimmed = (overrideMessage?.content ?? input).trim();
    if (!trimmed) {
      setError("EMPTY_INPUT");
      return;
    }

    if (trimmed.length > 2000) {
      setError("MESSAGE_TOO_LONG");
      return;
    }

    const userMessage = overrideMessage ?? createMessage("user", trimmed);
    const nextMessages = overrideMessage ? messages : [...messages, userMessage];

    if (!overrideMessage) {
      setInput("");
      setRetryMessage(userMessage);
      persistMessages(nextMessages);
    }

    setError(null);
    setInFlight(true);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages.map((message) => ({
            role: message.role,
            content: message.content,
          })),
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(payload?.error ?? "AI_SERVICE_FAILED");
      }

      const payload = (await response.json()) as {
        assistantMessage?: { role: "assistant"; content: string };
      };
      if (!payload.assistantMessage?.content) {
        throw new Error("AI_SERVICE_FAILED");
      }

      const assistantMessage = createMessage(
        "assistant",
        payload.assistantMessage.content
      );
      const updated = [...nextMessages, assistantMessage];
      persistMessages(updated);
      setRetryMessage(null);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        setError("TIMEOUT");
      } else {
        const reason = err instanceof Error ? err.message : "AI_SERVICE_FAILED";
        setError(reason);
      }
    } finally {
      clearTimeout(timeoutId);
      setInFlight(false);
    }
  };

  const handleReset = () => {
    const initial = resetMessages();
    setMessages(initial);
    saveMessages(initial);
    setInput("");
    setError(null);
    setRetryMessage(null);
    setInFlight(false);
  };

  const handleRetry = () => {
    if (!retryMessage) {
      return;
    }
    setError(null);
    sendMessage(retryMessage);
  };

  return (
    <div className="flex min-h-screen w-full flex-col bg-transparent px-10 py-10">
      <Card className="mx-auto flex w-full max-w-5xl flex-1 flex-col border-border/80 bg-card/80 shadow-2xl">
        <CardHeader className="space-y-4 pb-4">
          <div className="flex items-start justify-between gap-6">
            <div className="space-y-2">
              <Badge className="w-fit" variant="secondary">
                Mandarin Lesson Demo
              </Badge>
              <CardTitle className="text-2xl font-semibold text-foreground">
                Guided chat lesson
              </CardTitle>
              <CardDescription className="max-w-2xl text-base text-muted-foreground">
                Practice a single lesson objective with a structured teach -
                practice - correct - quiz loop. The assistant responds only after
                you send a message.
              </CardDescription>
            </div>
            <Button
              variant="outline"
              className="shrink-0"
              onClick={handleReset}
              disabled={inFlight}
            >
              Reset
            </Button>
          </div>
          <Separator />
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
            <span>Desktop-only demo - Local session storage</span>
            {inFlight ? (
              <span className="text-primary">AI is typing...</span>
            ) : lastAssistant ? (
              <span>
                Last reply - {new Date(lastAssistant.timestamp).toLocaleTimeString()}
              </span>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col gap-4" aria-live="polite">
          <div
            ref={listRef}
            className="flex h-[58vh] flex-1 flex-col gap-4 overflow-y-auto rounded-xl border border-border/70 bg-background/40 p-5 scroll-smooth"
          >
            {messages.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Loading lesson...
              </div>
            ) : (
              messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex w-full ${
                    message.role === "assistant"
                      ? "justify-start"
                      : "justify-end"
                  }`}
                >
                  <div
                    className={`max-w-[70%] whitespace-pre-wrap rounded-xl px-4 py-3 text-sm leading-relaxed shadow-sm ${
                      message.role === "assistant"
                        ? "bg-muted text-foreground"
                        : "bg-primary text-primary-foreground"
                    }`}
                  >
                    {message.content}
                  </div>
                </div>
              ))
            )}
          </div>

          {errorMessage ? (
            <div className="flex items-center justify-between gap-4 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive-foreground">
              <span>{errorMessage}</span>
              {retryMessage &&
              error !== "EMPTY_INPUT" &&
              error !== "MESSAGE_TOO_LONG" ? (
                <Button size="sm" variant="secondary" onClick={handleRetry}>
                  Retry
                </Button>
              ) : null}
            </div>
          ) : null}

          <div className="rounded-xl border border-border/70 bg-background/60 p-4">
            <div className="flex items-end gap-3">
              <Textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Reply in Mandarin or ask for help..."
                className="min-h-[70px] resize-none bg-background/20"
                disabled={inFlight}
                maxLength={2000}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    sendMessage();
                  }
                }}
              />
              <Button
                className="h-[46px] px-6"
                onClick={() => sendMessage()}
                disabled={inFlight || input.trim().length === 0}
              >
                Send
              </Button>
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
              <span>Enter to send. Shift+Enter for new line.</span>
              <span>{input.length}/2000</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
