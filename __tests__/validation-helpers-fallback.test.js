import { jest } from "@jest/globals";

describe("Validation helpers fallbacks", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it("uses fallback validator and DOMPurify when imports fail", async () => {
    jest.unstable_mockModule("validator", () => {
      throw new Error("forced validator import failure");
    });

    jest.unstable_mockModule("dompurify", () => {
      throw new Error("forced dompurify import failure");
    });

    const helpers = await import("../js/validation-helpers.js");

    expect(helpers.isValidEmail("test@example.com")).toBe(true);
    expect(helpers.isValidEmail("invalid-email")).toBe(false);
    expect(helpers.isValidPhone("+1 555 123 4567")).toBe(true);
    expect(helpers.isValidMessage("Hello there")).toBe(true);
    expect(helpers.sanitizeInput("<b>hi</b>")).toBe("<b>hi</b>");
  });
});
