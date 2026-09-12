"use client";

import { useState } from "react";
import type { RoboPilotPlan } from "@/lib/robopilot/schema";
import { IntakeForm, type PlanRequestBody } from "@/components/robopilot/IntakeForm";
import { EmptyState } from "@/components/robopilot/EmptyState";
import { LoadingState } from "@/components/robopilot/LoadingState";
import { ErrorState } from "@/components/robopilot/ErrorState";
import { PlanResults } from "@/components/robopilot/PlanResults";

type ViewState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; plan: RoboPilotPlan };

export default function Home() {
  const [view, setView] = useState<ViewState>({ status: "idle" });
  const [lastRequest, setLastRequest] = useState<PlanRequestBody | null>(null);

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
      <div className="bg-gear bg-gear--1" />
      <div className="bg-gear bg-gear--2" />
      <div className="bg-rocket">🚀</div>
      <div className="bg-rocket bg-rocket--2">🚀</div>
      <div className="bg-satellite">🛰️</div>
      <div className="bg-drone">🤖</div>
      <header className="site-header">
        <div>
          <h1 className="site-title">RoboPilot</h1>
          <p className="site-tagline">robotics &amp; embedded project engineering copilot</p>
        </div>
      </header>

      <div className="layout">
        <IntakeForm onSubmit={generatePlan} disabled={view.status === "loading"} />

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