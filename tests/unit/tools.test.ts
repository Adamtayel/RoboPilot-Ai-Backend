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

  // --- Fuzzy fallback matching, added after real Groq output showed the AI ---
  // --- naturally phrases names with extra description text.               ---
  describe("fuzzy fallback matching (real-world AI phrasing)", () => {
    it("resolves a catalog name embedded in a longer AI-generated description", () => {
      const result = estimate_bom([
        {
          role: "environmental sensor",
          candidateName: "DHT22 (AM2302) temperature/humidity sensor",
          quantity: 1,
        },
      ]);
      expect(result.lines[0]?.status).toBe("approved");
      expect(result.lines[0]?.name).toBe("DHT22");
    });

    it("resolves a catalog alias with a vendor prefix added", () => {
      const result = estimate_bom([
        { role: "gps module", candidateName: "u-blox NEO-6M GPS module", quantity: 1 },
      ]);
      expect(result.lines[0]?.status).toBe("approved");
      expect(result.lines[0]?.name).toBe("NEO-6M GPS Module");
    });

    it("resolves a catalog name with a descriptive suffix added", () => {
      const result = estimate_bom([{ role: "actuator", candidateName: "SG90 micro servo", quantity: 1 }]);
      expect(result.lines[0]?.status).toBe("approved");
      expect(result.lines[0]?.name).toBe("SG90");
    });

    it("still refuses to match a genuinely different component", () => {
      const result = estimate_bom([{ role: "microcontroller", candidateName: "Raspberry Pi 4B", quantity: 1 }]);
      expect(result.lines[0]?.status).toBe("not_in_catalog");
    });
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

  it("recognizes Arduino Nano as a valid microcontroller for compatibility checks", () => {
    const results = check_compatibility([
      { role: "microcontroller", candidateName: "Arduino Nano", quantity: 1 },
      { role: "sensor", candidateName: "DHT22", quantity: 1 },
    ]);
    expect(results).toHaveLength(1);
    expect(results[0]?.compatible).toBe(true);
  });
});

describe("project_risk", () => {
  const oneMilestone = [{ name: "M1", description: "d", dependsOn: [], estimatedDays: 3 }];

  it("raises budget risk when the BOM total exceeds the stated budget", () => {
    const risks = project_risk(oneMilestone, {
      unresolvedComponentCount: 0,
      totalComponentCount: 2,
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
      totalComponentCount: 2,
      incompatiblePairCount: 0,
      totalEstimatedDays: 3,
      bomTotalUsd: 50,
    });
    expect(risks.find((r) => r.category === "budget")).toBeUndefined();
  });

  // --- The bug real testing surfaced: a BOM total of $0 from unresolved   ---
  // --- components must never read as "safely under budget".              ---
  describe("budget risk vs. unresolved components", () => {
    it("never reports 'low risk, no action needed' when every component is unresolved", () => {
      const risks = project_risk(oneMilestone, {
        unresolvedComponentCount: 3,
        totalComponentCount: 3,
        incompatiblePairCount: 0,
        totalEstimatedDays: 3,
        budgetUsd: 80,
        bomTotalUsd: 0,
      });
      const budgetRisk = risks.find((r) => r.category === "budget");
      expect(budgetRisk).toBeDefined();
      expect(budgetRisk!.likelihood).not.toBe("low");
      expect(budgetRisk!.description).toMatch(/cannot be assessed/i);
      expect(budgetRisk!.mitigation).not.toMatch(/no action needed/i);
    });

    it("flags the caveat, and avoids 'low' likelihood, when some (not all) components are unresolved", () => {
      const risks = project_risk(oneMilestone, {
        unresolvedComponentCount: 1,
        totalComponentCount: 3,
        incompatiblePairCount: 0,
        totalEstimatedDays: 3,
        budgetUsd: 80,
        bomTotalUsd: 10,
      });
      const budgetRisk = risks.find((r) => r.category === "budget");
      expect(budgetRisk).toBeDefined();
      expect(budgetRisk!.likelihood).not.toBe("low");
      expect(budgetRisk!.description).toMatch(/unpriced/i);
    });

    it("still reports low risk normally when every component resolved and total is well under budget", () => {
      const risks = project_risk(oneMilestone, {
        unresolvedComponentCount: 0,
        totalComponentCount: 3,
        incompatiblePairCount: 0,
        totalEstimatedDays: 3,
        budgetUsd: 80,
        bomTotalUsd: 10,
      });
      const budgetRisk = risks.find((r) => r.category === "budget");
      expect(budgetRisk!.likelihood).toBe("low");
      expect(budgetRisk!.mitigation).toMatch(/no action needed/i);
    });
  });

  it("raises component_availability risk only when something is unresolved", () => {
    const withUnresolved = project_risk(oneMilestone, {
      unresolvedComponentCount: 2,
      totalComponentCount: 2,
      incompatiblePairCount: 0,
      totalEstimatedDays: 3,
      bomTotalUsd: 10,
    });
    expect(withUnresolved.find((r) => r.category === "component_availability")).toBeDefined();

    const withoutUnresolved = project_risk(oneMilestone, {
      unresolvedComponentCount: 0,
      totalComponentCount: 2,
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
      totalComponentCount: 4,
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
        totalComponentCount: 2,
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
        totalComponentCount: 4,
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
