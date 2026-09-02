"use client";

import { useState } from "react";

export interface PlanRequestBody {
  projectName: string;
  requirements: string[];
  constraints: string[];
  budgetUsd?: number;
  targetPlatform: "arduino" | "esp32" | "unspecified";
  priceRegion: "egypt" | "international";
}

interface IntakeFormProps {
  onSubmit: (body: PlanRequestBody) => void;
  disabled: boolean;
}

const EXAMPLE = {
  projectName: "Line-following rover",
  requirements: [
    "Detect obstacles within 30cm",
    "Follow a black line on a white floor",
  ],
  constraints: ["Budget under $80"],
};

export function IntakeForm({ onSubmit, disabled }: IntakeFormProps) {
  const [projectName, setProjectName] = useState("");
  const [requirements, setRequirements] = useState<string[]>([""]);
  const [constraints, setConstraints] = useState<string[]>([]);
  const [budgetUsd, setBudgetUsd] = useState("");
  const [targetPlatform, setTargetPlatform] =
    useState<PlanRequestBody["targetPlatform"]>("unspecified");
  const [priceRegion, setPriceRegion] = useState<PlanRequestBody["priceRegion"]>("egypt");
  const [formError, setFormError] = useState<string | null>(null);

  function updateListItem(
    list: string[],
    setList: (v: string[]) => void,
    index: number,
    value: string
  ) {
    const next = [...list];
    next[index] = value;
    setList(next);
  }

  function removeListItem(list: string[], setList: (v: string[]) => void, index: number) {
    setList(list.filter((_, i) => i !== index));
  }

  function fillExample() {
    setProjectName(EXAMPLE.projectName);
    setRequirements(EXAMPLE.requirements);
    setConstraints(EXAMPLE.constraints);
    setBudgetUsd("80");
    setTargetPlatform("esp32");
    setFormError(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    const cleanedRequirements = requirements.map((r) => r.trim()).filter(Boolean);
    const cleanedConstraints = constraints.map((c) => c.trim()).filter(Boolean);

    if (projectName.trim().length < 3) {
      setFormError("Project name needs at least 3 characters.");
      return;
    }
    if (cleanedRequirements.length === 0) {
      setFormError("Add at least one requirement.");
      return;
    }

    const body: PlanRequestBody = {
      projectName: projectName.trim(),
      requirements: cleanedRequirements,
      constraints: cleanedConstraints,
      targetPlatform,
      priceRegion,
    };

    const parsedBudget = budgetUsd.trim() === "" ? undefined : Number(budgetUsd);
    if (parsedBudget !== undefined) {
      if (Number.isNaN(parsedBudget) || parsedBudget <= 0) {
        setFormError("Budget must be a positive number.");
        return;
      }
      body.budgetUsd = parsedBudget;
    }

    onSubmit(body);
  }

  return (
    <form className="panel form" onSubmit={handleSubmit}>
      <div className="field">
        <label className="field__label" htmlFor="projectName">
          Project name
        </label>
        <input
          id="projectName"
          className="input"
          value={projectName}
          onChange={(e) => setProjectName(e.target.value)}
          placeholder="e.g. Line-following rover"
          disabled={disabled}
        />
      </div>

      <div className="field">
        <span className="field__label">Requirements</span>
        {requirements.map((req, i) => (
          <div className="list-row" key={i}>
            <input
              className="input"
              value={req}
              onChange={(e) => updateListItem(requirements, setRequirements, i, e.target.value)}
              placeholder="What should it do?"
              disabled={disabled}
            />
            <button
              type="button"
              className="icon-btn"
              onClick={() => removeListItem(requirements, setRequirements, i)}
              disabled={disabled || requirements.length === 1}
              aria-label="Remove requirement"
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          className="add-row-btn"
          onClick={() => setRequirements([...requirements, ""])}
          disabled={disabled}
        >
          + Add requirement
        </button>
      </div>

      <div className="field">
        <span className="field__label">Constraints (optional)</span>
        {constraints.map((c, i) => (
          <div className="list-row" key={i}>
            <input
              className="input"
              value={c}
              onChange={(e) => updateListItem(constraints, setConstraints, i, e.target.value)}
              placeholder="e.g. Must run on battery power"
              disabled={disabled}
            />
            <button
              type="button"
              className="icon-btn"
              onClick={() => removeListItem(constraints, setConstraints, i)}
              disabled={disabled}
              aria-label="Remove constraint"
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          className="add-row-btn"
          onClick={() => setConstraints([...constraints, ""])}
          disabled={disabled}
        >
          + Add constraint
        </button>
      </div>

      <div className="field">
        <span className="field__label">Component pricing</span>
        <div className="region-toggle" role="group" aria-label="Component pricing region">
          <button
            type="button"
            className={priceRegion === "egypt" ? "region-btn region-btn--active" : "region-btn"}
            onClick={() => setPriceRegion("egypt")}
            disabled={disabled}
            aria-pressed={priceRegion === "egypt"}
          >
            🇪🇬 Egypt Mode
          </button>
          <button
            type="button"
            className={priceRegion === "international" ? "region-btn region-btn--active" : "region-btn"}
            onClick={() => setPriceRegion("international")}
            disabled={disabled}
            aria-pressed={priceRegion === "international"}
          >
            🌍 International Mode
          </button>
        </div>
        <p className="field__hint">
          {priceRegion === "egypt"
            ? "Prices checked live against Electra Store, Makers Electronics and Future Electronics Egypt."
            : "Prices checked live against SparkFun."}
        </p>
      </div>

      <div className="grid-2">
        <div className="field">
          <label className="field__label" htmlFor="budget">
            Budget (USD, optional)
          </label>
          <input
            id="budget"
            className="input"
            inputMode="decimal"
            value={budgetUsd}
            onChange={(e) => setBudgetUsd(e.target.value)}
            placeholder="e.g. 80"
            disabled={disabled}
          />
        </div>
        <div className="field">
          <label className="field__label" htmlFor="platform">
            Target platform
          </label>
          <select
            id="platform"
            className="select"
            value={targetPlatform}
            onChange={(e) =>
              setTargetPlatform(e.target.value as PlanRequestBody["targetPlatform"])
            }
            disabled={disabled}
          >
            <option value="unspecified">No preference</option>
            <option value="esp32">ESP32</option>
            <option value="arduino">Arduino</option>
          </select>
        </div>
      </div>

      {formError && <p className="error-text">{formError}</p>}

      <div className="submit-row">
        <button type="submit" className="btn-primary" disabled={disabled}>
          {disabled ? "Generating…" : "Generate plan"}
        </button>
        <button type="button" className="btn-secondary" onClick={fillExample} disabled={disabled}>
          Fill example
        </button>
      </div>
    </form>
  );
}
