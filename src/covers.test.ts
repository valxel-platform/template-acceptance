import { describe, expect, it } from "vitest";
import { componentOf, matchesPath, normCover, slug, spec, undeclared } from "./covers.ts";

describe("spec", () => {
  it("tags features, criteria, capability, components and critical journeys", () => {
    const d = spec({
      proves: { "EMR-FEAT-12": ["AC-1", "AC-3"], "EMR-FEAT-3": ["AC-2"] },
      capability: "Consent capture",
      covers: [
        "emr-intake-api put /api/v1/consents/{id} 202",
        "event vrixel.consent.recorded.v1",
        "page emr-web /consents",
      ],
      critical: true,
    });
    expect(d.tag).toEqual([
      "@EMR-FEAT-12",
      "@EMR-FEAT-12/AC-1",
      "@EMR-FEAT-12/AC-3",
      "@EMR-FEAT-3",
      "@EMR-FEAT-3/AC-2",
      "@cap-consent-capture",
      "@comp-emr-intake-api",
      "@comp-emr-web",
      "@critical",
    ]);
    expect(d.annotation).toContainEqual({
      type: "covers",
      description: "emr-intake-api PUT /api/v1/consents/{id} 202",
    });
    expect(d.annotation).toContainEqual({ type: "capability", description: "consent-capture" });
  });

  it("refuses declarations the pipeline couldn't trace", () => {
    const base = { capability: "c", covers: ["a GET /x"] };
    expect(() => spec({ ...base, proves: {} })).toThrow("which feature");
    expect(() => spec({ ...base, proves: { "feat-1": ["AC-1"] } })).toThrow("EMR-FEAT-12");
    expect(() => spec({ ...base, proves: { "EMR-FEAT-1": [] } })).toThrow("AC-<n>");
    expect(() => spec({ ...base, proves: { "EMR-FEAT-1": ["1"] } })).toThrow("AC-<n>");
    expect(() => spec({ ...base, covers: [], proves: { "EMR-FEAT-1": ["AC-1"] } })).toThrow("covers");
  });
});

describe("covers", () => {
  it("normalizes and names components", () => {
    expect(normCover("  svc   post  /a ")).toBe("svc POST /a");
    expect(normCover("event   x.y")).toBe("event x.y");
    expect(componentOf("event x.y")).toBeUndefined();
    expect(componentOf("page web /a")).toBe("web");
    expect(componentOf("svc GET /a")).toBe("svc");
    expect(slug("--Consent & Capture--")).toBe("consent-capture");
  });

  it("matches concrete paths to templates", () => {
    expect(matchesPath("/api/v1/consents/{id}", "/api/v1/consents/c-1")).toBe(true);
    expect(matchesPath("/api/v1/consents/{id}", "/api/v1/consents/c-1/")).toBe(true);
    expect(matchesPath("/api/v1/consents", "/api/v1/consents?name=a")).toBe(true);
    expect(matchesPath("/api/v1/consents/{id}", "/api/v1/consents/c-1/history")).toBe(false);
    expect(matchesPath("/api/v1.0/x", "/api/v1x0/x")).toBe(false);
  });

  it("finds what a test reached but didn't declare", () => {
    const declared = ["svc PUT /c/{id} 202", "svc GET /c", "event vrixel.c.saved.v1"];
    expect(
      undeclared(declared, [
        "svc PUT /c/1 202",
        "svc GET /c 200",
        "svc GET /c 404",
        "event vrixel.c.saved.v1",
      ]),
    ).toEqual([]);
    expect(
      undeclared(declared, [
        "svc PUT /c/1 400",
        "other GET /c 200",
        "event vrixel.c.gone.v1",
        "svc DELETE /c/1 204",
      ]),
    ).toEqual(["svc PUT /c/1 400", "other GET /c 200", "event vrixel.c.gone.v1", "svc DELETE /c/1 204"]);
  });
});
