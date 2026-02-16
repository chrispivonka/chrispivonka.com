import js from "@eslint/js";
import globals from "globals";

export default [
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.es2024,
        bootstrap: "readonly"
      }
    },
    rules: {
      ...js.configs.recommended.rules,
      "no-console": [
        "warn",
        {
          allow: ["warn", "error"]
        }
      ],
      "no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_"
        }
      ],
      "no-var": "error",
      "prefer-const": "error",
      "eqeqeq": ["error", "always"],
      "curly": "error",
      "brace-style": ["error", "1tbs"],
      "quotes": ["error", "double"],
      "semi": ["error", "always"],
      "comma-dangle": ["error", "never"],
      "indent": ["error", 2],
      "no-eval": "error",
      "no-implied-eval": "error"
    }
  }
];
