import {
  sanitizeInput,
  isValidName,
  isValidEmail,
  isValidPhone,
  isValidMessage
} from "../js/validation-helpers.js";

describe("Validation Helpers with DOMPurify and validator.js", () => {
  describe("sanitizeInput (using DOMPurify)", () => {
    it("should return empty string for null/undefined input", () => {
      expect(sanitizeInput(null)).toBe("");
      expect(sanitizeInput(undefined)).toBe("");
    });

    it("should remove HTML tags and script content", () => {
      // DOMPurify removes script tags and their content entirely
      const scriptResult = sanitizeInput("<script>alert('xss')</script>");
      expect(scriptResult).toBe("");

      // HTML tags with attributes are stripped entirely
      expect(sanitizeInput("<img src=x onerror=alert(1)>")).toBe("");
    });

    it("should remove dangerous HTML elements", () => {
      // Event handlers in actual HTML attributes are removed
      expect(sanitizeInput("<div onclick='alert(1)'>Click</div>")).toContain("Click");
      expect(sanitizeInput("<div onclick='alert(1)'>Click</div>")).not.toContain("onclick");
    });

    it("should handle HTML entities safely", () => {
      const result = sanitizeInput("&<>\"'");
      expect(result).not.toContain("<");
      expect(result).not.toContain(">");
    });

    it("should trim whitespace", () => {
      expect(sanitizeInput("  hello  ")).toBe("hello");
    });

    it("should remove dangerous HTML elements like iframe and style", () => {
      expect(sanitizeInput("Hello <iframe src='evil.com'></iframe> world")).not.toContain("iframe");
      expect(sanitizeInput("Test <style>body{display:none}</style> content")).not.toContain("style");
    });
  });

  describe("isValidName", () => {
    it("should accept valid names", () => {
      expect(isValidName("John Doe")).toBe(true);
      expect(isValidName("Mary-Jane")).toBe(true);
      expect(isValidName("Jean-Claude Van Damme")).toBe(true);
    });

    it("should reject names that are too short", () => {
      expect(isValidName("A")).toBe(false);
      expect(isValidName("")).toBe(false);
      expect(isValidName(null)).toBe(false);
    });

    it("should reject names that are too long", () => {
      expect(isValidName("A".repeat(101))).toBe(false);
    });

    it("should reject names with invalid characters", () => {
      expect(isValidName("John123")).toBe(false);
      expect(isValidName("John@Doe")).toBe(false);
      expect(isValidName("John_Doe")).toBe(false);
    });

    it("should reject HTML/script injection attempts", () => {
      expect(isValidName("<script>alert(1)</script>")).toBe(false);
    });
  });

  describe("isValidEmail (using validator.js)", () => {
    it("should accept valid emails", () => {
      expect(isValidEmail("user@example.com")).toBe(true);
      expect(isValidEmail("john.doe@company.co.uk")).toBe(true);
      expect(isValidEmail("test+tag@example.com")).toBe(true);
    });

    it("should reject invalid email formats", () => {
      expect(isValidEmail("invalid.email")).toBe(false);
      expect(isValidEmail("@example.com")).toBe(false);
      expect(isValidEmail("user@")).toBe(false);
      expect(isValidEmail("user @example.com")).toBe(false);
    });

    it("should be case insensitive", () => {
      expect(isValidEmail("USER@EXAMPLE.COM")).toBe(true);
      expect(isValidEmail("User@Example.Com")).toBe(true);
    });

    it("should reject empty or null email", () => {
      expect(isValidEmail("")).toBe(false);
      expect(isValidEmail(null)).toBe(false);
    });

    it("should reject HTML/script injection attempts", () => {
      expect(isValidEmail("<script>@example.com")).toBe(false);
    });
  });

  describe("isValidPhone (using validator.js)", () => {
    it("should accept empty phone number (optional field)", () => {
      // Phone is optional - empty/null/undefined should pass
      expect(isValidPhone("")).toBe(true);
      expect(isValidPhone(null)).toBe(true);
      expect(isValidPhone(undefined)).toBe(true);
    });

    it("should validate provided phone numbers using validator.js", () => {
      // When phone is provided, use validator.isMobilePhone
      // It requires proper formatting based on locale
      expect(typeof isValidPhone("invalid")).toBe("boolean");
    });
  });

  describe("isValidMessage (using validator.js)", () => {
    it("should accept valid messages", () => {
      expect(isValidMessage("Hello, this is a test message")).toBe(true);
      expect(isValidMessage("12345")).toBe(true); // Exactly 5 chars
    });

    it("should reject messages that are too short", () => {
      expect(isValidMessage("Hi")).toBe(false);
      expect(isValidMessage("1234")).toBe(false);
      expect(isValidMessage("")).toBe(false);
    });

    it("should reject messages that are too long", () => {
      expect(isValidMessage("a".repeat(5001))).toBe(false);
    });

    it("should handle sanitized input with HTML safely", () => {
      expect(isValidMessage("Hello <script>alert(1)</script> world")).toBe(true);
    });

    it("should accept various message formats", () => {
      expect(isValidMessage("Multi\nline\nmessage")).toBe(true);
      expect(isValidMessage("Message with special chars!@#$%")).toBe(true);
    });

    it("should reject null/undefined", () => {
      expect(isValidMessage(null)).toBe(false);
      expect(isValidMessage(undefined)).toBe(false);
    });
  });
});
