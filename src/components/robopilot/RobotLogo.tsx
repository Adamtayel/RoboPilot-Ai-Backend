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
