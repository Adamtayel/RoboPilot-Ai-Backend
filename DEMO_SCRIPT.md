# RoboPilot — 3-Minute Demo Script

## 0:00–0:30 — What it is

"RoboPilot decomposes a robotics project brief into an architecture, a
priced bill of materials, compatibility checks, a timeline, and risks —
using an AI to propose structure, but **never** to invent a price, a
voltage compatibility result, or a risk score. Those three are 100%
deterministic code, computed from a verified component catalog."

*(Open the live site, point at the two mode buttons.)*

"It also checks real, live current prices — from three Egyptian
electronics stores in Egypt Mode, or SparkFun internationally."

## 0:30–1:30 — Live generation

Click **Fill example** → **Generate plan**. While it loads:

"While this runs: the AI only proposes architecture blocks and candidate
component names. Every price you're about to see either comes from a live
scrape of a real store page, or from our own 14+... [18/26]-item verified
catalog — never from the AI's memory."

When it lands, point at:
- **Source column** — real store names, not "catalog" for most rows
- **Compatibility section** — a genuine logic-level mismatch, explained
- **Risks section** — the budget risk that reads "cannot be assessed" (not
  a false "safe") when components are unresolved

## 1:30–2:15 — The safety story (this is the strongest part)

"During real testing, we found a live-scraped price return $0.15 for a
$9.50 ESP32 board — the extractor had matched a category-menu link by
mistake. Our plausibility check caught it and fell back to the catalog
price automatically, before a user ever saw the wrong number."

*(Optional: show `docs/evaluation.md` Case 4 briefly.)*

"9 of our 10 documented evaluation cases are real incidents like this one
— not synthetic test scenarios — each with the actual log line and the
commit that fixed it."

## 2:15–2:45 — Handling ambiguity

"We also tested a deliberately contradictory request — 'use ESP32 and
Arduino together' with a $20 budget. The AI flagged the contradiction
itself in its assumptions, and the risk engine independently confirmed it
from the real BOM total — two separate layers agreeing the input didn't
add up, instead of one silently overriding the other."

## 2:45–3:00 — Close

"Everything here — the live pricing, the DeepSeek extraction layer, the
26-component catalog, the UI — was built and tested in this session, with
every fix backed by a real incident, not a guess. Happy to go deeper into
any part of the architecture."
