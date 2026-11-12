import { describe, expect, it } from "vitest";
import { baseFor, join, parseScreens, summarize, type Visit } from "./screens.ts";

describe("baseFor", () => {
  it("goes through the BFF when there is one", () => {
    expect(
      baseFor(
        { id: "S1", route: "/a", app: "acme/clinic-web" },
        { "clinic-bff": "https://bff", "clinic-web": "https://web" },
      ),
    ).toBe("https://bff");
  });
  it("uses the app's own URL otherwise", () => {
    expect(
      baseFor(
        { id: "S1", route: "/a", app: "acme/clinic-web" },
        { "clinic-web": "https://web", api: "https://api" },
      ),
    ).toBe("https://web");
  });
  it("falls back to any web app", () => {
    expect(baseFor({ id: "S1", route: "/a" }, { "shop-web": "https://w" })).toBe("https://w");
  });
  it("says when there's nowhere to go", () => {
    expect(() => baseFor({ id: "S1", route: "/a" }, {})).toThrow(/no URL for S1/);
  });
});

describe("join", () => {
  it("joins without doubled slashes", () => {
    expect(join("https://x/", "/checkin")).toBe("https://x/checkin");
    expect(join("https://x", "ready")).toBe("https://x/ready");
  });
});

describe("parseScreens", () => {
  it("keeps entries with an id and a route", () => {
    expect(parseScreens('[{"id":"S1","route":"/a"},{"id":"S2"},null]')).toEqual([{ id: "S1", route: "/a" }]);
    expect(parseScreens(undefined)).toEqual([]);
    expect(() => parseScreens('{"id":"S1"}')).toThrow(/JSON list/);
  });
});

describe("summarize", () => {
  const ok: Visit = {
    id: "S1",
    route: "/checkin",
    ok: true,
    shots: { desktop: "F-1/staging/S1-desktop.png", phone: "F-1/staging/S1-phone.png" },
    violations: [],
  };

  it("passes with no serious problems, in the format the tool reads", () => {
    const r = summarize([
      { ...ok, violations: [{ impact: "moderate", rule: "region", text: "All content in landmarks" }] },
    ]);
    expect(r.conclusion).toBe("success");
    expect(r.summary).toContain(
      "- S1 /checkin: passed; desktop: F-1/staging/S1-desktop.png; phone: F-1/staging/S1-phone.png",
    );
    expect(r.summary).toContain("- S1 moderate region: All content in landmarks");
  });

  it("fails on a serious violation, listed once per rule", () => {
    const v = {
      impact: "serious" as const,
      rule: "color-contrast",
      text: "Elements must have\nsufficient contrast",
    };
    const r = summarize([{ ...ok, violations: [v, { ...v, text: "again" }] }]);
    expect(r.conclusion).toBe("failure");
    expect(r.title).toMatch(/1 serious or critical/);
    expect(r.summary.match(/color-contrast/g)).toHaveLength(1);
    expect(r.summary).toContain("- S1 serious color-contrast: Elements must have sufficient contrast");
    expect(r.summary).toContain("- S1 /checkin: failed; desktop:");
  });

  it("fails when a screen didn't load", () => {
    const r = summarize([
      { id: "S2", route: "", ok: false, error: "desktop: HTTP 404", shots: {}, violations: [] },
    ]);
    expect(r.conclusion).toBe("failure");
    expect(r.title).toMatch(/didn't load/);
    expect(r.summary).toContain("- S2 -: failed (desktop: HTTP 404)");
  });
});
