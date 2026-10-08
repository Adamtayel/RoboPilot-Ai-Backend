"use client";

import { useEffect, useRef, useState } from "react";
import {
  EMPTY_SLOTS,
  type ChatMessage,
  type CollectedSlots,
} from "@/lib/robopilot/chat-schema";

/**
 * Conversational intake.
 *
 * This is a second way into the same form, not a second product. Every turn
 * sends the transcript plus the slots collected so far and gets back the
 * updated slots, which are handed straight up to the planner page — so the
 * form and the conversation are always showing the same four answers, and the
 * user can switch between typing and talking at any point.
 *
 * What it deliberately does NOT do: produce a plan. When the four slots are
 * filled it hands them to the existing /api/robopilot path, untouched.
 */

const SLOT_LABELS: Record<string, string> = {
  projectName: "name",
  requirements: "what it does",
  constraints: "limits",
  budget: "budget",
};

const OPENING_MESSAGE =
  "Tell me what you want to build. I'll ask about anything I still need, then hand it to the planner — I won't guess prices or specs along the way.";

export interface ChatPanelProps {
  priceRegion: "egypt" | "international";
  /** Lifts collected slots to the page so the form stays in sync. */
  onSlotsChange: (slots: CollectedSlots) => void;
  /** Called when all four slots are filled and the user asks to plan. */
  onReadyToPlan: (slots: CollectedSlots) => void;
  disabled?: boolean;
}

export function ChatPanel({
  priceRegion,
  onSlotsChange,
  onReadyToPlan,
  disabled = false,
}: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [slots, setSlots] = useState<CollectedSlots>(EMPTY_SLOTS);
  const [missing, setMissing] = useState<string[]>([
    "projectName",
    "requirements",
    "constraints",
    "budget",
  ]);
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const streamRef = useRef<HTMLDivElement>(null);
  const ready = missing.length === 0;

  useEffect(() => {
    // Keep the newest turn in view without yanking the whole page around.
    streamRef.current?.scrollTo({ top: streamRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, thinking]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || thinking || disabled) return;

    const next: ChatMessage[] = [...messages, { role: "user", content: trimmed }];
    setMessages(next);
    setDraft("");
    setThinking(true);
    setError(null);

    try {
      const res = await fetch("/api/robopilot/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next, collected: slots, priceRegion }),
      });
      const json = await res.json();

      if (!res.ok) {
        setError(json.error ?? "The assistant could not reply. You can fill the form instead.");
        return;
      }

      setMessages([...next, { role: "assistant", content: json.reply }]);
      setSlots(json.collected);
      setMissing(json.missing);
      onSlotsChange(json.collected);
    } catch {
      setError("Could not reach the assistant. You can fill the form on the left instead.");
    } finally {
      setThinking(false);
    }
  }

  return (
    <section className="chat" aria-label="Conversational intake">
      <header className="chat__head">
        <h2 className="chat__title">Describe it in your own words</h2>
        <ul className="chat__slots">
          {Object.entries(SLOT_LABELS).map(([key, label]) => {
            const done = !missing.includes(key);
            return (
              <li key={key} className={done ? "chat__slot chat__slot--done" : "chat__slot"}>
                <span className="chat__slot-dot" aria-hidden="true" />
                {label}
              </li>
            );
          })}
        </ul>
      </header>

      <div className="chat__stream" ref={streamRef}>
        <p className="chat__msg chat__msg--assistant">{OPENING_MESSAGE}</p>

        {messages.map((m, i) => (
          <p
            key={i}
            className={m.role === "user" ? "chat__msg chat__msg--user" : "chat__msg chat__msg--assistant"}
          >
            {m.content}
          </p>
        ))}

        {thinking && (
          <p className="chat__msg chat__msg--assistant chat__msg--thinking" aria-live="polite">
            <span className="chat__dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            Thinking
          </p>
        )}

        {error && <p className="chat__error">{error}</p>}
      </div>

      {ready && (
        <div className="chat__ready">
          <p>All four answers are in, and they are filled into the form.</p>
          <button
            type="button"
            className="btn-primary"
            onClick={() => onReadyToPlan(slots)}
            disabled={disabled}
          >
            Generate the plan
          </button>
        </div>
      )}

      <form
        className="chat__composer"
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
      >
        <label className="sr-only" htmlFor="chat-input">
          Message the intake assistant
        </label>
        <textarea
          id="chat-input"
          className="chat__input"
          rows={2}
          value={draft}
          placeholder="e.g. a small rover that avoids obstacles, for a college competition"
          disabled={disabled || thinking}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends, Shift+Enter breaks the line — the convention
            // anyone who has used a chat window already expects.
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(draft);
            }
          }}
        />
        <button
          type="submit"
          className="btn-primary btn-primary--sm"
          disabled={disabled || thinking || draft.trim().length === 0}
        >
          Send
        </button>
      </form>
    </section>
  );
}
