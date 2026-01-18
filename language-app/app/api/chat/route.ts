import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { GENERATION_CONFIG, SYSTEM_PROMPT } from "@/lib/prompts";

const MODEL_NAME = "gemini-2.5-flash-lite";
const TIMEOUT_MS = 20000;
const MAX_MESSAGE_LENGTH = 2000;

type ClientMessage = {
  role: "user" | "assistant";
  content: string;
};

type ParsedAssistantResponse = {
  content: string;
  progress: number | null;
};

const buildPrompt = (messages: ClientMessage[]) => {
  const lines = messages.map((message) => {
    const label = message.role === "user" ? "User" : "Assistant";
    return `${label}: ${message.content}`;
  });
  return [SYSTEM_PROMPT, ...lines, "Assistant:"].join("\n\n");
};

const validateMessages = (messages: ClientMessage[]) => {
  if (!Array.isArray(messages) || messages.length === 0) {
    return "INVALID_MESSAGES";
  }
  const last = messages[messages.length - 1];
  if (!last || last.role !== "user") {
    return "LAST_MESSAGE_NOT_USER";
  }
  for (const message of messages) {
    if (!message || typeof message.content !== "string") {
      return "INVALID_MESSAGE_FORMAT";
    }
    if (message.content.length > MAX_MESSAGE_LENGTH) {
      return "MESSAGE_TOO_LONG";
    }
  }
  return null;
};

const parseAssistantResponse = (text: string): ParsedAssistantResponse => {
  const trimmed = text.trim();
  if (!trimmed) {
    return { content: "", progress: null };
  }

  const lines = trimmed.split(/\r?\n/);
  if (lines.length === 0) {
    return { content: trimmed, progress: null };
  }

  const firstLine = lines[0].trim();
  const match = /^PROGRESS=(\d{1,3})$/i.exec(firstLine);
  if (!match) {
    return { content: trimmed, progress: null };
  }

  const value = Number(match[1]);
  if (Number.isNaN(value)) {
    return { content: lines.slice(1).join("\n").trim(), progress: null };
  }

  const normalized = Math.min(100, Math.max(0, value));
  const content = lines.slice(1).join("\n").trim();
  return { content, progress: normalized };
};

export async function POST(request: Request) {
  let payload: { messages?: ClientMessage[] };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const messages = payload.messages ?? [];
  const validationError = validateMessages(messages);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "MISSING_API_KEY" }, { status: 500 });
  }

  const prompt = buildPrompt(messages);
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: MODEL_NAME });

  try {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error("TIMEOUT")), TIMEOUT_MS);
    });

    const response = (await Promise.race([
      model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: GENERATION_CONFIG,
      }),
      timeoutPromise,
    ])) as Awaited<ReturnType<typeof model.generateContent>>;

    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    const text = response.response.text();
    if (!text) {
      return NextResponse.json({ error: "EMPTY_RESPONSE" }, { status: 502 });
    }

    const parsed = parseAssistantResponse(text);
    if (!parsed.content) {
      return NextResponse.json({ error: "EMPTY_RESPONSE" }, { status: 502 });
    }

    return NextResponse.json({
      assistantMessage: {
        role: "assistant",
        content: parsed.content,
      },
      progress: parsed.progress,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "TIMEOUT") {
      return NextResponse.json({ error: "TIMEOUT" }, { status: 504 });
    }
    return NextResponse.json({ error: "AI_SERVICE_FAILED" }, { status: 502 });
  }
}
