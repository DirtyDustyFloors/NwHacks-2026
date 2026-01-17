import type { ChatMessage } from "@/lib/types";
import { FIRST_ASSISTANT_MESSAGE } from "@/lib/prompts";

export const STORAGE_KEY = "demo_chat_messages";

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

export const resetMessages = (): ChatMessage[] => {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(STORAGE_KEY);
  }
  return [createInitialMessage()];
};
