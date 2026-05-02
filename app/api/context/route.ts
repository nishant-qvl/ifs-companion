import { NextResponse } from "next/server";
import { getSystemPrompt, getRecentSessionsContext } from "@/lib/notion";
import type { SessionContext } from "@/lib/types";

export const runtime = "nodejs";

export async function GET() {
  const [systemPrompt, recentSessionsContext] = await Promise.all([
    getSystemPrompt(),
    getRecentSessionsContext(5),
  ]);

  const ctx: SessionContext = { systemPrompt, recentSessionsContext };
  return NextResponse.json(ctx);
}
