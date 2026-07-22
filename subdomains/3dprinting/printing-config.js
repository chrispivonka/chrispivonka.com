/**
 * 3D Printing & Physical Computing Subdomain Config
 *
 * Configuration for live printer camera stream, OctoPrint / Moonraker telemetry,
 * and project prototype status feeds.
 */
const PRINTING_CONFIG = {
  title: "3D Printing & Physical Computing Lab",
  subtitle: "Custom CAD, Micro-controllers & Prototype Fabrication",
  printerName: "Bambu / Voron CoreXY",
  status: "STANDBY", // STANDBY, PRINTING, OFFLINE
  offlineMessage: "3D printer stream & telemetry feed are currently offline. Check back during active print jobs!",
  specs: [
    { label: "firmware", value: "Klipper / Moonraker" },
    { label: "cad software", value: "Fusion 360 / OpenSCAD" },
    { label: "materials", value: "PETG, PLA+, TPU, ABS" },
    { label: "mcus", value: "ESP32 / STM32 / Raspberry Pi" }
  ],
  telemetry: {
    extruderTemp: "210°C / 210°C",
    bedTemp: "60°C / 60°C",
    fanSpeed: "100%",
    speedFactor: "100%",
    activeFilament: "PETG Charcoal Grey (1.75mm)"
  },
  projects: [
    {
      id: "esp32-sensor-case",
      title: "ESP32 Environmental Sensor Housing",
      category: "IoT Enclosure",
      material: "PETG",
      desc: "Weatherproof snap-fit enclosure for ESP32 micro-controller, BME280 temperature sensor, and OLED telemetry display.",
      codeSnippet: "// cad/esp32_case.scad\nmodule esp32_housing() {\n  difference() {\n    cube([65, 38, 22], center=true);\n    translate([0, 0, 2]) cube([61, 34, 20], center=true);\n  }\n}"
    },
    {
      id: "rpi-din-mount",
      title: "Raspberry Pi DIN Rail Mount",
      category: "Rack Mount Hardware",
      material: "PLA+",
      desc: "Modular DIN-rail mounting bracket for Raspberry Pi 4 server cluster with active 40mm fan ducting.",
      codeSnippet: "// cad/din_bracket.scad\nmodule din_clip() {\n  linear_extrude(height=15)\n    polygon(points=[[0,0], [35,0], [35,7.5], [30,7.5], [30,3.5], [0,3.5]]);\n}"
    },
    {
      id: "magic-mirror-bezel",
      title: "Smart Mirror Corner Bezels & Mounts",
      category: "Physical Integration",
      material: "ABS",
      desc: "Precision 3D printed corner joinery and display retention clips for two-way mirror glass assembly.",
      codeSnippet: "// cad/bezel_corner.scad\nmodule corner_bracket() {\n  union() {\n    cube([40, 15, 15]);\n    rotate([0, 0, 90]) cube([40, 15, 15]);\n  }\n}"
    }
  ]
};

export default PRINTING_CONFIG;
