/**
 * Pure display/format helpers for the 3D printing page. No DOM or three.js
 * dependencies, so they can be unit tested in Jest.
 */

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const CALIBRATION_FILES = /auto_cali|calibration|flow_cali|pa_cali|_cali_/i;

/**
 * Turn a raw printer file path or project name into something a person can
 * read: "/data/Metadata/plate_8.gcode" -> "Plate 8",
 * "Cable_Clip_v3.gcode.3mf" -> "Cable Clip v3",
 * "/usr/etc/print/auto_cali_for_user_param.gcode" -> "Printer calibration".
 */
export function prettyJobName(raw) {
  if (!raw || typeof raw !== "string") {
    return "Untitled print";
  }
  const trimmed = raw.trim();
  if (CALIBRATION_FILES.test(trimmed)) {
    return "Printer calibration";
  }
  // Strip directories and every printer/slicer extension.
  let name = trimmed.split(/[\\/]/).pop() || trimmed;
  name = name.replace(/(\.(gcode|3mf|stl|obj|step|stp))+$/i, "");

  const plate = name.match(/^plate_(\d+)$/i);
  if (plate) {
    return `Plate ${plate[1]}`;
  }
  name = name.replace(/[_]+/g, " ").replace(/\s{2,}/g, " ").trim();
  return name || "Untitled print";
}

/** Title for a history/telemetry entry, preferring an explicit project title. */
export function jobTitle(entry) {
  if (!entry) {
    return "Untitled print";
  }
  return prettyJobName(entry.title || entry.name || entry.fileName || entry.modelName);
}

/** The model file format from its URL (not its display name). */
export function modelFormatFromUrl(url) {
  const path = String(url || "").split(/[?#]/)[0].toLowerCase();
  if (path.endsWith(".3mf")) {
    return "3mf";
  }
  if (path.endsWith(".stl")) {
    return "stl";
  }
  return null;
}

/** Sniff the format from the bytes: 3MF files are ZIP archives ("PK\x03\x04"). */
export function modelFormatFromBytes(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer, 0, Math.min(4, arrayBuffer.byteLength));
  if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) {
    return "3mf";
  }
  return "stl";
}

/** Find the single sliced plate number in a Bambu .gcode.3mf (Metadata/plate_N.gcode). */
export function slicedPlateNumber(fileNames) {
  const plates = new Set();
  for (const name of fileNames) {
    const m = String(name).match(/^Metadata\/plate_(\d+)\.gcode$/i);
    if (m) {
      plates.add(m[1]);
    }
  }
  return plates.size === 1 ? [...plates][0] : null;
}

/**
 * Parse a 3MF "m00 m01 m02 m10 ... m32" transform into the 16 row-major
 * arguments THREE.Matrix4.set() expects, or null if it's malformed.
 */
export function parse3mfTransform(attr) {
  if (!attr) {
    return null;
  }
  const t = attr.trim().split(/\s+/).map(Number);
  if (t.length !== 12 || t.some(n => Number.isNaN(n))) {
    return null;
  }
  // 3MF uses row vectors: [x y z 1] * M. three.js Matrix4.set() takes row-major
  // for column vectors, so transpose while placing the translation in column 4.
  return [
    t[0], t[3], t[6], t[9],
    t[1], t[4], t[7], t[10],
    t[2], t[5], t[8], t[11],
    0, 0, 0, 1
  ];
}

export function formatUptime(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  if (days > 0) {
    return `${days}d ${hours}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m ${totalSec % 60}s`;
}

/** True when telemetry hasn't been refreshed recently enough to trust. */
export function isTelemetryStale(updatedAt, now = Date.now(), maxAgeMs = 120000) {
  const t = Date.parse(updatedAt || "");
  return Number.isNaN(t) || now - t > maxAgeMs;
}

/**
 * Show a completion time in the viewer's local time zone. Accepts ISO
 * timestamps and the publisher's older "YYYY-MM-DD HH:MM" UTC format.
 */
export function formatCompletedAt(value, locale = undefined, timeZone = undefined) {
  if (!value) {
    return "—";
  }
  const str = String(value).trim();
  const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(str) ? `${str.replace(" ", "T")}:00Z` : str;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) {
    return str;
  }
  return new Date(t).toLocaleString(locale, {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", timeZone
  });
}
