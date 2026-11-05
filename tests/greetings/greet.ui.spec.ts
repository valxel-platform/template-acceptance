import { expect, spec, test } from "../../src/fixtures.ts";
import { urlOf } from "../../src/env.ts";

// Browser journeys run only when the change set has a web app (project "ui").
test(
  "a person greets themselves from the web app",
  spec({
    proves: { "TPL-FEAT-1": ["AC-1"] },
    capability: "greetings",
    covers: ["page template-web /", "template-service GET /api/v1/greetings 200"],
    critical: true,
  }),
  async ({ page }) => {
    await page.goto(urlOf("template-web"));
    await page.getByLabel("Your name").fill("Ada");
    await page.getByRole("button", { name: "Greet me" }).click();
    await expect(page.getByRole("status")).toContainText("Ada");
  },
);
