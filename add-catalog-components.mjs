#!/usr/bin/env node
/**
 * Safely adds 3 new components to approved-components.json without
 * touching anything already there, and without needing to know the file's
 * current exact contents. Run from the project root:
 *
 *   node add-catalog-components.mjs
 */
import { readFileSync, writeFileSync } from "fs";

const FILE_PATH = "src/lib/robopilot/data/approved-components.json";

const NEW_COMPONENTS = [
  {
    name: "MicroSD Card Module",
    aliases: ["MicroSD Card Reader Module", "SD Card Module", "Micro SD Breakout Board", "SD Card Breakout"],
    category: "sensor",
    operatingVoltageV: [3.3, 5],
    logicLevelV: [3.3, 5],
    interface: "SPI",
    unitPriceUsd: 1.5,
    datasheetUrl: "https://www.pololu.com/product/2587",
  },
  {
    name: "Capacitive Soil Moisture Sensor V2.0",
    aliases: ["Capacitive Soil Moisture Sensor", "Soil Moisture Sensor", "YL-69 Soil Moisture Sensor", "Soil Hygrometer Sensor"],
    category: "sensor",
    operatingVoltageV: [3.3, 5.5],
    logicLevelV: [3.3, 5],
    interface: "Analog",
    unitPriceUsd: 2.0,
    datasheetUrl: "https://makerselectronics.com/product/capacitive-soil-moisture-sensor-v2-0/",
  },
  {
    name: "Mini Submersible DC Water Pump",
    aliases: ["DC Water Pump", "Submersible Water Pump", "Mini Water Pump", "5V Water Pump", "12V DC Water Pump"],
    category: "actuator",
    operatingVoltageV: [3, 6],
    logicLevelV: [3.3, 5],
    interface: "GPIO",
    unitPriceUsd: 3.0,
    datasheetUrl: "https://www.cytron.io/p-micro-submersible-water-pump-dc-3v-5v",
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
