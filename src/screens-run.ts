/**
 * node src/screens-run.ts   open each screen in SCREENS (JSON) against VRIXEL_ENV, run axe (WCAG 2.1 AA)
 * at desktop and phone widths, save screenshots under reports/screens/<feature>/<stage>/, and write
 * reports/screens/visits.json. Signs in with the test identity's token, when there is one.
 */
import { AxeBuilder } from "@axe-core/playwright";
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { components, token } from "./env.ts";
import { baseFor, join, parseScreens, type Visit } from "./screens.ts";

const WIDTHS = { desktop: { width: 1280, height: 900 }, phone: { width: 390, height: 844 } } as const;

async function main(): Promise<number> {
  const screens = parseScreens(process.env.SCREENS);
  const env = components();
  const feature = process.env.FEATURE_ID ?? "local";
  const stage = process.env.STAGE ?? "staging";
  const dir = `reports/screens/${feature}/${stage}`;
  mkdirSync(dir, { recursive: true });
  const bearer = await token();
  const browser = await chromium.launch();
  const visits: Visit[] = [];
  for (const s of screens) {
    const visit: Visit = { id: s.id, route: s.route, ok: true, shots: {}, violations: [] };
    for (const [width, viewport] of Object.entries(WIDTHS)) {
      const ctx = await browser.newContext({
        viewport,
        extraHTTPHeaders: bearer ? { Authorization: `Bearer ${bearer}` } : {},
      });
      const page = await ctx.newPage();
      try {
        const res = await page.goto(join(baseFor(s, env), s.route), {
          waitUntil: "networkidle",
          timeout: 30_000,
        });
        if (!res || res.status() >= 400) throw new Error(`HTTP ${res?.status() ?? "no response"}`);
        const file = `${feature}/${stage}/${s.id}-${width}.png`;
        await page.screenshot({ path: `reports/screens/${file}`, fullPage: true });
        visit.shots[width as "desktop" | "phone"] = file;
        const axe = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
          .analyze();
        for (const v of axe.violations) {
          visit.violations.push({
            impact: v.impact ?? "minor",
            rule: v.id,
            text: `${v.help} (${width}, ${v.nodes.length} place${v.nodes.length === 1 ? "" : "s"})`,
          });
        }
      } catch (err) {
        visit.ok = false;
        const why = `${width}: ${((err as Error).message.split("\n")[0] ?? "").slice(0, 160)}`;
        visit.error = visit.error ? `${visit.error}, ${why}` : why;
      } finally {
        await ctx.close();
      }
    }
    visits.push(visit);
  }
  await browser.close();
  writeFileSync("reports/screens/visits.json", JSON.stringify(visits, null, 2));
  return 0;
}

process.exitCode = await main();
