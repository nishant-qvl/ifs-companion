import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";
import type { ChatRequest } from "@/lib/types";

export const runtime = "nodejs";

const client = new Anthropic();

export async function POST(req: NextRequest) {
  const body: ChatRequest = await req.json();
  const { messages, systemPrompt, recentSessionsContext } = body;

  // Inject past session context into system prompt
  const fullSystemText = recentSessionsContext
    ? `${systemPrompt}\n\n<previous_sessions>\nHere are summaries of your last few sessions for continuity:\n${recentSessionsContext}\n</previous_sessions>`
    : systemPrompt;

  const encoder = new TextEncoder();

  const readableStream = new ReadableStream({
    async start(controller) {
      try {
        const stream = client.messages.stream({
          model: "claude-sonnet-4-6",
          max_tokens: 8096,
          // Cache the system prompt (includes session context) for 5 min
          system: [
            {
              type: "text",
              text: fullSystemText,
              cache_control: { type: "ephemeral" },
            },
          ],
          messages: messages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        });

        for await (const event of stream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            const payload = JSON.stringify({ text: event.delta.text });
            controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
          }
        }

        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ error: msg })}\n\n`)
        );
        controller.close();
      }
    },
  });

  return new Response(readableStream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
