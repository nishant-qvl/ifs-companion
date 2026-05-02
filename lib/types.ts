export type Role = "user" | "assistant";

export interface Message {
  id: string;
  role: Role;
  content: string;
  timestamp: number;
}

export interface SessionContext {
  systemPrompt: string;
  recentSessionsContext: string;
}

export interface ChatRequest {
  messages: Array<{ role: Role; content: string }>;
  systemPrompt: string;
  recentSessionsContext: string;
}

export interface SessionEndRequest {
  messages: Array<{ role: Role; content: string }>;
}
