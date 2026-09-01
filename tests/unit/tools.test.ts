import { describe, expect, it } from "vitest";
import { check_compatibility, estimate_bom, project_risk } from "@/lib/robopilot/tools";

describe("estimate_bom", () => {
  it("computes a correct total for approved components", () => {
    const result = estimate_bom([
      { role: "microcontroller", candidateName: "ESP32-WROOM-32 DevKit", quantity: 1 },
      { role: "sensor", candidateName: "HC-SR04", quantity: 2 },
    ]);
    expect(result.unresolvedCount).toBe(0);
    expect(result.lines).toHaveLength(2);
    // 9.5 * 1 + 3.5 * 2 = 16.5
    expect(result.totalUsd).toBe(16.5);
  });

  it("matches components by alias, case-insensitively", () => {
    const result = estimate_bom([
      { role: "sensor", candidateName: "ultrasonic distance sensor", quantity: 1 },
    ]);
    const [line] = result.lines;
    expect(line?.status).toBe("approved");
    expect(line?.name).toBe("HC-SR04");
  });

  it("flags an unknown component instead of guessing a price", () => {
    const result = estimate_bom([
      { role: "sensor", candidateName: "Definitely Not A Real Sensor 9000", quantity: 1 },
    ]);
    const [line] = result.lines;
    expect(result.unresolvedCount).toBe(1);
    expect(line?.status).toBe("not_in_catalog");
    expect(line?.unitPriceUsd).toBe(0);
    expect(result.totalUsd).toBe(0);
  });

  it("is deterministic: same input always produces the same output", () => {
    const input = [{ role: "sensor", candidateName: "MPU6050", quantity: 3 }];
    expect(estimate_bom(input)).toEqual(estimate_bom(input));
  });
});

describe("check_compatibility", () => {
  it("flags a logic-level mismatch between a 5V sensor and a 3.3V-only MCU", () => {
    const results = check_compatibility([
      { role: "microcontroller", candidateName: "ESP32-WROOM-32 DevKit", quantity: 1 },
      { role: "sensor", candidateName: "HC-SR04", quantity: 1 },
    ]);
    const pair = results.find((r) => r.componentB === "HC-SR04");
    expect(pair).toBeDefined();
    expect(pair!.compatible).toBe(false);
  });

  it("confirms compatibility when logic levels overlap", () => {
    const results = check_compatibility([
      { role: "microcontroller", candidateName: "ESP32-WROOM-32 DevKit", quantity: 1 },
      { role: "sensor", candidateName: "VL53L0X", quantity: 1 },
    ]);
    const pair = results.find((r) => r.componentB === "VL53L0X");
    expect(pair?.compatible).toBe(true);
  });

  it("returns no results when no microcontroller is selected", () => {
    const results = check_compatibility([{ role: "sensor", candidateName: "HC-SR04", quantity: 1 }]);
    expect(results).toHaveLength(0);
  });

  it("silently skips components that are not in the catalog (estimate_bom already flags them)", () => {
    const results = check_compatibility([
      { role: "microcontroller", candidateName: "ESP32-WROOM-32 DevKit", quantity: 1 },
      { role: "sensor", candidateName: "Unknown Sensor XYZ", quantity: 1 },
    ]);
    expect(results).toHaveLength(0);
  });
});

describe("project_risk", () => {
  const oneMilestone = [{ name: "M1", description: "d", dependsOn: [], estimatedDays: 3 }];

  it("raises budget risk when the BOM total exceeds the stated budget", () => {
    const risks = project_risk(oneMilestone, {
      unresolvedComponentCount: 0,
      incompatiblePairCount: 0,
      totalEstimatedDays: 3,
      budgetUsd: 20,
      bomTotalUsd: 50,
    });
    const budgetRisk = risks.find((r) => r.category === "budget");
    expect(budgetRisk).toBeDefined();
    expect(budgetRisk!.likelihood).not.toBe("low");
  });

  it("does not raise a budget risk when no budget was stated", () => {
    const risks = project_risk(oneMilestone, {
      unresolvedComponentCount: 0,
      incompatiblePairCount: 0,
      totalEstimatedDays: 3,
      bomTotalUsd: 50,
    });
    expect(risks.find((r) => r.category === "budget")).toBeUndefined();
  });

  it("raises component_availability risk only when something is unresolved", () => {
    const withUnresolved = project_risk(oneMilestone, {
      unresolvedComponentCount: 2,
      incompatiblePairCount: 0,
      totalEstimatedDays: 3,
      bomTotalUsd: 10,
    });
    expect(withUnresolved.find((r) => r.category === "component_availability")).toBeDefined();

    const withoutUnresolved = project_risk(oneMilestone, {
      unresolvedComponentCount: 0,
      incompatiblePairCount: 0,
      totalEstimatedDays: 3,
      bomTotalUsd: 10,
    });
    expect(withoutUnresolved.find((r) => r.category === "component_availability")).toBeUndefined();
  });

  it("computes a deeper schedule risk for longer dependency chains", () => {
    const chain = [
      { name: "A", description: "d", dependsOn: [], estimatedDays: 3 },
      { name: "B", description: "d", dependsOn: ["A"], estimatedDays: 3 },
      { name: "C", description: "d", dependsOn: ["B"], estimatedDays: 3 },
      { name: "D", description: "d", dependsOn: ["C"], estimatedDays: 3 },
    ];
    const risks = project_risk(chain, {
      unresolvedComponentCount: 0,
      incompatiblePairCount: 0,
      totalEstimatedDays: 12,
      bomTotalUsd: 10,
    });
    const scheduleRisk = risks.find((r) => r.category === "schedule");
    expect(scheduleRisk!.likelihood).toBe("high");
  });

  it("guards against circular dependencies instead of infinite-looping", () => {
    const circular = [
      { name: "A", description: "d", dependsOn: ["B"], estimatedDays: 1 },
      { name: "B", description: "d", dependsOn: ["A"], estimatedDays: 1 },
    ];
    expect(() =>
      project_risk(circular, {
        unresolvedComponentCount: 0,
        incompatiblePairCount: 0,
        totalEstimatedDays: 2,
        bomTotalUsd: 5,
      })
    ).not.toThrow();
  });

  it("sorts risks by descending score", () => {
    const risks = project_risk(
      [
        { name: "A", description: "d", dependsOn: [], estimatedDays: 3 },
        { name: "B", description: "d", dependsOn: ["A"], estimatedDays: 3 },
        { name: "C", description: "d", dependsOn: ["B"], estimatedDays: 3 },
        { name: "D", description: "d", dependsOn: ["C"], estimatedDays: 3 },
      ],
      {
        unresolvedComponentCount: 4,
        incompatiblePairCount: 3,
        totalEstimatedDays: 40,
        bomTotalUsd: 10,
      }
    );
    for (let i = 1; i < risks.length; i++) {
      expect(risks[i - 1]?.score).toBeGreaterThanOrEqual(risks[i]?.score ?? 0);
    }
  });
});
