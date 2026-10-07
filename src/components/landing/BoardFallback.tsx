/**
 * The still version of the hero board, drawn as flat SVG.
 *
 * Shown instead of the 3D scene on narrow/low-power screens, when the
 * visitor has asked for reduced motion, and while the real scene's chunk is
 * still loading. It is deliberately the same subject from the same angle, so
 * swapping between them is not a change of content — only of fidelity.
 */
export function BoardFallback() {
  return (
    <svg
      className="hero-board-still"
      viewBox="0 0 520 340"
      role="img"
      aria-label="A development board with an MCU at its centre, connected by signal traces to four peripheral modules."
    >
      <defs>
        <linearGradient id="pcb" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#11393A" />
          <stop offset="100%" stopColor="#0A2426" />
        </linearGradient>
      </defs>

      {/* board, in the same rough perspective as the 3D camera */}
      <g transform="translate(260 180)">
        <polygon points="-170,-52 170,-52 206,54 -206,54" fill="url(#pcb)" stroke="#1B4A47" strokeWidth="1.5" />

        {/* traces out to each module */}
        <g fill="none" stroke="#3DE1C8" strokeWidth="1.6" opacity="0.5">
          <path d="M-36 -8 H-104 V-34 H-150" />
          <path d="M-36 10 H-118 V30 H-158" />
          <path d="M36 -8 H108 V-34 H152" />
          <path d="M36 10 H120 V30 H160" />
        </g>
        <g fill="#3DE1C8">
          <circle cx="-104" cy="-21" r="3" />
          <circle cx="-118" cy="22" r="3" />
          <circle cx="110" cy="-28" r="3" />
          <circle cx="120" cy="24" r="3" />
        </g>

        {/* copper traces that run nowhere, as on a real board */}
        <g fill="none" stroke="#C98A54" strokeWidth="1.2" opacity="0.3">
          <path d="M-120 40 H-20 V24 H70" />
          <path d="M96 -40 V-16 H60" />
        </g>

        {/* MCU package */}
        <rect x="-38" y="-22" width="76" height="44" rx="3" fill="#1A2128" stroke="#2A333D" />
        <rect x="-24" y="-12" width="48" height="24" rx="2" fill="#232C35" />

        {/* shield can */}
        <rect x="-52" y="-46" width="104" height="22" rx="2" fill="#8E9AA6" opacity="0.85" />

        {/* header rails */}
        <g fill="#C98A54">
          {Array.from({ length: 13 }, (_, i) => (
            <rect key={`t${i}`} x={-150 + i * 24} y="-50" width="5" height="7" rx="1" />
          ))}
          {Array.from({ length: 13 }, (_, i) => (
            <rect key={`b${i}`} x={-168 + i * 27} y="44" width="5" height="7" rx="1" />
          ))}
        </g>

        {/* peripheral modules */}
        <g fill="#16202A" stroke="#243240">
          <rect x="-196" y="-44" width="48" height="20" rx="2" />
          <rect x="-200" y="18" width="42" height="24" rx="2" />
          <rect x="150" y="-40" width="50" height="24" rx="2" />
          <rect x="156" y="14" width="44" height="22" rx="2" />
        </g>
        <g fill="#3DE1C8">
          <circle cx="-154" cy="-40" r="2.5" />
          <circle cx="-164" cy="22" r="2.5" />
          <circle cx="194" cy="-36" r="2.5" />
          <circle cx="194" cy="18" r="2.5" />
        </g>
      </g>
    </svg>
  );
}
