import { describe, expect, it } from "vitest";
import { criteria, report, rows, type Results } from "./report.ts";

const results: Results = {
  stats: { duration: 61_400 },
  suites: [
    {
      specs: [
        {
          title: "records consent",
          file: "c.spec.ts",
          tags: ["EMR-FEAT-12", "EMR-FEAT-12/AC-1"],
          tests: [{ status: "expected", results: [{ duration: 4000 }] }],
        },
        {
          title: "withdraws",
          file: "c.spec.ts",
          tags: ["EMR-FEAT-12", "EMR-FEAT-12/AC-2", "EMR-FEAT-3/AC-1"],
          tests: [{ status: "flaky", results: [{ duration: 1000 }, { duration: 2000 }] }],
        },
      ],
      suites: [
        {
          specs: [
            {
              title: "old journey",
              file: "o.spec.ts",
              tags: ["EMR-FEAT-3", "EMR-FEAT-3/AC-1"],
              tests: [{ status: "unexpected", results: [{ duration: 9000 }] }],
            },
            { title: "later", file: "o.spec.ts", tags: ["EMR-FEAT-12/AC-3"], tests: [{ status: "skipped" }] },
          ],
        },
      ],
    },
  ],
};

describe("report", () => {
  it("reads every test with its outcome and time", () => {
    const r = rows(results);
    expect(r.map((x) => [x.title, x.outcome, x.durationMs])).toEqual([
      ["records consent", "passed", 4000],
      ["withdraws", "passed", 3000],
      ["old journey", "failed", 9000],
      ["later", "skipped", 0],
    ]);
  });

  it("decides each criterion of the feature, never another feature's of the same number", () => {
    const r = rows(results);
    expect(criteria(r, "EMR-FEAT-12", ["AC-1", "AC-2", "AC-3", "AC-4"])).toEqual({
      "AC-1": "passed", // EMR-FEAT-3's AC-1 failed, but that is another criterion
      "AC-2": "passed",
      "AC-3": "skipped",
      "AC-4": "missing",
    });
    expect(criteria(r, "EMR-FEAT-3", [])).toEqual({ "AC-1": "failed" });
  });

  it("writes the summary the pipeline parses", () => {
    const r = report(results, { feature: "EMR-FEAT-12", wanted: ["AC-1", "AC-2"] });
    expect(r.conclusion).toBe("failure"); // a regression failed, even though the feature's criteria passed
    expect(r.summary).toContain("2 passed, 1 failed, 1 skipped");
    expect(r.summary).toContain("- AC-1: passed\n- AC-2: passed");
    expect(r.summary).toContain("Duration: 61s");
    expect(r.summary).toContain('Failed:\n- o.spec.ts "old journey"');
    const ok = report(
      { suites: [{ specs: results.suites?.[0]?.specs?.slice(0, 1) ?? [] }] },
      { feature: "EMR-FEAT-12", wanted: ["AC-1"] },
    );
    expect(ok.conclusion).toBe("success");
    expect(ok.summary).toContain("Duration: 4s");
    const missing = report({ suites: [] }, { feature: "EMR-FEAT-12", wanted: ["AC-1"] });
    expect(missing.conclusion).toBe("failure");
  });

  it("carries the journey load test, and fails the run when it failed", () => {
    const one = { suites: [{ specs: results.suites?.[0]?.specs?.slice(0, 1) ?? [] }] };
    const fast = report(one, {
      feature: "EMR-FEAT-12",
      wanted: ["AC-1"],
      performance: { passed: true, text: "p95 120 ms (budget 500 ms)" },
    });
    expect(fast.conclusion).toBe("success");
    expect(fast.summary).toContain("Performance: passed (p95 120 ms (budget 500 ms))");
    const slow = report(one, {
      feature: "EMR-FEAT-12",
      wanted: ["AC-1"],
      performance: { passed: false, text: "p95_ms 900 ms is over the budget of 500 ms" },
    });
    expect(slow.conclusion).toBe("failure");
    expect(slow.summary).toContain("Performance: failed (p95_ms 900 ms is over the budget of 500 ms)");
  });
});
