/**
 * 3D Printing & Physical Computing Subdomain Config
 *
 * Support for:
 *   1. Bambu Lab RTSP -> Container (go2rtc / MediaMTX) -> YouTube Live / HLS
 *   2. S3 bucket / JSON telemetry polling (/printer-status.json)
 */
const PRINTING_CONFIG = {
  title: "Bambu Lab 3D Printing & Hardware Lab",
  subtitle: "Real-Time Telemetry, Stream Ingestion & CAD Fabrication",
  printerName: "Bambu Lab CoreXY",
  streamMode: "youtube", // "youtube", "hls", "s3_snapshot", "3d_canvas"
  telemetryUrl: "/printer-status.json", // S3 bucket endpoint or gateway API
  offlineMessage: "Bambu Lab printer stream is currently offline. Active print jobs will stream live!",
  bambuStats: {
    printerModel: "Bambu Lab CoreXY",
    firmware: "Bambu OS / RTSP Relay Container",
    amsLoaded: true,
    amsSlots: [
      { slot: 1, material: "PLA+ White", color: "#ffffff" },
      { slot: 2, material: "PETG Charcoal", color: "#333333" },
      { slot: 3, material: "TPU Neon Cyan", color: "#58a6ff" },
      { slot: 4, material: "PVA Support", color: "#d29922" }
    ]
  },
  specs: [
    { label: "printer", value: "Bambu Lab CoreXY" },
    { label: "stream pipeline", value: "Bambu RTSP → Container → YouTube Live / S3" },
    { label: "cad software", value: "Fusion 360 / OpenSCAD" },
    { label: "mcus", value: "ESP32 / STM32 / Raspberry Pi" }
  ],
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
