import { describe, expect, it } from "vitest";
import type { Catalog } from "./catalog.ts";
import { overlaps, review } from "./review.ts";

const t = (file: string, title: string, covers: string[], capability = "consent", project = "api") => ({
  file,
  title,
  project,
  tags: [],
  capability,
  covers,
});

const catalog: Catalog = {
  tests: [
    t("a.spec.ts", "records", ["svc PUT /c/{id} 202", "svc GET /c/{id} 200"]),
    t("b.spec.ts", "reads", ["svc GET /c/{id} 200"]),
    t("c.spec.ts", "reads again", ["svc GET /c/{id} 200"]),
    t("d.spec.ts", "refuses", ["svc GET /c/{id} 404"]),
    t("e.spec.ts", "other capability", ["svc GET /c/{id} 200"], "billing"),
    t("f.ui.spec.ts", "in the browser", ["page web /c", "svc GET /c/{id} 200"], "consent", "ui"),
  ],
};

describe("review", () => {
  it("finds tests whose coverage another test of the same capability and project has", () => {
    expect(overlaps(catalog)).toEqual([
      { test: 'b.spec.ts "reads"', within: 'a.spec.ts "records"', covers: ["svc GET /c/{id} 200"] },
      { test: 'b.spec.ts "reads"', within: 'c.spec.ts "reads again"', covers: ["svc GET /c/{id} 200"] },
      { test: 'c.spec.ts "reads again"', within: 'a.spec.ts "records"', covers: ["svc GET /c/{id} 200"] },
    ]);
  });

  it("reports overlaps and the slowest tests", () => {
    const text = review(
      catalog,
      [{ file: "a.spec.ts", title: "records", tags: [], outcome: "passed", durationMs: 12_000 }],
      600,
    );
    expect(text).toContain("6 tests; the full run took 12s of test time (budget per feature run: 600s)");
    expect(text).toContain("### 3 tests covered by another");
    expect(text).toContain('- 12s a.spec.ts "records"');
    expect(review({ tests: [] }, [], 600)).toContain("No test is covered by another.");
  });
});
