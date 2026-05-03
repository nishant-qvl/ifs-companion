import { Client } from "@notionhq/client";
import type {
  BlockObjectResponse,
  PageObjectResponse,
  RichTextItemResponse,
} from "@notionhq/client/build/src/api-endpoints";
import type { SessionAnalysis } from "./types";

let notion: Client | null = null;

function getClient(): Client {
  if (!notion) {
    if (!process.env.NOTION_TOKEN) throw new Error("NOTION_TOKEN not set");
    notion = new Client({ auth: process.env.NOTION_TOKEN });
  }
  return notion;
}

function richTextToString(richText: RichTextItemResponse[]): string {
  return richText.map((t) => t.plain_text).join("");
}

function blockToText(block: BlockObjectResponse): string {
  const b = block as BlockObjectResponse & Record<string, unknown>;
  const type = block.type;

  const getRT = (key: string): string => {
    const section = b[key] as { rich_text?: RichTextItemResponse[] } | undefined;
    return richTextToString(section?.rich_text ?? []);
  };

  switch (type) {
    case "paragraph":
      return getRT("paragraph");
    case "heading_1":
      return `# ${getRT("heading_1")}`;
    case "heading_2":
      return `## ${getRT("heading_2")}`;
    case "heading_3":
      return `### ${getRT("heading_3")}`;
    case "bulleted_list_item":
      return `• ${getRT("bulleted_list_item")}`;
    case "numbered_list_item":
      return getRT("numbered_list_item");
    case "quote":
      return `> ${getRT("quote")}`;
    case "code": {
      const code = b["code"] as { rich_text?: RichTextItemResponse[] } | undefined;
      return `\`\`\`\n${richTextToString(code?.rich_text ?? [])}\n\`\`\``;
    }
    case "toggle":
      return getRT("toggle");
    default:
      return "";
  }
}

export async function getSystemPrompt(): Promise<string> {
  const pageId = process.env.NOTION_SYSTEM_PROMPT_PAGE_ID;
  if (!pageId) return "You are a helpful assistant.";

  try {
    const client = getClient();
    const blocks = await client.blocks.children.list({ block_id: pageId });
    const lines = (blocks.results as BlockObjectResponse[])
      .map(blockToText)
      .filter(Boolean);
    return lines.join("\n\n") || "You are a helpful assistant.";
  } catch (err) {
    console.error("Failed to fetch system prompt from Notion:", err);
    return "You are a helpful assistant.";
  }
}

function extractPageSummary(page: PageObjectResponse): string {
  const props = page.properties;
  const titleProp = process.env.NOTION_TITLE_PROP ?? "Name";
  const summaryProp = process.env.NOTION_SUMMARY_PROP ?? "Summary";
  const dateProp = process.env.NOTION_DATE_PROP ?? "Date";

  const titleEntry = props[titleProp];
  const summaryEntry = props[summaryProp];
  const dateEntry = props[dateProp];

  let title = "Session";
  if (titleEntry?.type === "title") {
    title = richTextToString(titleEntry.title) || "Session";
  }

  let summary = "";
  if (summaryEntry?.type === "rich_text") {
    summary = richTextToString(summaryEntry.rich_text);
  }

  let date = "";
  if (dateEntry?.type === "date" && dateEntry.date?.start) {
    date = dateEntry.date.start;
  }

  const parts = [`[${date || "Unknown date"}] ${title}`];
  if (summary) parts.push(summary);
  return parts.join(": ");
}

export async function getRecentSessionsContext(limit = 5): Promise<string> {
  const dbId = process.env.NOTION_SESSION_LOG_DB_ID;
  if (!dbId) return "";

  try {
    const client = getClient();
    const response = await client.databases.query({
      database_id: dbId,
      sorts: [{ timestamp: "created_time", direction: "descending" }],
      page_size: limit,
    });

    const summaries = (response.results as PageObjectResponse[])
      .map(extractPageSummary)
      .filter(Boolean);

    if (summaries.length === 0) return "";

    return summaries.join("\n");
  } catch (err) {
    console.error("Failed to fetch session history from Notion:", err);
    return "";
  }
}

function analysisToSummaryText(analysis: SessionAnalysis): string {
  const parts = Array.isArray(analysis.partActive)
    ? analysis.partActive.join(", ")
    : analysis.partActive;
  return [
    `Trigger: ${analysis.trigger}`,
    `Insight: ${analysis.insight}`,
    `Part: ${parts}`,
    `Pattern: ${analysis.patternRecognized}`,
    `Mood: ${analysis.moodIn} → ${analysis.moodOut}`,
    `Resolution: ${analysis.resolution}`,
  ].join(" | ");
}

export async function saveSessionSummary(
  title: string,
  analysis: SessionAnalysis
): Promise<void> {
  const dbId = process.env.NOTION_SESSION_LOG_DB_ID;
  if (!dbId) throw new Error("NOTION_SESSION_LOG_DB_ID not set");

  const titleProp = process.env.NOTION_TITLE_PROP ?? "Name";
  const summaryProp = process.env.NOTION_SUMMARY_PROP ?? "Summary";
  const dateProp = process.env.NOTION_DATE_PROP ?? "Date";

  const summaryText = analysisToSummaryText(analysis);

  const client = getClient();
  await client.pages.create({
    parent: { database_id: dbId },
    properties: {
      "Session Title": {
        title: [{ text: { content: title } }],
      },
      [summaryProp]: {
        rich_text: [{ text: { content: summaryText.slice(0, 2000) } }],
      },
      "Date": {
        date: { start: new Date().toISOString().split("T")[0] },
      },
    },
  });
}
