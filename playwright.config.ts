import { defineConfig, devices } from "@playwright/test";

// Product acceptance tests: a feature end to end across the repos it changes. The Vrixel SDLC runs
// them after the whole change set is deployed (see .github/workflows/acceptance.yml):
//   api  every test except *.ui.spec.ts: through the components' APIs and events, no browser
//   ui   *.ui.spec.ts: browser journeys, only when the change set has a web app
// VRIXEL_ENV holds each component's URL: {"emr-intake-api": "https://...", "emr-web": "https://..."}.
export default defineConfig({
  testDir: "tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  reporter: [
    ["list"],
    ["json", { outputFile: "reports/results.json" }],
    ["junit", { outputFile: "reports/acceptance-junit.xml" }],
    ["html", { open: "never" }],
  ],
  use: { trace: "retain-on-failure" },
  projects: [
    { name: "api", testIgnore: "**/*.ui.spec.ts" },
    { name: "ui", testMatch: "**/*.ui.spec.ts", use: { ...devices["Desktop Chrome"] } },
  ],
});
