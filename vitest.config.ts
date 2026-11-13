import { defineConfig } from "vitest/config";

// The fixtures' own tests: covers matching, the catalog, run reports and the overlap review.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    reporters: ["default", "junit"],
    outputFile: { junit: "reports/junit.xml" },
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // Thin glue around Playwright, Kafka and the GitHub API; exercised by acceptance runs.
      exclude: ["src/**/*.test.ts", "src/fixtures.ts", "src/kafka.ts", "src/cli.ts", "src/screens-run.ts"],
      reporter: ["text", "json-summary"],
      reportsDirectory: "coverage",
      thresholds: { lines: 90, functions: 90, branches: 85, statements: 90 },
    },
  },
});
