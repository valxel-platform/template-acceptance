import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["coverage", "reports", "playwright-report", "test-results"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.strictTypeChecked],
    files: ["**/*.ts"],
    languageOptions: {
      ecmaVersion: 2023,
      globals: { ...globals.node },
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
    },
  },
  // Playwright fixtures that use no other fixture still destructure an empty object.
  { files: ["src/fixtures.ts"], rules: { "no-empty-pattern": "off" } },
);
