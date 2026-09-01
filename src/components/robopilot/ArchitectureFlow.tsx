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
          {i < blocks.length - 1 && (
            <div className="flow__connector" aria-hidden="true">
              →
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
