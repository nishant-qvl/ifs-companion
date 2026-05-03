import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { saveSessionSummary } from "@/lib/notion";
import type { SessionEndRequest, SessionAnalysis } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const client = new Anthropic();

const ANALYSIS_PROMPT = `Analyze this IFS therapy conversation and return ONLY a JSON object with these exact fields:

{
  "partActive": one or more of ["Young Guardian", "Fixer", "Critic", "Judge-Comparer", "Defender", "Thinker", "Help-Seeker", "Withdrawer", "Escapist-Procrastinator", "Addicted Part", "Connector", "Nurturer", "Multiple"],
  "patternRecognized": one of ["Destructive Sequence", "Fear Catch-22", "Judge-Comparer Sabotage", "Thinker Planning Loop", "Power Trap", "Withdrawal Cycle", "Mental Age Regression", "None"],
  "moodIn": one of ["Activated", "Foggy", "Anxious", "Flat", "Okay"],
  "moodOut": one of ["Calmer", "Clearer", "Same", "Needed more time"],
  "resolution": one of ["Self-energy accessed", "Part acknowledged", "Still processing", "Needed space"],
  "trigger": short string describing what activated the part,
  "insight": short string describing what was understood
}

Return ONLY valid JSON, no explanation, no markdown.`;

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { messages } = body as SessionEndRequest;

  if (!messages || messages.length === 0) {
    return NextResponse.json(
      { error: "No messages to summarize" },
      { status: 400 }
    );
  }

  try {
    const analysisResponse = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 512,
      system: ANALYSIS_PROMPT,
      messages: [
        ...messages,
        {
          role: "user",
          content: "Analyze the conversation above and return the JSON.",
        },
      ],
    });

    const textBlock = analysisResponse.content.find((b) => b.type === "text");
    const rawText = textBlock?.type === "text" ? textBlock.text.trim() : "";

    let analysis: SessionAnalysis;
    try {
      // Strip any accidental markdown fences before parsing
      const cleaned = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
      analysis = JSON.parse(cleaned) as SessionAnalysis;
    } catch {
      console.error("Failed to parse analysis JSON:", rawText);
      return NextResponse.json(
        { error: `Model returned invalid JSON: ${rawText.slice(0, 200)}` },
        { status: 500 }
      );
    }

    const date = new Date();
    const title = `Session — ${date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })}`;

    try {
      await saveSessionSummary(title, analysis);
    } catch (notionErr) {
      console.error("Notion save failed:", notionErr);
      return NextResponse.json(
        {
          success: false,
          analysis,
          title,
          error: `Session analyzed but Notion save failed: ${notionErr instanceof Error ? notionErr.message : String(notionErr)}`,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, analysis, title });
  } catch (err) {
    console.error("Session analysis failed:", err);
    return NextResponse.json(
      {
        error: `Failed to analyze session: ${err instanceof Error ? err.message : String(err)}`,
      },
      { status: 500 }
    );
  }
}
