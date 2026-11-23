/**
 * @jest-environment node
 */
import {
  escapeHtml, prettyJobName, jobTitle, modelFormatFromUrl, modelFormatFromBytes,
  slicedPlateNumber, parse3mfTransform, formatUptime, isTelemetryStale, formatCompletedAt
} from "../subdomains/3dprinting/printing-format.js";

describe("3D printing display helpers", () => {
  test("prettyJobName turns printer paths into readable names", () => {
    expect(prettyJobName("/data/Metadata/plate_8.gcode")).toBe("Plate 8");
    expect(prettyJobName("Cable_Clip_v3.gcode.3mf")).toBe("Cable Clip v3");
    expect(prettyJobName("/usr/etc/print/auto_cali_for_user_param.gcode")).toBe("Printer calibration");
    expect(prettyJobName("Low_Bypass_Jet_Engine_Model_for_Kit-006_Fan Stator and HPC Core Casings"))
      .toBe("Low Bypass Jet Engine Model for Kit-006 Fan Stator and HPC Core Casings");
    expect(prettyJobName("")).toBe("Untitled print");
    expect(prettyJobName(null)).toBe("Untitled print");
  });

  test("jobTitle prefers the project title over the gcode path", () => {
    expect(jobTitle({ title: "Benchy", name: "/data/Metadata/plate_1.gcode" })).toBe("Benchy");
    expect(jobTitle({ name: "/data/Metadata/plate_1.gcode" })).toBe("Plate 1");
    expect(jobTitle(null)).toBe("Untitled print");
  });

  test("escapeHtml escapes markup", () => {
    expect(escapeHtml("<img src=x onerror=\"a\">")).toBe("&lt;img src=x onerror=&quot;a&quot;&gt;");
  });

  test("model format comes from the URL, not the display name", () => {
    expect(modelFormatFromUrl("/history/job-1.3mf")).toBe("3mf");
    expect(modelFormatFromUrl("./output.stl?v=2")).toBe("stl");
    expect(modelFormatFromUrl("/data/Metadata/plate_1.gcode")).toBeNull();
  });

  test("model format sniffing recognises 3MF zip archives", () => {
    expect(modelFormatFromBytes(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1]).buffer)).toBe("3mf");
    expect(modelFormatFromBytes(new TextEncoder().encode("solid x").buffer)).toBe("stl");
    expect(modelFormatFromBytes(new ArrayBuffer(0))).toBe("stl");
  });

  test("slicedPlateNumber finds the single sliced plate", () => {
    expect(slicedPlateNumber(["3D/3dmodel.model", "Metadata/plate_8.gcode", "Metadata/plate_8.png"])).toBe("8");
    expect(slicedPlateNumber(["Metadata/plate_1.gcode", "Metadata/plate_2.gcode"])).toBeNull();
    expect(slicedPlateNumber(["3D/3dmodel.model"])).toBeNull();
  });

  test("parse3mfTransform transposes 3MF row-vector matrices for three.js", () => {
    expect(parse3mfTransform("1 0 0 0 1 0 0 0 1 10 20 30")).toEqual([
      1, 0, 0, 10,
      0, 1, 0, 20,
      0, 0, 1, 30,
      0, 0, 0, 1
    ]);
    expect(parse3mfTransform("1 0 0")).toBeNull();
    expect(parse3mfTransform(null)).toBeNull();
  });

  test("formatUptime is compact", () => {
    expect(formatUptime(65 * 1000)).toBe("1m 5s");
    expect(formatUptime((2 * 3600 + 5 * 60) * 1000)).toBe("2h 5m");
    expect(formatUptime((3 * 86400 + 4 * 3600) * 1000)).toBe("3d 4h");
  });

  test("isTelemetryStale flags old or missing timestamps", () => {
    const now = Date.parse("2026-11-23T18:00:00Z");
    expect(isTelemetryStale("2026-11-23T17:59:30Z", now)).toBe(false);
    expect(isTelemetryStale("2026-11-23T17:00:00Z", now)).toBe(true);
    expect(isTelemetryStale(undefined, now)).toBe(true);
  });

  test("formatCompletedAt handles ISO and legacy UTC formats", () => {
    expect(formatCompletedAt("2026-11-23T05:17:00Z", "en-US", "America/Denver")).toBe("Nov 22, 2026, 10:17 PM");
    expect(formatCompletedAt("2026-11-23 05:17", "en-US", "America/Denver")).toBe("Nov 22, 2026, 10:17 PM");
    expect(formatCompletedAt("garbage")).toBe("garbage");
    expect(formatCompletedAt(null)).toBe("—");
  });
});
