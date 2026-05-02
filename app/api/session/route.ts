import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { saveSessionSummary } from "@/lib/notion";
import type { SessionEndRequest } from "@/lib/types";

export const runtime = "nodejs";

const client = new Anthropic();

export async function POST(req: NextRequest) {
  const { messages }: SessionEndRequest = await req.json();

  if (!messages || messages.length === 0) {
    return NextResponse.json(
      { error: "No messages to summarize" },
      { status: 400 }
    );
  }

  // Generate a concise session summary
  const summaryResponse = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 400,
    system:
      "You summarize conversations in 2-3 sentences. Be factual and concise. " +
      "Focus on what was discussed and any decisions or outcomes.",
    messages: [
      ...messages,
      {
        role: "user",
        content:
          "Please provide a 2-3 sentence summary of our conversation above.",
      },
    ],
  });

  const summaryBlock = summaryResponse.content.find((b) => b.type === "text");
  const summary = summaryBlock?.type === "text" ? summaryBlock.text : "";

  const date = new Date();
  const title = `Session — ${date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })}`;

  await saveSessionSummary(title, summary);

  return NextResponse.json({ success: true, summary, title });
}
