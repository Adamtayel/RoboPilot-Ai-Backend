#!/usr/bin/env node
/**
 * Adds 8 more real components to approved-components.json, discovered
 * from real testing across three project domains (security bot, color
 * sorting arm, weather station) in both Egypt and International modes.
 * Safe to re-run — skips anything already in the catalog.
 *
 *   node add-catalog-components-2.mjs
 */
import { readFileSync, writeFileSync } from "fs";

const FILE_PATH = "src/lib/robopilot/data/approved-components.json";

const NEW_COMPONENTS = [
  {
    name: "HC-SR501 PIR Motion Sensor",
    aliases: ["PIR Motion Sensor", "HC-SR501", "PIR Sensor"],
    category: "sensor",
    operatingVoltageV: [4.5, 20],
    logicLevelV: [3.3],
    interface: "GPIO",
    unitPriceUsd: 2.0,
    datasheetUrl: "https://components101.com/sensors/hc-sr501-pir-sensor",
  },
  {
    name: "Piezo Buzzer",
    aliases: ["Active Buzzer", "Piezo Speaker", "Alarm Buzzer"],
    category: "actuator",
    operatingVoltageV: [3, 5],
    logicLevelV: [3.3, 5],
    interface: "GPIO",
    unitPriceUsd: 1.0,
    datasheetUrl: "https://www.adafruit.com/product/160",
  },
  {
    name: "OV2640 Camera Module",
    aliases: ["OV2640", "ESP32-CAM Camera Module", "Camera Module"],
    category: "sensor",
    operatingVoltageV: [3.3, 3.3],
    logicLevelV: [3.3],
    interface: "I2C",
    unitPriceUsd: 8.0,
    datasheetUrl: "https://www.uctronics.com/download/OV2640DS.pdf",
  },
  {
    name: "TCS34725 RGB Color Sensor",
    aliases: ["TCS34725", "RGB Color Sensor", "Color Sensor (I2C)"],
    category: "sensor",
    operatingVoltageV: [3.3, 5],
    logicLevelV: [3.3, 5],
    interface: "I2C",
    unitPriceUsd: 8.0,
    datasheetUrl: "https://www.adafruit.com/product/1334",
  },
  {
    name: "TCS3200 Color Sensor",
    aliases: ["TCS3200", "Color Sensor (frequency output)"],
    category: "sensor",
    operatingVoltageV: [2.7, 5.5],
    logicLevelV: [3.3, 5],
    interface: "GPIO",
    unitPriceUsd: 3.0,
    datasheetUrl: "https://components101.com/sensors/tcs3200-color-sensor-pinout-datasheet",
  },
  {
    name: "BH1750 Ambient Light Sensor",
    aliases: ["BH1750", "Light Sensor (I2C)", "Ambient Light Sensor"],
    category: "sensor",
    operatingVoltageV: [3.3, 5],
    logicLevelV: [3.3, 5],
    interface: "I2C",
    unitPriceUsd: 2.0,
    datasheetUrl: "https://www.mouser.com/datasheet/2/348/bh1750fvi-e-186247.pdf",
  },
  {
    name: "LDR Photoresistor Module",
    aliases: ["LDR", "Photoresistor", "Light Dependent Resistor Module", "LDR Sensor Module"],
    category: "sensor",
    operatingVoltageV: [3.3, 5],
    logicLevelV: [3.3, 5],
    interface: "Analog",
    unitPriceUsd: 1.0,
    datasheetUrl: "https://www.sparkfun.com/products/9088",
  },
  {
    name: "0.96in OLED SSD1306 Display",
    aliases: [
      "SSD1306",
      "0.96\" OLED Display",
      "OLED Display (I2C)",
      "0.96 inch I2C OLED Display SSD1306",
    ],
    category: "sensor",
    operatingVoltageV: [3.3, 5],
    logicLevelV: [3.3, 5],
    interface: "I2C",
    unitPriceUsd: 5.0,
    datasheetUrl: "https://www.adafruit.com/product/326",
  },
];

const raw = readFileSync(FILE_PATH, "utf8");
const catalog = JSON.parse(raw);

let addedCount = 0;
for (const component of NEW_COMPONENTS) {
  const alreadyExists = catalog.some((c) => c.name === component.name);
  if (alreadyExists) {
    console.log(`Skipping "${component.name}" — already in catalog.`);
    continue;
  }
  catalog.push(component);
  addedCount++;
  console.log(`Added "${component.name}".`);
}

writeFileSync(FILE_PATH, JSON.stringify(catalog, null, 2) + "\n", "utf8");
console.log(`\nDone. Added ${addedCount} new component(s). Catalog now has ${catalog.length} total.`);
