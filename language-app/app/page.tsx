"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import type { ChatMessage, ProgressValue } from "@/lib/types";
import {
  createInitialMessage,
  loadMessages,
  loadProgress,
  resetMessages,
  saveMessages,
  saveProgress,
} from "@/lib/storage";
import Image from "next/image";

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

type AudioStatus = {
  status: "loading" | "ready" | "error";
  url?: string;
};

export default function Home() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [inFlight, setInFlight] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryMessage, setRetryMessage] = useState<ChatMessage | null>(null);
  const [progress, setProgress] = useState<ProgressValue>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [audioByMessage, setAudioByMessage] = useState<Record<string, AudioStatus>>({});
  const audioUrlsRef = useRef<Record<string, string>>({});
  const audioElementsRef = useRef<Record<string, HTMLAudioElement | null>>({});
  const messageIdsRef = useRef<Set<string>>(new Set());
  const autoPlayTargetIdRef = useRef<string | null>(null);
  const autoPlayedRef = useRef<Set<string>>(new Set());

  const lastAssistant = useMemo(() => {
    return [...messages].reverse().find((message) => message.role === "assistant");
  }, [messages]);

  const errorMessage = error
    ? ERROR_MESSAGES[error] ?? ERROR_MESSAGES.AI_SERVICE_FAILED
    : null;

  const releaseAudioUrl = useCallback((messageId: string) => {
    const existingUrl = audioUrlsRef.current[messageId];
    if (existingUrl) {
      URL.revokeObjectURL(existingUrl);
      delete audioUrlsRef.current[messageId];
    }
  }, []);

  const releaseAllAudioUrls = useCallback(() => {
    Object.keys(audioUrlsRef.current).forEach((messageId) => {
      releaseAudioUrl(messageId);
    });
  }, [releaseAudioUrl]);

  const releaseAudioElement = useCallback((messageId: string) => {
    if (audioElementsRef.current[messageId]) {
      delete audioElementsRef.current[messageId];
    }
  }, []);

  const clearAudioState = useCallback(() => {
    setAudioByMessage((prev) => {
      if (Object.keys(prev).length === 0) {
        return prev;
      }
      releaseAllAudioUrls();
      audioElementsRef.current = {};
      return {};
    });
    autoPlayedRef.current.clear();
    autoPlayTargetIdRef.current = null;
  }, [releaseAllAudioUrls]);

  const fetchAudioForMessage = useCallback(
    async (message: ChatMessage) => {
      try {
        const response = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: message.content }),
        });

        if (!response.ok) {
          throw new Error("TTS_FAILED");
        }

        const arrayBuffer = await response.arrayBuffer();
        const mimeType = response.headers.get("content-type") ?? "audio/mpeg";
        const blob = new Blob([arrayBuffer], { type: mimeType });
        const objectUrl = URL.createObjectURL(blob);

        if (!messageIdsRef.current.has(message.id)) {
          URL.revokeObjectURL(objectUrl);
          return;
        }

        releaseAudioUrl(message.id);
        audioUrlsRef.current[message.id] = objectUrl;

        setAudioByMessage((prev) => ({
          ...prev,
          [message.id]: {
            status: "ready",
            url: objectUrl,
          },
        }));
      } catch {
        releaseAudioUrl(message.id);
        setAudioByMessage((prev) => ({
          ...prev,
          [message.id]: { status: "error" },
        }));
      }
    },
    [releaseAudioUrl]
  );

  const requestAudioForMessage = useCallback(
    (message: ChatMessage) => {
      releaseAudioUrl(message.id);
      setAudioByMessage((prev) => ({
        ...prev,
        [message.id]: { status: "loading" },
      }));
      void fetchAudioForMessage(message);
    },
    [fetchAudioForMessage, releaseAudioUrl]
  );

  const handleAudioElementRef = useCallback(
    (messageId: string, element: HTMLAudioElement | null) => {
      if (element) {
        audioElementsRef.current[messageId] = element;
        const state = audioByMessage[messageId];
        if (
          state?.status === "ready" &&
          autoPlayTargetIdRef.current === messageId &&
          !autoPlayedRef.current.has(messageId)
        ) {
          element.currentTime = 0;
          void element.play().catch(() => {
            // Browser autoplay policies might block playback; safe to ignore.
          });
          autoPlayedRef.current.add(messageId);
          autoPlayTargetIdRef.current = null;
        }
      } else {
        delete audioElementsRef.current[messageId];
      }
    },
    [audioByMessage]
  );

  useEffect(() => {
    const stored = loadMessages();
    const storedProgress = loadProgress();
    if (stored.length === 0) {
      const initial = createInitialMessage();
      setMessages([initial]);
      saveMessages([initial]);
      setProgress(storedProgress);
      return;
    }
    setMessages(stored);
    setProgress(storedProgress);
  }, []);

  useEffect(() => {
    if (!listRef.current) {
      return;
    }
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, inFlight]);

  useEffect(() => {
    const currentIds = new Set(messages.map((message) => message.id));
    messageIdsRef.current = currentIds;

    setAudioByMessage((prev) => {
      let changed = false;
      const nextState = { ...prev };
      for (const id of Object.keys(nextState)) {
        if (!currentIds.has(id)) {
          releaseAudioUrl(id);
          delete nextState[id];
          changed = true;
        }
      }
      return changed ? nextState : prev;
    });

    Object.keys(audioElementsRef.current).forEach((id) => {
      if (!currentIds.has(id)) {
        releaseAudioElement(id);
      }
    });

    autoPlayedRef.current.forEach((playedId) => {
      if (!currentIds.has(playedId)) {
        autoPlayedRef.current.delete(playedId);
      }
    });
  }, [messages, releaseAudioUrl, releaseAudioElement]);

  useEffect(() => {
    const assistantMessages = messages.filter(
      (message) => message.role === "assistant" && !audioByMessage[message.id]
    );

    assistantMessages.forEach((message) => {
      requestAudioForMessage(message);
    });
  }, [messages, audioByMessage, requestAudioForMessage]);

  useEffect(() => {
    Object.entries(audioByMessage).forEach(([messageId, state]) => {
      if (state.status !== "ready" || !state.url) {
        return;
      }
      if (autoPlayedRef.current.has(messageId)) {
        return;
      }
      if (autoPlayTargetIdRef.current !== messageId) {
        return;
      }

      const element = audioElementsRef.current[messageId];
      if (!element) {
        return;
      }

      element.currentTime = 0;
      void element.play().catch(() => {
        // Autoplay can be blocked; ignore and allow manual playback.
      });
      autoPlayedRef.current.add(messageId);
      autoPlayTargetIdRef.current = null;
    });
  }, [audioByMessage]);

  useEffect(() => {
    const initWebcam = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: {
            width: { ideal: 2560 },
            height: { ideal: 1440},
            frameRate: { ideal: 60}
          } });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (error) {
        console.error("Error accessing webcam:", error);
      }
    };

    void initWebcam();

    return () => {
      if (videoRef.current?.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);


  useEffect(() => {
    return () => {
      releaseAllAudioUrls();
    };
  }, [releaseAllAudioUrls]);

  const persistMessages = (nextMessages: ChatMessage[]) => {
    setMessages(nextMessages);
    saveMessages(nextMessages);
  };

  const persistProgress = (value: ProgressValue) => {
    setProgress(value);
    saveProgress(value);
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

    autoPlayTargetIdRef.current = null;

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
        progress?: number | null;
      };
      if (!payload.assistantMessage?.content) {
        throw new Error("AI_SERVICE_FAILED");
      }

      const assistantMessage = createMessage(
        "assistant",
        payload.assistantMessage.content
      );
      const updated = [...nextMessages, assistantMessage];
      autoPlayTargetIdRef.current = assistantMessage.id;
      autoPlayedRef.current.delete(assistantMessage.id);
      persistMessages(updated);
      if (typeof payload.progress === "number" && !Number.isNaN(payload.progress)) {
        persistProgress(payload.progress);
      }
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
    clearAudioState();
    const initial = resetMessages();
    setMessages(initial);
    saveMessages(initial);
    persistProgress(null);
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
    <div className="flex h-screen w-full flex-col bg-transparent px-10 py-10">
      <video ref={videoRef} autoPlay playsInline muted className="fixed inset-0 -z-10 w-full h-full object-cover"/>
      <Card className="ml-auto margin-right-auto flex w-full max-w-5xl flex-1 flex-col border-border/80 bg-card/80 shadow-2xl">
        <CardHeader className="space-y-4 pb-4">
          <div className="flex items-start justify-between gap-6">
            <div className="space-y-2 flex items-center">
              <Image src="/logo.png" alt="Language App Logo" width={128} height={128} />
              <div className="flex-col pl-4">
                <CardTitle className="text-5xl font-bold">TomoSpeak</CardTitle>
                <CardDescription className="text-m text-muted-foreground">
                  とも (Tomo) = friend 
                </CardDescription>
                <CardDescription className="text-lg text-">
                  TomoSpeak: Your friendly AI Learning Companion
                </CardDescription>
              </div>
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
            <span>Powered by Gemini 2.5 Flash-Lite & ElevenLab </span>
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
            className="flex h-[58vh] flex-col min-h-0 gap-4 overflow-y-auto rounded-xl border border-border/70 bg-background/40 p-5 scroll-smooth"
          >
            {messages.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Loading lesson...
              </div>
            ) : (
              messages.map((message) => {
                const audioState = audioByMessage[message.id];
                const isAssistant = message.role === "assistant";
                let audioContent: JSX.Element | null = null;

                if (isAssistant) {
                  if (audioState?.status === "ready" && audioState.url) {
                    audioContent = (
                      <audio
                        className="w-full"
                        ref={(element) => handleAudioElementRef(message.id, element)}
                        controls
                        preload="none"
                        src={audioState.url}
                        aria-label="Assistant audio playback"
                      />
                    );
                  } else if (audioState?.status === "error") {
                    audioContent = (
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="text-destructive">Audio unavailable.</span>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => requestAudioForMessage(message)}
                        >
                          Retry
                        </Button>
                      </div>
                    );
                  } else {
                    audioContent = (
                      <span className="text-xs text-muted-foreground">
                        Generating pronunciation...
                      </span>
                    );
                  }
                }

                return (
                  <div
                    key={message.id}
                    className={`flex w-full ${
                      isAssistant ? "justify-start" : "justify-end"
                    }`}
                  >
                    <div
                      className={`max-w-[70%] whitespace-pre-wrap rounded-xl px-4 py-3 text-sm leading-relaxed shadow-sm ${
                        isAssistant
                          ? "bg-muted text-foreground"
                          : "bg-primary text-primary-foreground"
                      }`}
                    >
                      {message.content}
                      {audioContent ? (
                        <div className="mt-3 rounded-lg bg-background/40 p-2">
                          {audioContent}
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })
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
                placeholder="Reply or ask for help..."
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

          <div className="rounded-xl border border-border/70 bg-background/50 p-4">
            <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
              <span>Lesson progress</span>
              <span>{progress ?? 0}%</span>
            </div>
            <Progress value={progress ?? 0} className="mt-3" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
