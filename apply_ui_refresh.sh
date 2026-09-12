cat > src/components/robopilot/RobotLogo.tsx << 'FILE_EOF_1'
interface RobotLogoProps {
  size?: number;
  state?: "idle" | "thinking";
  className?: string;
}

/**
 * A minimal, angular robot face built from plain SVG shapes — no external
 * image assets, so it stays crisp at any size and costs nothing to load.
 * In "thinking" state (used while a plan is generating) the eyes pulse and
 * a scan-line sweeps the face; in "idle" state it just breathes gently.
 */
export function RobotLogo({ size = 96, state = "idle", className = "" }: RobotLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={`robot-logo robot-logo--${state} ${className}`}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <clipPath id="robotFaceClip">
          <path d="M20 30 L35 14 H65 L80 30 V72 L65 88 H35 L20 72 Z" />
        </clipPath>
        <linearGradient id="scanGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--copper-bright)" stopOpacity="0" />
          <stop offset="50%" stopColor="var(--copper-bright)" stopOpacity="0.55" />
          <stop offset="100%" stopColor="var(--copper-bright)" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* antennae */}
      <line x1="34" y1="14" x2="30" y2="4" stroke="var(--copper)" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="30" cy="4" r="2.6" fill="var(--copper-bright)" />
      <line x1="66" y1="14" x2="70" y2="4" stroke="var(--copper)" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="70" cy="4" r="2.6" fill="var(--copper-bright)" />

      {/* head outline (hex-ish, angular) */}
      <path
        d="M20 30 L35 14 H65 L80 30 V72 L65 88 H35 L20 72 Z"
        fill="var(--bg)"
        stroke="var(--copper)"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />

      <g clipPath="url(#robotFaceClip)">
        {/* eyes */}
        <circle className="robot-eye" cx="38" cy="44" r="7" fill="none" stroke="var(--copper)" strokeWidth="2" />
        <circle className="robot-eye-core" cx="38" cy="44" r="3" fill="var(--copper-bright)" />
        <circle className="robot-eye" cx="62" cy="44" r="7" fill="none" stroke="var(--copper)" strokeWidth="2" />
        <circle className="robot-eye-core" cx="62" cy="44" r="3" fill="var(--copper-bright)" />

        {/* mouth grille */}
        <rect x="35" y="62" width="4" height="10" rx="1" fill="var(--copper)" opacity="0.8" />
        <rect x="43" y="62" width="4" height="10" rx="1" fill="var(--copper)" opacity="0.8" />
        <rect x="51" y="62" width="4" height="10" rx="1" fill="var(--copper)" opacity="0.8" />
        <rect x="59" y="62" width="4" height="10" rx="1" fill="var(--copper)" opacity="0.8" />

        {/* scan line, only visible while thinking (CSS drives the motion) */}
        <rect className="robot-scan" x="18" y="10" width="64" height="14" fill="url(#scanGradient)" />
      </g>
    </svg>
  );
}
FILE_EOF_1

cat > src/app/globals.css << 'FILE_EOF_2'
@import url("https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap");

:root {
  --bg: #0d1712;
  --bg-raised: #142019;
  --line: #24352c;
  --ink: #eaf2ec;
  --ink-dim: #9db3a6;
  --ink-faint: #5e7568;
  --copper: #c97d3e;
  --copper-bright: #e9a35f;
  --ok: #6fbf8b;
  --warn: #e0b64f;
  --danger: #d97757;
  --radius: 10px;
  --radius-lg: 16px;
  --font-display: "Space Grotesk", system-ui, sans-serif;
  --font-mono: "IBM Plex Mono", ui-monospace, monospace;
}

* {
  box-sizing: border-box;
}

html,
body {
  background: var(--bg);
  color: var(--ink);
  font-family: var(--font-mono);
  margin: 0;
  padding: 0;
}

/* ---------------------------------------------------------------------- */
/* Background grid + drifting motifs (kept subtle: low opacity, slow)     */
/* ---------------------------------------------------------------------- */

.page-bg {
  position: relative;
  min-height: 100vh;
  background-image:
    linear-gradient(rgba(201, 125, 62, 0.06) 1px, transparent 1px),
    linear-gradient(90deg, rgba(201, 125, 62, 0.06) 1px, transparent 1px);
  background-size: 34px 34px;
  overflow-x: hidden;
}

.page-bg::before,
.page-bg::after {
  content: "";
  position: absolute;
  pointer-events: none;
  opacity: 0.08;
  background: var(--copper-bright);
}

/* a drifting gear, pure CSS (conic-gradient teeth), very low visual weight */
.bg-gear {
  position: absolute;
  border-radius: 50%;
  background:
    repeating-conic-gradient(var(--copper) 0deg 12deg, transparent 12deg 30deg);
  opacity: 0.05;
  animation: spin-slow 60s linear infinite;
  pointer-events: none;
}
.bg-gear--1 { width: 260px; height: 260px; top: -60px; right: -60px; }
.bg-gear--2 { width: 160px; height: 160px; bottom: 8%; left: -50px; animation-duration: 46s; animation-direction: reverse; }

@keyframes spin-slow {
  to { transform: rotate(360deg); }
}

/* a faint rocket trail drifting across, one-shot-feeling but looping slowly */
.bg-rocket {
  position: absolute;
  top: 12%;
  left: -5%;
  font-size: 22px;
  opacity: 0.10;
  animation: drift-rocket 34s linear infinite;
  pointer-events: none;
}
@keyframes drift-rocket {
  0% { transform: translate(0, 0) rotate(35deg); opacity: 0; }
  8% { opacity: 0.12; }
  92% { opacity: 0.12; }
  100% { transform: translate(115vw, -18vh) rotate(35deg); opacity: 0; }
}

@media (prefers-reduced-motion: reduce) {
  .bg-gear, .bg-rocket, .robot-eye-core, .robot-scan, .result-enter, .mode-pill-indicator {
    animation: none !important;
    transition: none !important;
  }
}

/* ---------------------------------------------------------------------- */
/* Header                                                                  */
/* ---------------------------------------------------------------------- */

.site-header {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 40px 48px 8px;
  position: relative;
  z-index: 1;
}

.site-title {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 40px;
  letter-spacing: -0.01em;
  margin: 0;
  background: linear-gradient(135deg, var(--ink) 30%, var(--copper-bright) 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.site-tagline {
  font-family: var(--font-mono);
  color: var(--ink-dim);
  font-size: 14px;
  margin: 4px 0 0;
}

/* ---------------------------------------------------------------------- */
/* Layout                                                                  */
/* ---------------------------------------------------------------------- */

.layout {
  display: grid;
  grid-template-columns: minmax(320px, 420px) 1fr;
  gap: 28px;
  padding: 16px 48px 64px;
  align-items: start;
  position: relative;
  z-index: 1;
}

@media (max-width: 900px) {
  .layout {
    grid-template-columns: 1fr;
    padding: 12px 18px 48px;
  }
  .site-header {
    padding: 28px 18px 4px;
  }
  .site-title {
    font-size: 30px;
  }
}

.panel {
  background: var(--bg-raised);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  padding: 24px;
}

/* ---------------------------------------------------------------------- */
/* Form fields                                                             */
/* ---------------------------------------------------------------------- */

.field {
  margin-bottom: 20px;
}

.field__label {
  display: block;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--ink-dim);
  margin-bottom: 8px;
}

.field__hint {
  font-size: 12px;
  color: var(--ink-faint);
  margin: 8px 0 0;
  line-height: 1.5;
}

.input,
.select {
  width: 100%;
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  color: var(--ink);
  font-family: var(--font-mono);
  font-size: 14px;
  padding: 11px 13px;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.input:focus,
.select:focus {
  outline: none;
  border-color: var(--copper);
  box-shadow: 0 0 0 3px rgba(201, 125, 62, 0.15);
}

.list-row {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}

.list-row .input {
  flex: 1;
}

.icon-btn {
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  color: var(--ink-dim);
  width: 40px;
  cursor: pointer;
  font-size: 16px;
  transition: border-color 0.15s ease, color 0.15s ease;
}
.icon-btn:hover:not(:disabled) {
  border-color: var(--danger);
  color: var(--danger);
}
.icon-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.add-row-btn {
  background: transparent;
  border: 1px dashed var(--line);
  border-radius: var(--radius);
  color: var(--ink-dim);
  font-family: var(--font-mono);
  font-size: 13px;
  padding: 9px 12px;
  width: 100%;
  cursor: pointer;
  transition: border-color 0.15s ease, color 0.15s ease;
}
.add-row-btn:hover:not(:disabled) {
  border-color: var(--copper);
  color: var(--copper-bright);
}

.grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}
@media (max-width: 480px) {
  .grid-2 {
    grid-template-columns: 1fr;
  }
}

/* ---------------------------------------------------------------------- */
/* Region toggle — segmented control with a sliding active indicator      */
/* ---------------------------------------------------------------------- */

.region-toggle {
  position: relative;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: 4px;
}

.mode-pill-indicator {
  position: absolute;
  top: 4px;
  bottom: 4px;
  width: calc(50% - 6px);
  background: linear-gradient(135deg, rgba(201, 125, 62, 0.22), rgba(233, 163, 95, 0.12));
  border: 1px solid var(--copper);
  border-radius: 7px;
  transition: transform 0.28s cubic-bezier(0.4, 0, 0.2, 1);
  pointer-events: none;
}
.mode-pill-indicator--right {
  transform: translateX(calc(100% + 6px));
}

.region-btn {
  position: relative;
  z-index: 1;
  background: transparent;
  border: none;
  border-radius: 7px;
  color: var(--ink-dim);
  font-family: var(--font-mono);
  font-size: 13px;
  font-weight: 500;
  padding: 11px 10px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  transition: color 0.2s ease;
}
.region-btn:hover:not(:disabled) {
  color: var(--ink);
}
.region-btn--active {
  color: var(--copper-bright);
  font-weight: 600;
}
.region-btn .currency-badge {
  font-size: 10px;
  font-family: var(--font-mono);
  border: 1px solid currentColor;
  border-radius: 4px;
  padding: 1px 5px;
  opacity: 0.8;
}

/* ---------------------------------------------------------------------- */
/* Buttons                                                                 */
/* ---------------------------------------------------------------------- */

.submit-row {
  display: flex;
  gap: 10px;
  margin-top: 24px;
}

.btn-primary {
  flex: 1;
  background: linear-gradient(135deg, var(--copper-bright), var(--copper));
  border: none;
  border-radius: var(--radius);
  color: #1a1006;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 14px;
  padding: 13px 18px;
  cursor: pointer;
  box-shadow: 0 4px 16px rgba(201, 125, 62, 0.25);
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}
.btn-primary:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 6px 20px rgba(201, 125, 62, 0.35);
}
.btn-primary:disabled {
  opacity: 0.6;
  cursor: wait;
  transform: none;
}

.btn-secondary {
  background: transparent;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  color: var(--ink-dim);
  font-family: var(--font-mono);
  font-size: 14px;
  padding: 13px 18px;
  cursor: pointer;
  transition: border-color 0.15s ease, color 0.15s ease;
}
.btn-secondary:hover:not(:disabled) {
  border-color: var(--copper);
  color: var(--copper-bright);
}

.error-text {
  color: var(--danger);
  font-size: 13px;
  margin: -8px 0 16px;
}

/* ---------------------------------------------------------------------- */
/* Robot logo animation states                                            */
/* ---------------------------------------------------------------------- */

.robot-logo--idle {
  animation: breathe 4.5s ease-in-out infinite;
}
@keyframes breathe {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.035); }
}

.robot-logo--thinking .robot-eye-core {
  animation: eye-pulse 1s ease-in-out infinite;
}
@keyframes eye-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.35; }
}

.robot-logo--thinking .robot-scan {
  animation: scan-sweep 1.6s ease-in-out infinite;
}
@keyframes scan-sweep {
  0% { transform: translateY(0); }
  100% { transform: translateY(64px); }
}

/* ---------------------------------------------------------------------- */
/* Empty / loading state                                                   */
/* ---------------------------------------------------------------------- */

.state-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 72px 32px;
  min-height: 360px;
}

.state-panel__title {
  font-family: var(--font-display);
  font-size: 26px;
  font-weight: 700;
  margin: 20px 0 8px;
  color: var(--ink);
}

.state-panel__body {
  font-family: var(--font-mono);
  font-size: 14px;
  color: var(--ink-dim);
  max-width: 440px;
  line-height: 1.6;
}

/* ---------------------------------------------------------------------- */
/* Results reveal                                                          */
/* ---------------------------------------------------------------------- */

.result-enter {
  animation: result-in 0.5s cubic-bezier(0.16, 1, 0.3, 1) both;
}
@keyframes result-in {
  from { opacity: 0; transform: translateY(14px); }
  to { opacity: 1; transform: translateY(0); }
}

/* ---------------------------------------------------------------------- */
/* Data table (BOM etc.)                                                   */
/* ---------------------------------------------------------------------- */

.table-wrap {
  overflow-x: auto;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.data-table th {
  text-align: left;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-size: 11px;
  color: var(--ink-faint);
  padding: 10px 12px;
  border-bottom: 1px solid var(--line);
}

.data-table td {
  padding: 12px;
  border-bottom: 1px solid var(--line);
  vertical-align: top;
}

.data-table .num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.mono {
  font-family: var(--font-mono);
}

.status-pill {
  display: inline-block;
  border-radius: 999px;
  padding: 3px 10px;
  font-size: 11px;
  border: 1px solid;
}
.status-pill--ok {
  color: var(--ok);
  border-color: var(--ok);
}
.status-pill--warn {
  color: var(--danger);
  border-color: var(--danger);
}

.bom-total {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  align-items: baseline;
  padding: 16px 12px 4px;
  font-family: var(--font-mono);
}
.bom-total strong {
  color: var(--copper-bright);
  font-size: 20px;
  font-family: var(--font-display);
}
FILE_EOF_2

cat > src/components/robopilot/IntakeForm.tsx << 'FILE_EOF_3'
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
  projectName: "Autonomous Guardian Rover",
  requirements: [
    "Detect obstacles within 30cm",
    "Follow a black line on a white floor",
  ],
  constraints: ["Budget under $80"],
};

// Kept in sync with live-pricing.ts's EGP_TO_USD_FALLBACK_RATE on the
// backend. Only used to convert what the user typed while the LE label is
// showing back into the USD value the API actually expects — the number
// they see and type always stays in the currency the label says.
const EGP_TO_USD_DISPLAY_RATE = 0.021;

export function IntakeForm({ onSubmit, disabled }: IntakeFormProps) {
  const [projectName, setProjectName] = useState("");
  const [requirements, setRequirements] = useState<string[]>([""]);
  const [constraints, setConstraints] = useState<string[]>([]);
  const [budgetUsd, setBudgetUsd] = useState("");
  const [targetPlatform, setTargetPlatform] =
    useState<PlanRequestBody["targetPlatform"]>("unspecified");
  const [priceRegion, setPriceRegion] = useState<PlanRequestBody["priceRegion"]>("egypt");
  const [formError, setFormError] = useState<string | null>(null);

  const isEgypt = priceRegion === "egypt";

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
    setBudgetUsd(isEgypt ? String(Math.round(80 / EGP_TO_USD_DISPLAY_RATE)) : "80");
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
      // The field shows LE in Egypt mode and USD in International mode, but
      // the API's budgetUsd always expects USD — convert here so what the
      // user typed is interpreted the way the label told them it would be.
      body.budgetUsd = isEgypt
        ? Math.round(parsedBudget * EGP_TO_USD_DISPLAY_RATE * 100) / 100
        : parsedBudget;
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
          placeholder="e.g. Autonomous Guardian Rover"
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
          <div className={isEgypt ? "mode-pill-indicator" : "mode-pill-indicator mode-pill-indicator--right"} />
          <button
            type="button"
            className={isEgypt ? "region-btn region-btn--active" : "region-btn"}
            onClick={() => setPriceRegion("egypt")}
            disabled={disabled}
            aria-pressed={isEgypt}
          >
            Egypt <span className="currency-badge">LE</span>
          </button>
          <button
            type="button"
            className={!isEgypt ? "region-btn region-btn--active" : "region-btn"}
            onClick={() => setPriceRegion("international")}
            disabled={disabled}
            aria-pressed={!isEgypt}
          >
            International <span className="currency-badge">$</span>
          </button>
        </div>
        <p className="field__hint">
          {isEgypt
            ? "Prices checked live against Electra Store, Makers Electronics and Future Electronics Egypt."
            : "Prices checked live against SparkFun."}
        </p>
      </div>

      <div className="grid-2">
        <div className="field">
          <label className="field__label" htmlFor="budget">
            Budget ({isEgypt ? "LE" : "USD"}, optional)
          </label>
          <input
            id="budget"
            className="input"
            inputMode="decimal"
            value={budgetUsd}
            onChange={(e) => setBudgetUsd(e.target.value)}
            placeholder={isEgypt ? "e.g. 800" : "e.g. 60"}
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
FILE_EOF_3

cat > src/components/robopilot/EmptyState.tsx << 'FILE_EOF_4'
import { RobotLogo } from "./RobotLogo";

export function EmptyState() {
  return (
    <div className="panel state-panel">
      <RobotLogo size={88} state="idle" />
      <h2 className="state-panel__title">Create your first robot</h2>
      <p className="state-panel__body">
        Fill in the project requirements on the left and generate a plan. The
        result will show the proposed architecture, a priced bill of
        materials, compatibility checks, a milestone timeline and project
        risks.
      </p>
    </div>
  );
}
FILE_EOF_4

cat > src/components/robopilot/LoadingState.tsx << 'FILE_EOF_5'
import { RobotLogo } from "./RobotLogo";

export function LoadingState() {
  return (
    <div className="panel state-panel">
      <RobotLogo size={96} state="thinking" />
      <h2 className="state-panel__title">Thinking…</h2>
      <p className="state-panel__body">
        Decomposing the requirements, checking the approved catalog, and
        pricing components live. This usually takes a few seconds.
      </p>
    </div>
  );
}
FILE_EOF_5

echo "UI files updated. Now do the 3 manual page.tsx edits described in chat."
