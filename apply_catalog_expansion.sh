cat > src/lib/robopilot/data/approved-components.json << 'FILE_EOF_1'
[
  {
    "name": "TCRT5000",
    "aliases": [
      "TCRT5000 IR Reflectance Sensor",
      "TCRT5000 Line Tracking Sensor",
      "TCRT5000 Reflective Optical Sensor",
      "IR Reflective Sensor",
      "IR Reflectance Sensor"
    ],
    "category": "sensor",
    "operatingVoltageV": [3.3, 5],
    "logicLevelV": [3.3, 5],
    "interface": "GPIO",
    "unitPriceUsd": 1.5,
    "datasheetUrl": "https://www.vishay.com/docs/83760/tcrt5000.pdf"
  },
  {
    "name": "TT Motor (DC Gearbox Motor)",
    "aliases": [
      "DC Gear Motor",
      "TT Gear Motor",
      "TT DC Gearbox Motor",
      "DC Gearbox Motor",
      "TT Motor"
    ],
    "category": "actuator",
    "operatingVoltageV": [3, 6],
    "logicLevelV": [3.3, 5],
    "interface": "PWM",
    "unitPriceUsd": 2.5,
    "datasheetUrl": "https://media.digikey.com/pdf/Data%20Sheets/Adafruit%20PDFs/3777_Web.pdf"
  },
  {
    "name": "Arduino Nano",
    "aliases": ["Nano", "Arduino Nano V3", "ATmega328P Nano"],
    "category": "microcontroller",
    "operatingVoltageV": [5, 5],
    "logicLevelV": [5],
    "interface": "GPIO",
    "unitPriceUsd": 25.0,
    "datasheetUrl": "https://docs.arduino.cc/hardware/nano/"
  },
  {
    "name": "Arduino Uno R3",
    "aliases": ["Arduino Uno", "Uno R3", "ATmega328P Uno"],
    "category": "microcontroller",
    "operatingVoltageV": [5, 5],
    "logicLevelV": [5],
    "interface": "GPIO",
    "unitPriceUsd": 23.0,
    "datasheetUrl": "https://docs.arduino.cc/hardware/uno-rev3/"
  },
  {
    "name": "ESP32-WROOM-32 DevKit",
    "aliases": ["ESP32 DevKit", "ESP32-WROOM-32", "ESP32 Dev Board"],
    "category": "microcontroller",
    "operatingVoltageV": [3.3, 3.3],
    "logicLevelV": [3.3],
    "interface": "GPIO",
    "unitPriceUsd": 9.5,
    "datasheetUrl": "https://docs.espressif.com/projects/esp-idf/en/stable/esp32/hw-reference/esp32/get-started-devkitc.html"
  },
  {
    "name": "HC-SR04",
    "aliases": ["HC-SR04 Ultrasonic", "Ultrasonic Distance Sensor"],
    "category": "sensor",
    "operatingVoltageV": [5, 5],
    "logicLevelV": [5],
    "interface": "GPIO",
    "unitPriceUsd": 3.5,
    "datasheetUrl": "https://cdn.sparkfun.com/datasheets/Sensors/Proximity/HCSR04.pdf"
  },
  {
    "name": "VL53L0X",
    "aliases": ["VL53L0X ToF", "Time-of-Flight Distance Sensor"],
    "category": "sensor",
    "operatingVoltageV": [2.6, 3.5],
    "logicLevelV": [3.3],
    "interface": "I2C",
    "unitPriceUsd": 6.0,
    "datasheetUrl": "https://www.st.com/resource/en/datasheet/vl53l0x.pdf"
  },
  {
    "name": "MPU6050",
    "aliases": ["MPU-6050", "6-axis IMU"],
    "category": "sensor",
    "operatingVoltageV": [2.375, 3.46],
    "logicLevelV": [3.3],
    "interface": "I2C",
    "unitPriceUsd": 2.5,
    "datasheetUrl": "https://invensense.tdk.com/wp-content/uploads/2015/02/MPU-6000-Datasheet1.pdf"
  },
  {
    "name": "DHT22",
    "aliases": ["AM2302", "Temperature Humidity Sensor"],
    "category": "sensor",
    "operatingVoltageV": [3.3, 6],
    "logicLevelV": [3.3, 5],
    "interface": "GPIO",
    "unitPriceUsd": 5.0,
    "datasheetUrl": "https://www.sparkfun.com/datasheets/Sensors/Temperature/DHT22.pdf"
  },
  {
    "name": "NEO-6M GPS Module",
    "aliases": ["NEO-6M", "GPS Module"],
    "category": "sensor",
    "operatingVoltageV": [2.7, 3.6],
    "logicLevelV": [3.3, 5],
    "interface": "UART",
    "unitPriceUsd": 8.0,
    "datasheetUrl": "https://content.u-blox.com/sites/default/files/products/documents/NEO-6_DataSheet_%28GPS.G6-HW-09005%29.pdf"
  },
  {
    "name": "L298N",
    "aliases": ["L298N Motor Driver", "Dual H-Bridge Driver"],
    "category": "actuator_driver",
    "operatingVoltageV": [5, 35],
    "logicLevelV": [5],
    "interface": "PWM",
    "unitPriceUsd": 4.5,
    "datasheetUrl": "https://www.st.com/resource/en/datasheet/l298.pdf"
  },
  {
    "name": "MG996R",
    "aliases": ["MG996R Servo", "Servo Motor"],
    "category": "actuator",
    "operatingVoltageV": [4.8, 7.2],
    "logicLevelV": [3.3, 5],
    "interface": "PWM",
    "unitPriceUsd": 6.5,
    "datasheetUrl": "https://www.electronicoscaldas.com/datasheet/MG996R.pdf"
  },
  {
    "name": "SG90",
    "aliases": ["SG90 Servo", "Micro Servo"],
    "category": "actuator",
    "operatingVoltageV": [4.8, 6],
    "logicLevelV": [3.3, 5],
    "interface": "PWM",
    "unitPriceUsd": 2.0,
    "datasheetUrl": "https://www.friendlywire.com/projects/rc-lawn-mower-1/SG90-datasheet.pdf"
  },
  {
    "name": "18650 Li-ion Battery + Holder",
    "aliases": ["18650 Battery", "Li-ion Battery Pack"],
    "category": "power",
    "operatingVoltageV": [3.0, 4.2],
    "logicLevelV": [3.3, 5],
    "interface": "GPIO",
    "unitPriceUsd": 7.0,
    "datasheetUrl": "https://docs.arduino.cc/learn/electronics/power-supplies/"
  },
  {
    "name": "Raspberry Pi Pico W",
    "aliases": ["Pico W", "RP2040 Pico W"],
    "category": "microcontroller",
    "operatingVoltageV": [3.3, 3.3],
    "logicLevelV": [3.3],
    "interface": "GPIO",
    "unitPriceUsd": 6.0,
    "datasheetUrl": "https://datasheets.raspberrypi.com/picow/pico-w-datasheet.pdf"
  }
]
FILE_EOF_1

cat > tests/unit/tools.test.ts << 'FILE_EOF_2'
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

  // --- Real testing kept showing these two roles as not_in_catalog ($0.00) ---
  // --- across every live-pricing test — added with real datasheets so     ---
  // --- estimate_bom() now has a genuine reference price for both.         ---
  it("resolves the newly added TCRT5000 line sensor", () => {
    const result = estimate_bom([
      { role: "line_sensor", candidateName: "TCRT5000 IR Reflectance Sensor", quantity: 1 },
    ]);
    expect(result.lines[0]?.status).toBe("approved");
    expect(result.lines[0]?.name).toBe("TCRT5000");
  });

  it("resolves the newly added TT Motor as a generic 'DC Gear Motor'", () => {
    const result = estimate_bom([{ role: "actuator", candidateName: "DC Gear Motor", quantity: 2 }]);
    expect(result.lines[0]?.status).toBe("approved");
    expect(result.lines[0]?.name).toBe("TT Motor (DC Gearbox Motor)");
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
FILE_EOF_2

echo "Done. Run: npm run typecheck && npm test (expect 62 passed)"
