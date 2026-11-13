import { describe, expect, it } from "vitest";
import { components, credentials, token, urlOf } from "./env.ts";
import { eventually } from "./eventually.ts";

describe("env", () => {
  it("reads every component's URL", () => {
    const all = components('{"svc": "https://svc.dev", "web": "", "n": 1}');
    expect(all).toEqual({ svc: "https://svc.dev" });
    expect(urlOf("svc", all)).toBe("https://svc.dev");
    expect(() => urlOf("web", all)).toThrow("web is not deployed in this environment (VALXEL_ENV has: svc)");
    expect(components(undefined)).toEqual({});
    expect(() => components("[1]")).toThrow("JSON object");
  });

  it("gets a token for the test identity", async () => {
    expect(await token({ token: "given" })).toBe("given");
    expect(await token({})).toBeUndefined();
    await expect(token({ tokenUrl: "u" })).rejects.toThrow("_CLIENT_ID");
    let sent = "";
    const ok = ((_url: unknown, init?: { body?: unknown }) => {
      sent = String(init?.body);
      return Promise.resolve(new Response(JSON.stringify({ access_token: "issued" })));
    }) as typeof fetch;
    expect(await token({ tokenUrl: "u", clientId: "c", clientSecret: "s", scope: "api" }, ok)).toBe("issued");
    expect(sent).toContain("grant_type=client_credentials");
    expect(sent).toContain("scope=api");
    const refused = (() => Promise.resolve(new Response("no", { status: 401 }))) as typeof fetch;
    await expect(token({ tokenUrl: "u", clientId: "c", clientSecret: "s" }, refused)).rejects.toThrow("401");
    const empty = (() => Promise.resolve(new Response("{}"))) as typeof fetch;
    await expect(token({ tokenUrl: "u", clientId: "c", clientSecret: "s" }, empty)).rejects.toThrow(
      "access_token",
    );
    expect(credentials({ ACCEPTANCE_TOKEN: "x", ACCEPTANCE_OIDC_SCOPE: "" })).toEqual({
      token: "x",
      tokenUrl: undefined,
      clientId: undefined,
      clientSecret: undefined,
      scope: undefined,
    });
  });
});

describe("eventually", () => {
  it("waits for a result instead of sleeping", async () => {
    let n = 0;
    expect(await eventually(() => (++n >= 3 ? n : undefined), { intervalMs: 1 })).toBe(3);
    let m = 0;
    expect(
      await eventually(
        () => {
          if (++m < 2) throw new Error("not yet");
          return "applied";
        },
        { intervalMs: 1 },
      ),
    ).toBe("applied");
    await expect(
      eventually(() => undefined, { timeoutMs: 5, intervalMs: 1, what: "the read model" }),
    ).rejects.toThrow("the read model not met within 5ms");
    await expect(
      eventually(
        () => {
          throw new Error("boom");
        },
        { timeoutMs: 5, intervalMs: 1 },
      ),
    ).rejects.toThrow("condition not met within 5ms: boom");
  });
});
