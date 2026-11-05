/**
 * Test fixtures. Import `test` and `expect` from here, not from @playwright/test:
 *
 *   api(component)   requests to a deployed component, as the test identity; recorded
 *   events           watch for and publish Kafka events; recorded
 *   eventually       wait for an asynchronous result (an event worker applying a change)
 *   runId            unique per test: use it in ids and names so runs never collide
 *
 * After each test, whatever it reached through `api` and `events` must be in its declared covers
 * (see spec() in covers.ts), so the catalog stays true and overlap can be found.
 */
import { test as base, expect, request, type APIRequestContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { undeclared } from "./covers.ts";
import { token, urlOf } from "./env.ts";
import { eventually } from "./eventually.ts";
import { Events } from "./kafka.ts";

type Options = Parameters<APIRequestContext["get"]>[1];

export interface ComponentApi {
  get(path: string, options?: Options): ReturnType<APIRequestContext["get"]>;
  post(path: string, options?: Options): ReturnType<APIRequestContext["post"]>;
  put(path: string, options?: Options): ReturnType<APIRequestContext["put"]>;
  patch(path: string, options?: Options): ReturnType<APIRequestContext["patch"]>;
  delete(path: string, options?: Options): ReturnType<APIRequestContext["delete"]>;
}

interface TestFixtures {
  runId: string;
  reached: string[];
  api: (component: string) => Promise<ComponentApi>;
  events: Events;
  eventually: typeof eventually;
  coversCheck: undefined;
}

interface WorkerFixtures {
  bearer: string | undefined;
}

export const test = base.extend<TestFixtures, WorkerFixtures>({
  bearer: [
    async ({}, use) => {
      await use(await token());
    },
    { scope: "worker" },
  ],
  runId: async ({}, use) => {
    await use(`t${randomUUID().slice(0, 8)}`);
  },
  reached: async ({}, use) => {
    await use([]);
  },
  api: async ({ bearer, reached, runId }, use) => {
    const contexts: APIRequestContext[] = [];
    await use(async (component: string) => {
      const ctx = await request.newContext({
        baseURL: urlOf(component),
        extraHTTPHeaders: {
          ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
          "x-acceptance-run": runId,
        },
      });
      contexts.push(ctx);
      const call = async (
        method: "get" | "post" | "put" | "patch" | "delete",
        path: string,
        options?: Options,
      ) => {
        const res = await ctx[method](path, options);
        reached.push(`${component} ${method.toUpperCase()} ${path} ${res.status()}`);
        return res;
      };
      return {
        get: (p, o) => call("get", p, o),
        post: (p, o) => call("post", p, o),
        put: (p, o) => call("put", p, o),
        patch: (p, o) => call("patch", p, o),
        delete: (p, o) => call("delete", p, o),
      };
    });
    await Promise.all(contexts.map((c) => c.dispose()));
  },
  events: async ({ reached, runId }, use) => {
    const events = new Events(runId, reached);
    await use(events);
    await events.close();
  },
  eventually: async ({}, use) => {
    await use(eventually);
  },
  // Runs around every test: what it reached must be declared, or the catalog would lie.
  coversCheck: [
    async ({ reached }, use, info) => {
      await use(undefined);
      const declared = info.annotations.filter((a) => a.type === "covers").map((a) => a.description ?? "");
      const extra = undeclared(declared, reached);
      if (extra.length > 0 && info.status === info.expectedStatus) {
        throw new Error(`the test reached what it doesn't declare; add to its covers: ${extra.join(", ")}`);
      }
    },
    { auto: true },
  ],
});

export { expect };
export { spec } from "./covers.ts";
