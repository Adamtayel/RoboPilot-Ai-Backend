/**
 * Single source of truth for the hand-set EGP→USD fallback rate.
 *
 * This lives in its own module with no imports because it is needed on BOTH
 * sides: the server (live-pricing.ts, when the live exchange-rate API call
 * fails) and the client (IntakeForm.tsx, to convert the budget field between
 * LE and USD). It used to be declared twice with a comment telling whoever
 * changed one to remember the other — a drift waiting to happen, since the
 * two copies going out of sync shows up as a wrong budget figure rather than
 * as an error.
 *
 * Expect this number to go stale; refresh it periodically. It is a documented
 * approximation, never a price, and never sourced from an AI model's memory.
 */
export const EGP_TO_USD_FALLBACK_RATE = 0.021; // ≈ 47.6 EGP per USD
