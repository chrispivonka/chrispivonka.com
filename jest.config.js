export default {
  testEnvironment: "jsdom",
  testMatch: ["**/__tests__/**/*.test.js"],
  transform: {},
  collectCoverageFrom: ["js/**/*.js"],
  collectCoverage: true,
  coveragePathIgnorePatterns: ["/node_modules/"],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70,
    },
  },
  testPathIgnorePatterns: ["/node_modules/"],
};
