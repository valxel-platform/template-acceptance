import { expect, spec, test } from "../../src/fixtures.ts";

// Examples against the templates (template-service, template-event-worker, template-web).
// Replace them with your product's journeys; keep the shape: spec() first, then the steps.

test(
  "a person gets a greeting",
  spec({
    proves: { "TPL-FEAT-1": ["AC-1"] },
    capability: "greetings",
    covers: ["template-service GET /api/v1/greetings 200"],
    critical: true,
  }),
  async ({ api }) => {
    const service = await api("template-service");
    const res = await service.get("/api/v1/greetings", { params: { name: "Ada" } });
    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual({ message: "Hello, Ada!" });
  },
);

test(
  "a name that is too long is refused",
  spec({
    proves: { "TPL-FEAT-1": ["AC-2"] },
    capability: "greetings",
    covers: ["template-service GET /api/v1/greetings 400"],
  }),
  async ({ api }) => {
    const service = await api("template-service");
    const res = await service.get("/api/v1/greetings", { params: { name: "x".repeat(101) } });
    expect(res.status()).toBe(400);
    expect(res.headers()["content-type"]).toContain("application/problem+json");
  },
);
