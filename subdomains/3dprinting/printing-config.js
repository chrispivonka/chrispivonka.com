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
  ]
};

export default PRINTING_CONFIG;
