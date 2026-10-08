"use client";

import { useState } from "react";
import type { RoboPilotPlan } from "@/lib/robopilot/schema";
import { IntakeForm, type PlanRequestBody } from "@/components/robopilot/IntakeForm";
import { EmptyState } from "@/components/robopilot/EmptyState";
import { LoadingState } from "@/components/robopilot/LoadingState";
import { ErrorState } from "@/components/robopilot/ErrorState";
import { PlanResults } from "@/components/robopilot/PlanResults";
import { AppHeader } from "@/components/robopilot/AppHeader";
import { ChatPanel } from "@/components/robopilot/ChatPanel";
import { slotsToPlanInput } from "@/lib/robopilot/chat-service";
import type { CollectedSlots } from "@/lib/robopilot/chat-schema";

type ViewState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; plan: RoboPilotPlan };

type Mode = "chat" | "form";

export default function Home() {
  const [view, setView] = useState<ViewState>({ status: "idle" });
  const [lastRequest, setLastRequest] = useState<PlanRequestBody | null>(null);
  // Two ways into the same four answers. The chat writes its slots into the
  // form rather than holding a second copy, so switching tabs never loses
  // work and there is never a question of which version gets submitted.
  const [mode, setMode] = useState<Mode>("chat");
  const [slots, setSlots] = useState<CollectedSlots | null>(null);
  const [priceRegion, setPriceRegion] = useState<"egypt" | "international">("egypt");

  async function generatePlan(body: PlanRequestBody) {
    setLastRequest(body);
    setView({ status: "loading" });

    try {
      const res = await fetch("/api/robopilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const json = await res.json();

      if (!res.ok) {
        setView({
          status: "error",
          message: json.error ?? "The server returned an unexpected error.",
        });
        return;
      }

      setView({ status: "success", plan: json as RoboPilotPlan });
    } catch {
      setView({
        status: "error",
        message: "Could not reach the server. Check your connection and try again.",
      });
    }
  }

  function retry() {
    if (lastRequest) {
      generatePlan(lastRequest);
    }
  }

  return (
    <div className="shell page-bg">
      <AppHeader />

      <div className="layout">
        <div className="intake">
          <div className="intake__tabs" role="tablist" aria-label="How to describe your project">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "chat"}
              className={mode === "chat" ? "intake__tab intake__tab--on" : "intake__tab"}
              onClick={() => setMode("chat")}
            >
              Talk it through
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "form"}
              className={mode === "form" ? "intake__tab intake__tab--on" : "intake__tab"}
              onClick={() => setMode("form")}
            >
              Fill the form
            </button>
          </div>

          {/* Both stay mounted: the form holds the answers, and hiding it
              rather than unmounting it is what lets the chat fill it in the
              background and keeps everything typed so far when tabs change. */}
          <div hidden={mode !== "chat"}>
            <ChatPanel
              priceRegion={priceRegion}
              onSlotsChange={setSlots}
              onReadyToPlan={(ready) => {
                setMode("form");
                generatePlan(slotsToPlanInput(ready, priceRegion));
              }}
              disabled={view.status === "loading"}
            />
          </div>

          <div hidden={mode !== "form"}>
            <IntakeForm
              onSubmit={generatePlan}
              disabled={view.status === "loading"}
              prefill={slots}
              onRegionChange={setPriceRegion}
            />
          </div>
        </div>

        <div>
          {view.status === "idle" && <EmptyState />}
          {view.status === "loading" && <LoadingState />}
          {view.status === "error" && <ErrorState message={view.message} onRetry={retry} />}
          {view.status === "success" && (
            <div className="result-enter">
              <PlanResults plan={view.plan} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}