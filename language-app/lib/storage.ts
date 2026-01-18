import type { ChatMessage, ProgressValue } from "@/lib/types";
import { FIRST_ASSISTANT_MESSAGE } from "@/lib/prompts";

export const STORAGE_KEY = "demo_chat_messages";
export const PROGRESS_KEY = "demo_chat_progress";

const buildId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `msg_${Math.random().toString(36).slice(2, 10)}`;
};

export const createInitialMessage = (): ChatMessage => ({
  id: buildId(),
  role: "assistant",
  content: FIRST_ASSISTANT_MESSAGE,
  timestamp: new Date().toISOString(),
});

export const loadMessages = (): ChatMessage[] => {
  if (typeof window === "undefined") {
    return [];
  }
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as ChatMessage[];
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed;
  } catch {
    return [];
  }
};

export const saveMessages = (messages: ChatMessage[]) => {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
};

export const loadProgress = (): ProgressValue => {
  if (typeof window === "undefined") {
    return null;
  }
  const raw = window.localStorage.getItem(PROGRESS_KEY);
  if (!raw) {
    return null;
  }
  const parsed = Number(raw);
  if (Number.isNaN(parsed)) {
    return null;
  }
  return Math.min(100, Math.max(0, parsed));
};

export const saveProgress = (progress: ProgressValue) => {
  if (typeof window === "undefined") {
    return;
  }
  if (progress === null) {
    window.localStorage.removeItem(PROGRESS_KEY);
    return;
  }
  window.localStorage.setItem(PROGRESS_KEY, String(progress));
};

export const resetMessages = (): ChatMessage[] => {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(STORAGE_KEY);
    window.localStorage.removeItem(PROGRESS_KEY);
  }
  return [createInitialMessage()];
};
