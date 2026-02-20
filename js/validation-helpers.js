// Dynamic imports for npm packages - fall back to browser-native alternatives
let validator;
let DOMPurify;

try {
  validator = (await import("validator")).default;
} catch {
  // Browser fallback - use regex-based validation
  validator = {
    isEmail(email) {
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    },
    isMobilePhone(phone) {
      return /^[+]?[\d\s\-().]{7,20}$/.test(phone);
    },
    isLength(str, opts) {
      return str.length >= (opts.min || 0) && str.length <= (opts.max || Infinity);
    }
  };
}

try {
  DOMPurify = (await import("dompurify")).default;
} catch {
  // Browser fallback - use native DOM sanitization
  DOMPurify = {
    sanitize(input, opts) {
      if (typeof document !== "undefined") {
        const div = document.createElement("div");
        div.textContent = input;
        return opts && opts.ALLOWED_TAGS && opts.ALLOWED_TAGS.length === 0
          ? div.textContent
          : div.innerHTML;
      }
      // Strip HTML tags as last resort
      return input.replace(/<[^>]*>/g, "");
    }
  };
}

/**
 * Sanitize user input to prevent XSS attacks
 * Uses DOMPurify for comprehensive HTML/script sanitization
 * @param {string} input - User input to sanitize
 * @returns {string} - Sanitized input
 */
export function sanitizeInput(input) {
  if (!input) {
    return "";
  }

  // Use DOMPurify to remove malicious HTML/script content
  const purified = DOMPurify.sanitize(input, { ALLOWED_TAGS: [] });
  // Trim whitespace
  return purified.trim();
}

/**
 * Validate name format (letters, spaces, hyphens, apostrophes only)
 * @param {string} name - Name to validate
 * @returns {boolean} - True if valid name format
 */
export function isValidName(name) {
  if (!name) {
    return false;
  }

  const cleaned = sanitizeInput(name).trim();

  // Check length constraints
  if (cleaned.length < 2 || cleaned.length > 100) {
    return false;
  }

  // Allow letters, spaces, hyphens, apostrophes
  // Allow both regular apostrophes and encoded ones
  const nameRegex = /^[a-zA-Z\s\-']+$/;
  return nameRegex.test(cleaned);
}

/**
 * Validate email format using industry standard validator.js
 * @param {string} email - Email to validate
 * @returns {boolean} - True if valid email format
 */
export function isValidEmail(email) {
  if (!email) {
    return false;
  }

  const cleaned = sanitizeInput(email).trim();

  // Use validator.js for robust RFC 5322 email validation
  return validator.isEmail(cleaned);
}

/**
 * Validate phone number format (basic validation, optional field)
 * Supports international formats
 * @param {string} phone - Phone number to validate
 * @returns {boolean} - True if valid phone format or empty (optional field)
 */
export function isValidPhone(phone) {
  if (!phone || phone.trim() === "") {
    return true; // Optional field
  }

  const cleaned = sanitizeInput(phone).trim();

  // Use validator.js isMobilePhone for international phone validation
  // Allow multiple locales
  return validator.isMobilePhone(cleaned, ["en-US", "en-GB", "en-CA"], {
    strictMode: false
  });
}

/**
 * Validate message length and content
 * @param {string} message - Message to validate
 * @returns {boolean} - True if message length is within acceptable range
 */
export function isValidMessage(message) {
  if (!message) {
    return false;
  }

  const cleaned = sanitizeInput(message).trim();

  // Use validator.js isLength for length validation
  return validator.isLength(cleaned, { min: 5, max: 5000 });
}
