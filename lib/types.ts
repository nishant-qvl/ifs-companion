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

export type IFSPart =
  | "Young Guardian"
  | "Fixer"
  | "Critic"
  | "Judge-Comparer"
  | "Defender"
  | "Thinker"
  | "Help-Seeker"
  | "Withdrawer"
  | "Escapist-Procrastinator"
  | "Addicted Part"
  | "Connector"
  | "Nurturer"
  | "Multiple";

export type IFSPattern =
  | "Destructive Sequence"
  | "Fear Catch-22"
  | "Judge-Comparer Sabotage"
  | "Thinker Planning Loop"
  | "Power Trap"
  | "Withdrawal Cycle"
  | "Mental Age Regression"
  | "None";

export type MoodIn = "Activated" | "Foggy" | "Anxious" | "Flat" | "Okay";
export type MoodOut = "Calmer" | "Clearer" | "Same" | "Needed more time";
export type Resolution =
  | "Self-energy accessed"
  | "Part acknowledged"
  | "Still processing"
  | "Needed space";

export interface SessionAnalysis {
  partActive: IFSPart | IFSPart[];
  patternRecognized: IFSPattern;
  moodIn: MoodIn;
  moodOut: MoodOut;
  resolution: Resolution;
  trigger: string;
  insight: string;
}
