/**
 * The acceptance run's report, as the Valxel SDLC reads it: one check run named
 * `acceptance / <feature> / <stage>` whose summary has counts, a line per criterion and the
 * duration. A criterion fails if any test tagged with it failed.
 */

export type Outcome = "passed" | "failed" | "skipped";

interface ResultTest {
  status?: string; // expected | unexpected | flaky | skipped
  results?: { duration?: number }[];
}
interface ResultSpec {
  title: string;
  file: string;
  tags?: string[];
  tests?: ResultTest[];
}
interface ResultSuite {
  specs?: ResultSpec[];
  suites?: ResultSuite[];
}
export interface Results {
  suites?: ResultSuite[];
  stats?: { duration?: number };
}

export interface Row {
  file: string;
  title: string;
  tags: string[];
  outcome: Outcome;
  durationMs: number;
}

export function rows(results: Results): Row[] {
  const out: Row[] = [];
  const walk = (suite: ResultSuite) => {
    for (const s of suite.specs ?? []) {
      for (const t of s.tests ?? []) {
        const outcome: Outcome =
          t.status === "skipped" ? "skipped" : t.status === "unexpected" ? "failed" : "passed";
        const durationMs = (t.results ?? []).reduce((n, r) => n + (r.duration ?? 0), 0);
        out.push({ file: s.file, title: s.title, tags: (s.tags ?? []).map(at), outcome, durationMs });
      }
    }
    for (const child of suite.suites ?? []) walk(child);
  };
  for (const s of results.suites ?? []) walk(s);
  return out;
}

function at(tag: string): string {
  return tag.startsWith("@") ? tag : `@${tag}`;
}

/**
 * A feature's criteria: failed if any test proving it failed, passed if one passed, skipped if all
 * were skipped, missing if no test proves it. With no list, every criterion the tests name.
 */
export function criteria(all: Row[], feature: string, wanted: string[]): Record<string, Outcome | "missing"> {
  const out: Record<string, Outcome | "missing"> = {};
  const prefix = `@${feature}/`;
  const named = all.flatMap((r) =>
    r.tags.filter((t) => t.startsWith(prefix)).map((t) => t.slice(prefix.length)),
  );
  const names = wanted.length > 0 ? wanted : [...new Set(named)].sort();
  for (const ac of names) {
    const mine = all.filter((r) => r.tags.includes(`${prefix}${ac}`));
    out[ac] =
      mine.length === 0
        ? "missing"
        : mine.some((r) => r.outcome === "failed")
          ? "failed"
          : mine.some((r) => r.outcome === "passed")
            ? "passed"
            : "skipped";
  }
  return out;
}

export interface Report {
  conclusion: "success" | "failure";
  title: string;
  summary: string;
}

/** The journey load test's result (perf/compare.py --result), when staging ran one. */
export interface PerformanceResult {
  passed: boolean;
  text: string;
}

export function report(
  results: Results,
  opts: { feature: string; wanted: string[]; performance?: PerformanceResult },
): Report {
  const all = rows(results);
  const counts = { passed: 0, failed: 0, skipped: 0 };
  for (const r of all) counts[r.outcome] += 1;
  const byAc = criteria(all, opts.feature, opts.wanted);
  const seconds = Math.round((results.stats?.duration ?? all.reduce((n, r) => n + r.durationMs, 0)) / 1000);
  const perf = opts.performance;
  const bad = Object.values(byAc).some((o) => o !== "passed") || counts.failed > 0 || perf?.passed === false;
  const slowest = [...all].sort((a, b) => b.durationMs - a.durationMs).slice(0, 5);
  const lines = [
    `${counts.passed} passed, ${counts.failed} failed, ${counts.skipped} skipped`,
    "",
    "Criteria:",
    ...Object.entries(byAc).map(([ac, o]) => `- ${ac}: ${o}`),
    "",
    `Duration: ${seconds}s`,
    ...(perf ? ["", `Performance: ${perf.passed ? "passed" : "failed"} (${perf.text})`] : []),
    "",
    "Slowest:",
    ...slowest.map((r) => `- ${Math.round(r.durationMs / 1000)}s ${r.file} "${r.title}"`),
    ...(counts.failed > 0
      ? ["", "Failed:", ...all.filter((r) => r.outcome === "failed").map((r) => `- ${r.file} "${r.title}"`)]
      : []),
  ];
  return {
    conclusion: bad ? "failure" : "success",
    title: `${counts.passed} passed, ${counts.failed} failed`,
    summary: lines.join("\n"),
  };
}
