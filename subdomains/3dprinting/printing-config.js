/**
 * 3D Printing & Physical Computing Subdomain Config
 *
 * Configuration for live printer camera stream, OctoPrint / Moonraker telemetry,
 * and project prototype status feeds.
 */
const PRINTING_CONFIG = {
  title: "3D Printing & Physical Computing Lab",
  subtitle: "Custom CAD, Micro-controllers & Prototype Fabrication",
  printerName: "Lab Printer 01",
  status: "STANDBY", // STANDBY, PRINTING, OFFLINE
  offlineMessage: "3D printer stream & telemetry feed are currently offline. Check back during active print jobs!",
  specs: [
    { label: "firmware", value: "Klipper / Moonraker" },
    { label: "cad", value: "Fusion 360 / OpenSCAD" },
    { label: "materials", value: "PETG, PLA+, TPU, ABS" },
    { label: "mcu", value: "ESP32 / STM32 / Raspberry Pi" }
  ]
};

export default PRINTING_CONFIG;
