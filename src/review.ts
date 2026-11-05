/**
 * The nightly review: tests whose coverage another test of the same capability and project has
 * (candidates to merge into it or remove), and the slowest tests against the product's budget.
 */
import type { Catalog, Entry } from "./catalog.ts";
import type { Row } from "./report.ts";

export interface Overlap {
  test: string;
  within: string;
  covers: string[];
}

const name = (t: Entry) => `${t.file} "${t.title}"`;

export function overlaps(catalog: Catalog): Overlap[] {
  const tests = catalog.tests.filter(
    (t, i, all) => all.findIndex((u) => u.file === t.file && u.title === t.title) === i,
  );
  const out: Overlap[] = [];
  for (const a of tests) {
    for (const b of tests) {
      // Same capability and project: a fast API test is never "within" a slower browser journey.
      if (a === b || a.covers.length === 0 || a.capability !== b.capability || a.project !== b.project)
        continue;
      const inB = a.covers.every((c) => b.covers.includes(c));
      const same = inB && a.covers.length === b.covers.length;
      if (inB && (!same || name(a) < name(b)))
        out.push({ test: name(a), within: name(b), covers: [...a.covers].sort() });
    }
  }
  return out;
}

export function review(catalog: Catalog, run: Row[], budgetS: number): string {
  const found = overlaps(catalog);
  const totalS = Math.round(run.reduce((n, r) => n + r.durationMs, 0) / 1000);
  const slow = [...run].sort((a, b) => b.durationMs - a.durationMs).slice(0, 10);
  return [
    `## Acceptance review`,
    "",
    `${catalog.tests.length} tests; the full run took ${totalS}s of test time (budget per feature run: ${budgetS}s).`,
    "",
    found.length > 0 ? `### ${found.length} tests covered by another` : "No test is covered by another.",
    ...found.map((o) => `- ${o.test} is within ${o.within} (${o.covers.join(", ")})`),
    "",
    "### Slowest",
    ...slow.map((r) => `- ${Math.round(r.durationMs / 1000)}s ${r.file} "${r.title}"`),
    "",
  ].join("\n");
}
