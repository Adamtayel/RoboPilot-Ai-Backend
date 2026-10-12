import { describe, expect, it } from "vitest";
import {
  buildDiagramModel,
  deriveEdges,
  layerBlocks,
  normalizePort,
  openPorts,
  placeComponents,
} from "@/lib/robopilot/diagram";
import type { ArchitectureBlock, ComponentLine } from "@/lib/robopilot/schema";

const BLOCKS: ArchitectureBlock[] = [
  {
    name: "Sensing",
    purpose: "Detect obstacle distance and orientation.",
    inputs: ["environment"],
    outputs: ["distance_cm", "heading_deg"],
  },
  {
    name: "Control",
    purpose: "Decide motor commands from sensor readings.",
    inputs: ["distance_cm", "heading_deg"],
    outputs: ["motor_command"],
  },
  {
    name: "Actuation",
    purpose: "Drive motors based on control commands.",
    inputs: ["motor_command"],
    outputs: ["motion"],
  },
];

const line = (name: string, role: string): ComponentLine => ({
  role,
  name,
  quantity: 1,
  unitPriceUsd: 1,
  totalPriceUsd: 1,
  datasheetUrl: "",
  status: "approved",
  priceSource: "catalog",
});

/* --------------------------------------------------------------------- */
/* Edges exist only where a signal actually matches                       */
/* --------------------------------------------------------------------- */

describe("deriveEdges", () => {
  it("connects blocks on a matching signal name", () => {
    const edges = deriveEdges(BLOCKS);
    expect(edges).toContainEqual({ from: "Sensing", to: "Control", label: "distance_cm" });
    expect(edges).toContainEqual({ from: "Control", to: "Actuation", label: "motor_command" });
  });

  it("emits one edge per matching signal, so a two-signal link shows both", () => {
    const edges = deriveEdges(BLOCKS).filter((e) => e.from === "Sensing" && e.to === "Control");
    expect(edges.map((e) => e.label).sort()).toEqual(["distance_cm", "heading_deg"]);
  });

  // --- The reason this module exists. The old view drew an arrow between ---
  // --- every pair of adjacent blocks whether or not anything connected.  ---
  it("draws NOTHING between adjacent blocks that do not share a signal", () => {
    const unrelated: ArchitectureBlock[] = [
      { name: "A", purpose: "", inputs: ["power"], outputs: ["telemetry"] },
      { name: "B", purpose: "", inputs: ["camera_frame"], outputs: ["detections"] },
    ];
    expect(deriveEdges(unrelated)).toEqual([]);
  });

  it("matches across differences in spacing, case and punctuation", () => {
    const spelled: ArchitectureBlock[] = [
      { name: "A", purpose: "", inputs: [], outputs: ["Distance (CM)"] },
      { name: "B", purpose: "", inputs: ["distance_cm"], outputs: [] },
    ];
    expect(deriveEdges(spelled)).toHaveLength(1);
  });

  it("does NOT match a port that is merely similar", () => {
    // "distance" and "distance_cm" may be different signals. Guessing here
    // would draw a wire the design never specified.
    const similar: ArchitectureBlock[] = [
      { name: "A", purpose: "", inputs: [], outputs: ["distance_cm"] },
      { name: "B", purpose: "", inputs: ["distance"], outputs: [] },
    ];
    expect(deriveEdges(similar)).toEqual([]);
  });

  it("never connects a block to itself", () => {
    const loop: ArchitectureBlock[] = [
      { name: "A", purpose: "", inputs: ["state"], outputs: ["state"] },
    ];
    expect(deriveEdges(loop)).toEqual([]);
  });

  it("ignores empty or punctuation-only ports", () => {
    const empty: ArchitectureBlock[] = [
      { name: "A", purpose: "", inputs: [], outputs: ["—"] },
      { name: "B", purpose: "", inputs: ["—"], outputs: [] },
    ];
    expect(deriveEdges(empty)).toEqual([]);
  });
});

describe("normalizePort", () => {
  it("reduces spelling differences to one key", () => {
    expect(normalizePort("Distance (cm)")).toBe(normalizePort("distance_cm"));
  });
  it("returns an empty key for a port with no letters or digits", () => {
    expect(normalizePort("— / —")).toBe("");
  });
});

/* --------------------------------------------------------------------- */
/* Loose ends stay visible                                                */
/* --------------------------------------------------------------------- */

describe("openPorts", () => {
  it("reports the system's own inputs and outputs as open", () => {
    const open = openPorts(BLOCKS);
    expect(open).toContainEqual({ block: "Sensing", port: "environment", direction: "in" });
    expect(open).toContainEqual({ block: "Actuation", port: "motion", direction: "out" });
  });

  it("reports an input nothing produces, which is a real gap in the design", () => {
    const gap: ArchitectureBlock[] = [
      { name: "Control", purpose: "", inputs: ["battery_level"], outputs: [] },
    ];
    expect(openPorts(gap)).toContainEqual({
      block: "Control",
      port: "battery_level",
      direction: "in",
    });
  });

  it("does not report a port that is connected", () => {
    const open = openPorts(BLOCKS);
    expect(open.some((p) => p.port === "motor_command")).toBe(false);
  });
});

/* --------------------------------------------------------------------- */
/* Components are placed on evidence, or not at all                       */
/* --------------------------------------------------------------------- */

describe("placeComponents", () => {
  it("places a part under the block whose text names what it does", () => {
    const placed = placeComponents([line("VL53L0X", "obstacle distance sensor")], BLOCKS);
    expect(placed[0]!.block).toBe("Sensing");
    expect(placed[0]!.matchedOn).toContain("distance");
    expect(placed[0]!.ambiguous).toBe(false);
  });

  // --- Found by this suite: an L298N "motor driver" matches Control (which ---
  // --- emits motor_command) and Actuation (which consumes it) equally well. ---
  // --- Nothing in the plan says which owns it, so it is not quietly filed.  ---
  it("flags a genuine tie instead of letting array order decide it", () => {
    const placed = placeComponents([line("L298N", "motor driver")], BLOCKS);
    expect(placed[0]!.ambiguous).toBe(true);
    expect(placed[0]!.candidates).toEqual(["Control", "Actuation"]);
    expect(placed[0]!.block).toBe("Control"); // stable, and marked as a tie
  });

  it("prefers the block with more matching words over a weaker match", () => {
    const blocks: ArchitectureBlock[] = [
      { name: "Power", purpose: "Supply motor current.", inputs: [], outputs: ["rail"] },
      { name: "Drive", purpose: "Motor driver stage for the wheels.", inputs: [], outputs: [] },
    ];
    const placed = placeComponents([line("L298N", "motor driver")], blocks);
    expect(placed[0]!.block).toBe("Drive");
    expect(placed[0]!.ambiguous).toBe(false);
  });

  it("leaves a part unplaced rather than filing it under a guess", () => {
    const placed = placeComponents([line("18650 Li-ion Battery + Holder", "power")], BLOCKS);
    expect(placed[0]!.block).toBeNull();
    expect(placed[0]!.matchedOn).toEqual([]);
  });

  it("records the word the placement rests on, so it can be argued with", () => {
    const placed = placeComponents([line("HC-SR04", "obstacle distance sensor")], BLOCKS);
    expect(placed[0]!.block).toBe("Sensing");
    expect(placed[0]!.matchedOn.length).toBeGreaterThan(0);
  });

  it("ignores short and generic words so unrelated parts are not dragged together", () => {
    // "sensor" and "module" are stop words; "the"/"and" are below the floor.
    const vague: ArchitectureBlock[] = [
      { name: "Sensing", purpose: "A sensor module for the system.", inputs: [], outputs: [] },
    ];
    expect(placeComponents([line("OV2640 Camera Module", "sensor")], vague)[0]!.block).toBeNull();
  });
});

/* --------------------------------------------------------------------- */
/* Layout follows the signal, not the array order                         */
/* --------------------------------------------------------------------- */

describe("layerBlocks", () => {
  it("orders blocks by how deep they sit in the signal flow", () => {
    const layers = layerBlocks(BLOCKS, deriveEdges(BLOCKS));
    expect(layers.get("Sensing")).toBe(0);
    expect(layers.get("Control")).toBe(1);
    expect(layers.get("Actuation")).toBe(2);
  });

  it("re-orders blocks the model emitted out of sequence", () => {
    const shuffled = [BLOCKS[2]!, BLOCKS[0]!, BLOCKS[1]!];
    const layers = layerBlocks(shuffled, deriveEdges(shuffled));
    expect(layers.get("Sensing")).toBe(0);
    expect(layers.get("Actuation")).toBe(2);
  });

  it("terminates on a cycle instead of hanging", () => {
    const cyclic: ArchitectureBlock[] = [
      { name: "A", purpose: "", inputs: ["loop_b"], outputs: ["loop_a"] },
      { name: "B", purpose: "", inputs: ["loop_a"], outputs: ["loop_b"] },
    ];
    const layers = layerBlocks(cyclic, deriveEdges(cyclic));
    expect(layers.size).toBe(2);
    for (const v of layers.values()) expect(Number.isFinite(v)).toBe(true);
  });

  it("puts every block with no incoming signal in the first column", () => {
    const parallel: ArchitectureBlock[] = [
      { name: "A", purpose: "", inputs: [], outputs: ["x"] },
      { name: "B", purpose: "", inputs: [], outputs: ["y"] },
    ];
    const layers = layerBlocks(parallel, deriveEdges(parallel));
    expect(layers.get("A")).toBe(0);
    expect(layers.get("B")).toBe(0);
  });
});

/* --------------------------------------------------------------------- */
/* The assembled model                                                    */
/* --------------------------------------------------------------------- */

describe("buildDiagramModel", () => {
  const components = [
    line("ESP32-WROOM-32 DevKit", "microcontroller"),
    line("HC-SR04", "obstacle distance sensor"),
    line("L298N", "motor driver"),
    line("18650 Li-ion Battery + Holder", "power"),
  ];

  it("lays blocks out in columns along the signal flow", () => {
    const model = buildDiagramModel(BLOCKS, components, []);
    expect(model.columns).toBe(3);
    expect(model.blocks.map((b) => b.layer)).toEqual([0, 1, 2]);
  });

  it("keeps unplaced components in their own lane instead of hiding them", () => {
    const model = buildDiagramModel(BLOCKS, components, []);
    expect(model.unplaced.map((p) => p.component.name)).toContain("18650 Li-ion Battery + Holder");
  });

  it("accounts for every component exactly once", () => {
    const model = buildDiagramModel(BLOCKS, components, []);
    const drawn = model.blocks.flatMap((b) => b.components).length + model.unplaced.length;
    expect(drawn).toBe(components.length);
  });

  it("carries only the failed compatibility checks through as conflicts", () => {
    const model = buildDiagramModel(BLOCKS, components, [
      { componentA: "ESP32", componentB: "HC-SR04", interface: "GPIO", compatible: false, reason: "mismatch" },
      { componentA: "ESP32", componentB: "L298N", interface: "PWM", compatible: true, reason: "ok" },
    ]);
    expect(model.conflicts).toHaveLength(1);
    expect(model.conflicts[0]!.componentB).toBe("HC-SR04");
  });

  it("produces a usable model from a single block with no edges", () => {
    const model = buildDiagramModel([BLOCKS[0]!], [], []);
    expect(model.columns).toBe(1);
    expect(model.rows).toBe(1);
    expect(model.edges).toEqual([]);
  });

  it("is deterministic — the same plan always draws the same diagram", () => {
    const a = buildDiagramModel(BLOCKS, components, []);
    const b = buildDiagramModel(BLOCKS, components, []);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
