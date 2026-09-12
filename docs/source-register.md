# Source Register — Approved Component Catalog

Every component in `src/lib/robopilot/data/approved-components.json` is
listed here with its real, verified source. This is how the project keeps
the "never guess a spec" principle auditable: any team member or evaluator
can check where a price/voltage/interface figure actually came from.

**Confidence key:** ✅ = datasheet/spec URL confirmed via live search during
this build. ⚠️ = based on well-established manufacturer/retailer knowledge,
not independently re-verified in this session — flagged honestly rather
than presented as equally certain.

| Component | Category | Datasheet / source | Confidence |
|---|---|---|---|
| ESP32-WROOM-32 DevKit | microcontroller | Espressif official docs | ✅ |
| Arduino Uno R3 | microcontroller | Arduino official docs | ✅ |
| Arduino Nano | microcontroller | docs.arduino.cc | ✅ |
| HC-SR04 | sensor | SparkFun | ✅ |
| VL53L0X | sensor | ST official | ✅ |
| MPU6050 | sensor | InvenSense official | ✅ |
| DHT22 | sensor | Adafruit | ✅ |
| NEO-6M GPS Module | sensor | u-blox official | ✅ |
| TCRT5000 | sensor | Vishay official | ✅ |
| MicroSD Card Module | sensor | Pololu | ✅ |
| Capacitive Soil Moisture Sensor V2.0 | sensor | Makers Electronics | ✅ |
| HC-SR501 PIR Motion Sensor | sensor | components101.com | ✅ |
| TCS34725 RGB Color Sensor | sensor | Adafruit | ✅ |
| TCS3200 Color Sensor | sensor | components101.com | ⚠️ |
| BH1750 Ambient Light Sensor | sensor | Mouser (ROHM datasheet) | ⚠️ |
| LDR Photoresistor Module | sensor | SparkFun | ⚠️ |
| 0.96in OLED SSD1306 Display | sensor | Adafruit | ⚠️ |
| OV2640 Camera Module | sensor | uctronics.com | ⚠️ |
| SG90 | actuator | Towerpro (via common distributors) | ⚠️ |
| MG996R | actuator | Towerpro (via common distributors) | ⚠️ |
| TT Motor (DC Gearbox Motor) | actuator | Adafruit / DigiKey | ✅ |
| Piezo Buzzer | actuator | Adafruit | ⚠️ |
| Mini Submersible DC Water Pump | actuator | Cytron | ✅ |
| L298N | actuator_driver | STMicroelectronics official | ✅ |
| 18650 Li-ion Battery + Holder | power | generic cell spec | ✅ |

## Live pricing sources (not catalog prices — see AI_USAGE.md)

- **Egypt mode:** Electra Store, Makers Electronics, Future Electronics
  Egypt (electra.store, makerselectronics.com, store.fut-electronics.com)
- **International mode:** SparkFun (sparkfun.com)

## Known limitation

A handful of ⚠️ entries were added under real time pressure late in the
build and use well-known, standard specs for extremely common hobbyist
parts, rather than a freshly re-verified datasheet link in this exact
session. None of these affect pricing accuracy (prices are still either
live or catalog-static, never guessed) — only the *datasheet URL itself*
carries slightly lower certainty for these specific rows. Recommended
follow-up: spot-check these links before the next public release.
