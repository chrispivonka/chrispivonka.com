export default {
  testEnvironment: "jsdom",
  testMatch: ["**/__tests__/**/*.test.js"],
  transform: {},
  collectCoverageFrom: ["js/validation-helpers.js", "js/contact-validation.js"],
  collectCoverage: false,
  testPathIgnorePatterns: ["/node_modules/"],
};
