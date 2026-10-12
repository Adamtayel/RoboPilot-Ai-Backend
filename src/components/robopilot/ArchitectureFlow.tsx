import type { ArchitectureBlock } from "@/lib/robopilot/schema";

export function ArchitectureFlow({ blocks }: { blocks: ArchitectureBlock[] }) {
  return (
    <div className="flow">
      {blocks.map((block, i) => (
        <div key={block.name} style={{ display: "flex", alignItems: "center" }}>
          <div className="flow__node">
            <p className="flow__node-name">{block.name}</p>
            <p className="flow__node-purpose">{block.purpose}</p>
            <div className="flow__node-io">
              in: {block.inputs.join(", ") || "—"}
              <br />
              out: {block.outputs.join(", ") || "—"}
            </div>
          </div>
          {/* No connector arrow here any more. This view lists the blocks;
              it does not claim they connect. Which ports actually meet is
              derived in diagram.ts and drawn by ArchitectureDiagram — the
              arrow that used to sit here asserted a link between every pair
              of adjacent blocks purely because they were adjacent. */}
        </div>
      ))}
    </div>
  );
}
