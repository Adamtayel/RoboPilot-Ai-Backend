"use client";

import { useMemo, useRef, useState } from "react";
import type {
  ArchitectureBlock,
  ComponentLine,
  CompatibilityCheck,
} from "@/lib/robopilot/schema";
import { buildDiagramModel, type PlacedComponent } from "@/lib/robopilot/diagram";

/**
 * The plan, drawn.
 *
 * Every mark here comes from `diagram.ts`, which derives the picture from the
 * plan rather than arranging it to look finished: an edge exists only where a
 * block's output name actually matches another's input, a component sits
 * under a block only on a word both share, and anything that matched nothing
 * is drawn in its own lane rather than tucked in somewhere plausible.
 *
 * Colours are literal hex rather than CSS variables on purpose. The export
 * buttons serialize this SVG and hand it to the user as a file, and a
 * `var(--signal)` that resolves against a stylesheet the file does not carry
 * would export as black. What is on screen and what lands in their report
 * have to be the same drawing.
 */

const C = {
  bg: "#0a0e13",
  panel: "#141a22",
  line: "#222b36",
  lineStrong: "#2e3a48",
  ink: "#e8edf2",
  inkDim: "#96a3b2",
  inkFaint: "#5d6b7c",
  signal: "#3de1c8",
  solder: "#c98a54",
  danger: "#e0725a",
} as const;

const FONT_UI = "'Space Grotesk', system-ui, sans-serif";
const FONT_MONO = "'IBM Plex Mono', ui-monospace, monospace";

const PAD = 28;
const BLOCK_W = 212;
const BLOCK_H = 64;
const COL_GAP = 112;
const CHIP_H = 22;
const CHIP_GAP = 6;
const GROUP_GAP = 34;
const LANE_GAP = 46;

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

/** Rough width of a chip's label, good enough to size a rounded rect. */
function chipWidth(label: string): number {
  return Math.min(BLOCK_W, Math.max(74, label.length * 6.1 + 18));
}

export function ArchitectureDiagram({
  blocks,
  components,
  checks,
}: {
  blocks: ArchitectureBlock[];
  components: ComponentLine[];
  checks: CompatibilityCheck[];
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [busy, setBusy] = useState<"svg" | "png" | null>(null);

  const model = useMemo(
    () => buildDiagramModel(blocks, components, checks),
    [blocks, components, checks]
  );

  /* ----- layout ------------------------------------------------------- */

  const layout = useMemo(() => {
    const columns = new Map<number, typeof model.blocks>();
    for (const b of model.blocks) {
      const list = columns.get(b.layer) ?? [];
      list.push(b);
      columns.set(b.layer, list);
    }

    const positioned = new Map<
      string,
      { x: number; y: number; h: number; entry: (typeof model.blocks)[number] }
    >();
    let tallest = 0;

    // Open ports and parallel edge labels both stack upward above a block,
    // so the top padding has to clear the deepest stack on the diagram rather
    // than assume one row.
    const deepestPortStack = Math.max(
      1,
      ...model.blocks.flatMap((b) =>
        (["in", "out"] as const).map(
          (dir) => model.openPorts.filter((p) => p.block === b.block.name && p.direction === dir).length
        )
      )
    );
    const deepestEdgeStack = Math.max(
      1,
      ...model.blocks.map(
        (b) => model.edges.filter((e) => e.from === b.block.name).length
      )
    );
    const headroom = 18 + Math.max(deepestPortStack, deepestEdgeStack) * 12;

    for (const [layer, list] of [...columns.entries()].sort((a, b) => a[0] - b[0])) {
      const x = PAD + layer * (BLOCK_W + COL_GAP);
      let y = PAD + headroom;
      for (const entry of list) {
        const chipsH = entry.components.length * (CHIP_H + CHIP_GAP);
        const h = BLOCK_H + (chipsH > 0 ? chipsH + 8 : 0);
        positioned.set(entry.block.name, { x, y, h, entry });
        y += h + GROUP_GAP;
      }
      // y now carries one trailing GROUP_GAP past the last block in the
      // column; without removing it the unplaced lane floats off on its own.
      tallest = Math.max(tallest, y - GROUP_GAP);
    }

    const laneY = tallest + LANE_GAP;
    const laneH = model.unplaced.length > 0 ? 30 + model.unplaced.length * (CHIP_H + CHIP_GAP) : 0;

    return {
      positioned,
      width: PAD * 2 + model.columns * BLOCK_W + (model.columns - 1) * COL_GAP,
      height: laneY + laneH + PAD,
      laneY,
    };
  }, [model]);

  /** Conflicts between two components that both landed on the diagram. */
  const drawnConflicts = useMemo(() => {
    const where = new Map<string, { x: number; y: number }>();
    for (const [, pos] of layout.positioned) {
      pos.entry.components.forEach((p, i) => {
        where.set(p.component.name, {
          x: pos.x + 12,
          y: pos.y + BLOCK_H + 8 + i * (CHIP_H + CHIP_GAP) + CHIP_H / 2,
        });
      });
    }
    model.unplaced.forEach((p, i) => {
      where.set(p.component.name, {
        x: PAD + 12,
        y: layout.laneY + 30 + i * (CHIP_H + CHIP_GAP) + CHIP_H / 2,
      });
    });

    return model.conflicts
      .map((c) => ({ check: c, a: where.get(c.componentA), b: where.get(c.componentB) }))
      .filter((c): c is { check: CompatibilityCheck; a: { x: number; y: number }; b: { x: number; y: number } } =>
        Boolean(c.a && c.b)
      );
  }, [model, layout]);

  /* ----- export ------------------------------------------------------- */

  function serialize(): string {
    const svg = svgRef.current;
    if (!svg) return "";
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    return new XMLSerializer().serializeToString(clone);
  }

  function saveBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadSvg() {
    setBusy("svg");
    try {
      saveBlob(new Blob([serialize()], { type: "image/svg+xml" }), "robopilot-architecture.svg");
    } finally {
      setBusy(null);
    }
  }

  function downloadPng() {
    setBusy("png");
    const source = serialize();
    const img = new Image();
    // 2x so the result stays sharp when it is dropped into slides or a report.
    const scale = 2;
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = layout.width * scale;
      canvas.height = layout.height * scale;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        setBusy(null);
        return;
      }
      ctx.fillStyle = C.bg;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (blob) saveBlob(blob, "robopilot-architecture.png");
        setBusy(null);
      }, "image/png");
    };
    img.onerror = () => setBusy(null);
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`;
  }

  /* ----- description, for screen readers and for anyone who cannot see it */

  const description = useMemo(() => {
    const flow = model.edges.length
      ? model.edges.map((e) => `${e.from} sends ${e.label} to ${e.to}`).join("; ")
      : "No block output matches another block's input, so no connections are drawn";
    const unplaced = model.unplaced.length
      ? `. ${model.unplaced.length} component(s) could not be placed under any block: ${model.unplaced
          .map((p) => p.component.name)
          .join(", ")}`
      : "";
    const conflicts = model.conflicts.length
      ? `. ${model.conflicts.length} component pair(s) failed the logic-level check`
      : "";
    return `Architecture of ${model.blocks.length} blocks. ${flow}${unplaced}${conflicts}.`;
  }, [model]);

  if (blocks.length === 0) return null;

  const chip = (p: PlacedComponent, x: number, y: number, key: string) => {
    const label = truncate(p.component.name, 30);
    const conflicted = model.conflicts.some(
      (c) => c.componentA === p.component.name || c.componentB === p.component.name
    );
    const stroke = conflicted ? C.danger : p.component.status === "approved" ? C.lineStrong : C.solder;
    return (
      <g key={key}>
        <title>
          {p.component.role}
          {p.ambiguous ? ` — could also belong to ${p.candidates.slice(1).join(", ")}` : ""}
          {p.matchedOn.length ? ` — placed on "${p.matchedOn.join(", ")}"` : ""}
        </title>
        <rect
          x={x}
          y={y}
          width={chipWidth(label)}
          height={CHIP_H}
          rx={4}
          fill={C.bg}
          stroke={stroke}
          strokeWidth={1}
          strokeDasharray={p.ambiguous ? "3 2" : undefined}
        />
        <text
          x={x + 9}
          y={y + CHIP_H / 2 + 3.5}
          fill={conflicted ? C.danger : C.inkDim}
          fontFamily={FONT_MONO}
          fontSize={10}
        >
          {label}
        </text>
      </g>
    );
  };

  return (
    <div className="diagram">
      <div className="diagram__bar">
        <p className="diagram__note">
          Edges are drawn only where a block&rsquo;s output name matches another
          block&rsquo;s input. Unmatched ports and unplaced parts are left visible.
        </p>
        <div className="diagram__actions">
          <button type="button" className="btn-secondary btn-quiet--sm" onClick={downloadSvg} disabled={busy !== null}>
            {busy === "svg" ? "Saving…" : "Download SVG"}
          </button>
          <button type="button" className="btn-secondary btn-quiet--sm" onClick={downloadPng} disabled={busy !== null}>
            {busy === "png" ? "Rendering…" : "Download PNG"}
          </button>
        </div>
      </div>

      <div className="diagram__scroll">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          width={layout.width}
          height={layout.height}
          role="img"
          aria-label={description}
          className="diagram__svg"
        >
          <defs>
            <marker id="rp-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
              <path d="M0 0 L8 4 L0 8 z" fill={C.signal} />
            </marker>
          </defs>

          <rect x={0} y={0} width={layout.width} height={layout.height} fill={C.bg} />

          {/* edges first, so blocks sit on top of them */}
          {model.edges.map((edge, i) => {
            const from = layout.positioned.get(edge.from);
            const to = layout.positioned.get(edge.to);
            if (!from || !to) return null;

            // Two blocks often share more than one signal (Sensing feeds
            // Control both distance_cm and heading_deg). Drawn naively, those
            // labels land on the same pixel and read as one corrupted word.
            // Each parallel edge gets its own lane and its own label row.
            const parallel = model.edges.filter((e) => e.from === edge.from && e.to === edge.to);
            const rank = parallel.indexOf(edge);
            const spread = (rank - (parallel.length - 1) / 2) * 13;

            const x1 = from.x + BLOCK_W;
            const y1 = from.y + BLOCK_H / 2;
            const x2 = to.x;
            const y2 = to.y + BLOCK_H / 2 + spread;
            const mid = x1 + Math.max(24, (x2 - x1) / 2) + rank * 9;
            const path =
              Math.abs(y1 - y2) < 1
                ? `M${x1} ${y1} H${x2 - 7}`
                : `M${x1} ${y1} H${mid} V${y2} H${x2 - 7}`;

            return (
              <g key={`${edge.from}-${edge.to}-${edge.label}-${i}`}>
                <path d={path} fill="none" stroke={C.signal} strokeWidth={1.3} opacity={0.75} markerEnd="url(#rp-arrow)" />
                <text
                  x={x1 + 9}
                  y={y1 - 8 - rank * 12}
                  fill={C.inkFaint}
                  fontFamily={FONT_MONO}
                  fontSize={9.5}
                >
                  {truncate(edge.label, 14)}
                </text>
              </g>
            );
          })}

          {/* failed compatibility pairs, drawn between the two parts */}
          {drawnConflicts.map(({ check, a, b }, i) => (
            <g key={`conflict-${i}`}>
              <title>{check.reason}</title>
              <path
                d={`M${a.x} ${a.y} C${a.x - 26} ${a.y}, ${b.x - 26} ${b.y}, ${b.x} ${b.y}`}
                fill="none"
                stroke={C.danger}
                strokeWidth={1.2}
                strokeDasharray="4 3"
                opacity={0.9}
              />
            </g>
          ))}

          {/* blocks and their parts */}
          {[...layout.positioned.values()].map(({ x, y, entry }) => (
            <g key={entry.block.name}>
              <rect x={x} y={y} width={BLOCK_W} height={BLOCK_H} rx={7} fill={C.panel} stroke={C.lineStrong} />
              <text x={x + 12} y={y + 23} fill={C.ink} fontFamily={FONT_UI} fontSize={13} fontWeight={600}>
                {truncate(entry.block.name, 26)}
              </text>
              <text x={x + 12} y={y + 41} fill={C.inkDim} fontFamily={FONT_UI} fontSize={10.5}>
                {truncate(entry.block.purpose, 34)}
              </text>
              <text x={x + 12} y={y + 55} fill={C.inkFaint} fontFamily={FONT_MONO} fontSize={9}>
                {entry.block.inputs.length} in · {entry.block.outputs.length} out
              </text>

              {entry.components.map((p, i) =>
                chip(p, x + 12, y + BLOCK_H + 8 + i * (CHIP_H + CHIP_GAP), `${entry.block.name}-${p.component.name}-${i}`)
              )}
            </g>
          ))}

          {/* open ports: a short stub with the signal name, left deliberately loose */}
          {model.openPorts.map((port, i) => {
            const pos = layout.positioned.get(port.block);
            if (!pos) return null;
            const isIn = port.direction === "in";
            // A block commonly has several open ports on the same side — a
            // power block alone had "5V rail for ESP…" and "Motor voltage r…"
            // landing on identical coordinates and rendering as one smear.
            // Each side stacks upward from the block's top edge.
            const sameSide = model.openPorts.filter(
              (p) => p.block === port.block && p.direction === port.direction
            );
            const rank = sameSide.indexOf(port);
            const x = isIn ? pos.x : pos.x + BLOCK_W;
            const y = pos.y - 9 - rank * 12;
            return (
              <g key={`port-${i}`} opacity={0.85}>
                <title>
                  {isIn
                    ? `${port.port} is consumed by ${port.block} but no block produces it`
                    : `${port.port} is produced by ${port.block} but no block consumes it`}
                </title>
                <circle cx={isIn ? x + 10 : x - 10} cy={y} r={2.6} fill="none" stroke={C.solder} strokeWidth={1.2} />
                <text
                  x={isIn ? x + 17 : x - 16}
                  y={y + 3.5}
                  textAnchor={isIn ? "start" : "end"}
                  fill={C.solder}
                  fontFamily={FONT_MONO}
                  fontSize={9}
                >
                  {truncate(port.port, 13)}
                </text>
              </g>
            );
          })}

          {/* the lane for parts that matched no block */}
          {model.unplaced.length > 0 && (
            <g>
              <line
                x1={PAD}
                y1={layout.laneY}
                x2={layout.width - PAD}
                y2={layout.laneY}
                stroke={C.line}
                strokeDasharray="4 4"
              />
              <text x={PAD} y={layout.laneY + 18} fill={C.inkFaint} fontFamily={FONT_UI} fontSize={11}>
                Not placed under any block — decide where these belong
              </text>
              {model.unplaced.map((p, i) =>
                chip(p, PAD + 12, layout.laneY + 30 + i * (CHIP_H + CHIP_GAP), `unplaced-${p.component.name}-${i}`)
              )}
            </g>
          )}
        </svg>
      </div>

      <ul className="diagram__legend">
        <li>
          <span className="diagram__key diagram__key--signal" aria-hidden="true" /> matched signal
        </li>
        <li>
          <span className="diagram__key diagram__key--solder" aria-hidden="true" /> open port
        </li>
        <li>
          <span className="diagram__key diagram__key--danger" aria-hidden="true" /> logic-level conflict
        </li>
        <li>
          <span className="diagram__key diagram__key--dashed" aria-hidden="true" /> ambiguous placement
        </li>
      </ul>
    </div>
  );
}
