"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { Message, SessionContext } from "@/lib/types";

// ---------- helpers ----------

function genId() {
  return Math.random().toString(36).slice(2);
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ---------- sub-components ----------

function TypingDots() {
  return (
    <span className="inline-flex gap-0.5 items-center h-4">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </span>
  );
}

interface BubbleProps {
  message: Message;
  isStreaming?: boolean;
}

function MessageBubble({ message, isStreaming }: BubbleProps) {
  const isUser = message.role === "user";
  return (
    <div
      className={`flex items-end gap-2 mb-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}
    >
      {/* Avatar */}
      <div
        className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold ${
          isUser
            ? "bg-blue-600 text-white"
            : "bg-gray-200 text-gray-600"
        }`}
      >
        {isUser ? "U" : "A"}
      </div>

      {/* Bubble */}
      <div
        className={`max-w-[75%] sm:max-w-[65%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
          isUser
            ? "bg-blue-600 text-white rounded-br-sm"
            : "bg-white text-gray-800 shadow-sm border border-gray-100 rounded-bl-sm"
        } ${isStreaming ? "cursor-blink" : ""}`}
      >
        <p className="whitespace-pre-wrap break-words">
          {message.content || (isStreaming ? "" : "…")}
        </p>
        <p
          className={`text-[10px] mt-1 text-right ${
            isUser ? "text-blue-200" : "text-gray-400"
          }`}
        >
          {formatTime(message.timestamp)}
        </p>
      </div>
    </div>
  );
}

// ---------- main component ----------

export default function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sessionCtx, setSessionCtx] = useState<SessionContext | null>(null);
  const [loadingCtx, setLoadingCtx] = useState(true);
  const [streaming, setStreaming] = useState(false);
  const [ending, setEnding] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [streamingId, setStreamingId] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // ---------- fetch session context on mount ----------
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/context");
        if (!res.ok) throw new Error("Failed to load context");
        const ctx: SessionContext = await res.json();
        setSessionCtx(ctx);
      } catch {
        setSessionCtx({ systemPrompt: "You are a helpful assistant.", recentSessionsContext: "" });
      } finally {
        setLoadingCtx(false);
      }
    })();
  }, []);

  // ---------- auto-scroll to bottom ----------
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ---------- auto-resize textarea ----------
  const resizeTextarea = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, []);

  useEffect(() => {
    resizeTextarea();
  }, [input, resizeTextarea]);

  // ---------- show toast ----------
  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }

  // ---------- send message ----------
  async function sendMessage() {
    const text = input.trim();
    if (!text || streaming || !sessionCtx) return;

    setInput("");

    const userMsg: Message = {
      id: genId(),
      role: "user",
      content: text,
      timestamp: Date.now(),
    };
    const assistantId = genId();
    const assistantMsg: Message = {
      id: assistantId,
      role: "assistant",
      content: "",
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setStreamingId(assistantId);
    setStreaming(true);

    try {
      const payload = {
        messages: [...messages, userMsg].map((m) => ({
          role: m.role,
          content: m.content,
        })),
        systemPrompt: sessionCtx.systemPrompt,
        recentSessionsContext: sessionCtx.recentSessionsContext,
      };

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok || !res.body) throw new Error("Chat request failed");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") break;

          try {
            const parsed = JSON.parse(data);
            if (parsed.error) throw new Error(parsed.error);
            if (parsed.text) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, content: m.content + parsed.text }
                    : m
                )
              );
            }
          } catch {
            // skip malformed chunks
          }
        }
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "Something went wrong";
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: `Error: ${errMsg}` }
            : m
        )
      );
    } finally {
      setStreaming(false);
      setStreamingId(null);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  // ---------- end session ----------
  async function endSession() {
    if (messages.length === 0) {
      showToast("Nothing to save — chat first!");
      return;
    }
    setEnding(true);
    try {
      const res = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error ?? "Failed to save");

      // Reset conversation; keep session context
      setMessages([]);
      showToast("Session saved to Notion ✓");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save session";
      showToast(`Error: ${msg}`);
    } finally {
      setEnding(false);
    }
  }

  // ---------- render ----------

  const isIdle = !streaming && !loadingCtx;

  return (
    <div className="flex flex-col h-full max-w-2xl mx-auto bg-white sm:shadow-xl">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 bg-blue-600 text-white flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center font-bold text-sm">
            IFS
          </div>
          <div>
            <p className="font-semibold text-sm leading-tight">IFS Chat</p>
            <p className="text-xs text-blue-200 leading-tight">
              {loadingCtx
                ? "Loading…"
                : streaming
                ? "Thinking…"
                : "Online"}
            </p>
          </div>
        </div>
        <button
          onClick={endSession}
          disabled={!isIdle || ending || messages.length === 0}
          className="text-xs bg-white/20 hover:bg-white/30 disabled:opacity-40 disabled:cursor-not-allowed px-3 py-1.5 rounded-full transition-colors font-medium"
        >
          {ending ? "Saving…" : "End Session"}
        </button>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto messages-scroll px-4 py-4">
        {loadingCtx && (
          <div className="flex justify-center py-8">
            <div className="text-gray-400 text-sm flex items-center gap-2">
              <TypingDots />
              <span>Loading session…</span>
            </div>
          </div>
        )}

        {!loadingCtx && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center px-6 py-12">
            <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center mb-4">
              <svg
                className="w-8 h-8 text-blue-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
                />
              </svg>
            </div>
            <p className="text-gray-600 font-medium">Ready when you are</p>
            <p className="text-gray-400 text-sm mt-1">
              Type a message to start your session
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            isStreaming={msg.id === streamingId}
          />
        ))}

        {/* Empty streaming bubble while waiting for first token */}
        {streaming && streamingId && messages.find(m => m.id === streamingId)?.content === "" && (
          <div className="flex items-end gap-2 mb-3">
            <div className="w-7 h-7 rounded-full bg-gray-200 flex-shrink-0 flex items-center justify-center text-xs font-bold text-gray-600">
              A
            </div>
            <div className="bg-white border border-gray-100 shadow-sm rounded-2xl rounded-bl-sm px-4 py-3">
              <TypingDots />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="flex-shrink-0 border-t border-gray-100 bg-white px-4 py-3">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={streaming || loadingCtx}
            placeholder={
              loadingCtx
                ? "Loading…"
                : streaming
                ? "Waiting for response…"
                : "Message IFS Chat…"
            }
            rows={1}
            className="flex-1 resize-none rounded-2xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed leading-relaxed"
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || streaming || loadingCtx}
            className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700 active:bg-blue-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            aria-label="Send"
          >
            <svg
              className="w-4 h-4 translate-x-0.5"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
            </svg>
          </button>
        </div>
        <p className="text-center text-xs text-gray-400 mt-2">
          Press Enter to send · Shift+Enter for newline
        </p>
      </div>

      {/* Toast notification */}
      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-sm px-4 py-2 rounded-full shadow-lg z-50 animate-fade-in">
          {toast}
        </div>
      )}
    </div>
  );
}
