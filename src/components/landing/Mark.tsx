/**
 * The wordmark's glyph: a 3.3 V rail meeting a 5 V rail with a shifter
 * between them. It is the product's actual subject, small enough to work at
 * 20px, and it is not a generic swoosh or a robot face.
 */
export function Mark({ size = 22 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className="mark"
    >
      <path d="M2 8h7l3 8h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="square" />
      <rect x="9.5" y="9.5" width="5" height="5" rx="1" fill="var(--signal)" />
      <circle cx="2.6" cy="8" r="1.4" fill="var(--solder)" />
      <circle cx="21.4" cy="16" r="1.4" fill="var(--solder)" />
    </svg>
  );
}
