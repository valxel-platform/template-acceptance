import { describe, expect, it } from "vitest";
import { fromList, problems, render } from "./catalog.ts";

const list = {
  suites: [
    {
      title: "consents/capture.spec.ts",
      file: "consents/capture.spec.ts",
      specs: [
        {
          title: "records consent",
          file: "consents/capture.spec.ts",
          tags: ["EMR-FEAT-12", "EMR-FEAT-12/AC-1", "cap-consent"],
          tests: [
            {
              projectName: "api",
              annotations: [
                { type: "capability", description: "consent" },
                { type: "covers", description: "svc PUT /c/{id} 202" },
              ],
            },
          ],
        },
      ],
      suites: [
        {
          title: "when withdrawn",
          specs: [
            { title: "is hidden", file: "consents/capture.spec.ts", tags: ["@EMR-FEAT-12"], tests: [{}] },
          ],
        },
      ],
    },
  ],
};

describe("catalog", () => {
  it("lists every test with its tags, capability and covers", () => {
    const c = fromList(list);
    expect(c.tests).toEqual([
      {
        file: "consents/capture.spec.ts",
        title: "records consent",
        project: "api",
        tags: ["@EMR-FEAT-12", "@EMR-FEAT-12/AC-1", "@cap-consent"],
        capability: "consent",
        covers: ["svc PUT /c/{id} 202"],
      },
      {
        file: "consents/capture.spec.ts",
        title: "when withdrawn › is hidden",
        project: "api",
        tags: ["@EMR-FEAT-12"],
        capability: "",
        covers: [],
      },
    ]);
    expect(fromList({}).tests).toEqual([]);
    expect(render(c).endsWith("}\n")).toBe(true);
  });

  it("names tests the pipeline couldn't trace", () => {
    expect(problems(fromList(list))).toEqual([
      'consents/capture.spec.ts "when withdrawn › is hidden" proves no acceptance criterion (tag @<feature>/AC-<n>; use spec())',
      'consents/capture.spec.ts "when withdrawn › is hidden" has no capability',
      'consents/capture.spec.ts "when withdrawn › is hidden" declares no covers',
    ]);
  });
});
