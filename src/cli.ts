/**
 * node src/cli.ts catalog --write | --check
 * node src/cli.ts report     after a run: post the check run the Vrixel SDLC reads
 * node src/cli.ts review     after the nightly full run: overlaps and slow tests, to the job summary
 */
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { fromList, problems, render, type Catalog } from "./catalog.ts";
import { report, rows, type Results } from "./report.ts";
import { parseScreens, summarize, type Visit } from "./screens.ts";
import { review } from "./review.ts";

const [cmd, flag] = process.argv.slice(2);

function list(): Catalog {
  const out = execFileSync("npx", ["playwright", "test", "--list", "--reporter=json"], {
    encoding: "utf8",
    maxBuffer: 64 << 20,
  });
  return fromList(JSON.parse(out) as Parameters<typeof fromList>[0]);
}

function summary(text: string): void {
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n`);
  console.log(text);
}

async function main(): Promise<number> {
  if (cmd === "catalog") {
    const catalog = list();
    const issues = problems(catalog);
    for (const p of issues) console.error(p);
    if (flag === "--write") {
      writeFileSync("catalog.json", render(catalog));
      return issues.length > 0 ? 1 : 0;
    }
    const current = existsSync("catalog.json") ? readFileSync("catalog.json", "utf8") : "";
    if (current !== render(catalog)) {
      console.error("catalog.json is out of date: run npm run catalog and commit it");
      return 1;
    }
    return issues.length > 0 ? 1 : 0;
  }
  if (cmd === "screens-report") return screensReport();
  const results = JSON.parse(readFileSync("reports/results.json", "utf8")) as Results;
  if (cmd === "report") {
    const feature = process.env.FEATURE_ID ?? "";
    const wanted = (process.env.CRITERIA ?? "").split(",").filter(Boolean);
    const r = report(results, { feature, wanted });
    summary(`## ${process.env.CHECK_NAME ?? "acceptance"}\n\n${r.summary}`);
    const repo = process.env.GITHUB_REPOSITORY;
    const sha = process.env.HEAD_SHA;
    if (process.env.GITHUB_TOKEN && repo && sha && process.env.CHECK_NAME) {
      const res = await fetch(
        `${process.env.GITHUB_API_URL ?? "https://api.github.com"}/repos/${repo}/check-runs`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
            Accept: "application/vnd.github+json",
          },
          body: JSON.stringify({
            name: process.env.CHECK_NAME,
            head_sha: sha,
            status: "completed",
            conclusion: r.conclusion,
            details_url: process.env.RUN_URL,
            output: { title: r.title, summary: r.summary.slice(0, 65_000) },
          }),
        },
      );
      if (!res.ok) {
        console.error(`could not post the check run: ${res.status} ${await res.text()}`);
        return 1;
      }
    }
    return r.conclusion === "success" ? 0 : 1;
  }
  if (cmd === "review") {
    const catalog = JSON.parse(readFileSync("catalog.json", "utf8")) as Catalog;
    summary(review(catalog, rows(results), Number(process.env.BUDGET_S ?? 600)));
    return 0;
  }
  console.error("usage: node src/cli.ts catalog --write|--check | report | review | screens-report");
  return 2;
}

process.exitCode = await main();

/** After a screens scan: post the check run the Vrixel SDLC reads (`screens / <feature> / <stage>`). */
async function screensReport(): Promise<number> {
  // No visits file means the scan itself broke before visiting anything: report that as a failure.
  const visits: Visit[] = existsSync("reports/screens/visits.json")
    ? (JSON.parse(readFileSync("reports/screens/visits.json", "utf8")) as Visit[])
    : parseScreens(process.env.SCREENS).map((s) => ({
        id: s.id,
        route: s.route,
        ok: false,
        error: "the scan didn't run",
        shots: {},
        violations: [],
      }));
  const r = summarize(visits);
  summary(`## ${process.env.CHECK_NAME ?? "screens"}\n\n${r.summary}`);
  const repo = process.env.GITHUB_REPOSITORY;
  const sha = process.env.HEAD_SHA;
  if (process.env.GITHUB_TOKEN && repo && sha && process.env.CHECK_NAME) {
    const res = await fetch(
      `${process.env.GITHUB_API_URL ?? "https://api.github.com"}/repos/${repo}/check-runs`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
          Accept: "application/vnd.github+json",
        },
        body: JSON.stringify({
          name: process.env.CHECK_NAME,
          head_sha: sha,
          status: "completed",
          conclusion: r.conclusion,
          details_url: process.env.RUN_URL,
          output: { title: r.title, summary: r.summary.slice(0, 65_000) },
        }),
      },
    );
    if (!res.ok) {
      console.error(`could not post the check run: ${res.status} ${await res.text()}`);
      return 1;
    }
  }
  return r.conclusion === "success" ? 0 : 1;
}
