import { NextResponse } from "next/server";

const ELEVENLABS_VOICE_ID =
  process.env.ELEVENLABS_VOICE_ID ?? "6FGZjfQDtuhZjLHFuM90";
const MAX_TTS_CHARACTERS = 2000;

interface TtsRequestPayload {
  text?: string;
}

const buildRequestBody = (text: string) => ({
  text,
  model_id: "eleven_turbo_v2_5",
  voice_settings: {
    stability: 0.4,
    similarity_boost: 0.75,
  },
}); 

export async function POST(request: Request) {
  let payload: TtsRequestPayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const text = (payload.text ?? "").trim();
  if (!text) {
    return NextResponse.json({ error: "EMPTY_TEXT" }, { status: 400 });
  }

  if (text.length > MAX_TTS_CHARACTERS) {
    return NextResponse.json({ error: "TEXT_TOO_LONG" }, { status: 400 });
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "MISSING_TTS_API_KEY" }, { status: 500 });
  }

  const endpoint = `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`;

  try {
    const elevenResponse = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
        "xi-api-key": apiKey,
      },
      body: JSON.stringify(buildRequestBody(text)),
    });

    if (!elevenResponse.ok) {
      return NextResponse.json({ error: "TTS_FAILED" }, { status: 502 });
    }

    const audioBuffer = await elevenResponse.arrayBuffer();

    return new NextResponse(audioBuffer, {
      headers: {
        "Content-Type": elevenResponse.headers.get("content-type") ?? "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "TTS_FAILED" }, { status: 502 });
  }
}
