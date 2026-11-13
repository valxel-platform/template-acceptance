# Acceptance tests template (Playwright Test, TypeScript)

A product's end-to-end tests across repos. Each repo tests itself; this repo tests a **feature**:
the web app, the services, Kafka and the event workers together, in a deployed environment. One
acceptance repo per product (role `acceptance` in its `product.yaml`).

The Valxel SDLC runs it after a feature's whole change set is deployed to dev, then staging, and
reads the result per acceptance criterion. A criterion without a passing test stops the feature
before G6.

## Two kinds of tests

| Project | Files          | Runs when                    | How                                                                  |
| ------- | -------------- | ---------------------------- | -------------------------------------------------------------------- |
| `api`   | `*.spec.ts`    | Every feature                | Through the components' APIs and Kafka, no browser: seconds per test |
| `ui`    | `*.ui.spec.ts` | The change set has a web app | Browser journeys with Playwright                                     |

Backend-only features run only `api` tests. Typical backend tests:

- a command, then read the result back once the event workers have applied it (`eventually`);
- an event a service must publish (`events.watch(topic)` before acting, then `next(match)`);
- an event from another team's service (`events.publish`), then its effect through an API;
- a duplicate request (same `Idempotency-Key`) applied once; a refused request (status in covers).

Never read or write a component's database: test what users and other services can see.

## Writing a test

```ts
import { expect, spec, test } from "../../src/fixtures.ts";

test(
  "a recorded consent shows on the patient's chart",
  spec({
    proves: { "EMR-FEAT-12": ["AC-1", "AC-2"] },
    capability: "consent",
    covers: [
      "emr-intake-api PUT /api/v1/consents/{id} 202",
      "event valxel.consent.recorded.v1",
      "emr-chart-api GET /api/v1/patients/{id}/consents 200",
    ],
  }),
  async ({ api, events, eventually, runId }) => {
    const intake = await api("emr-intake-api");
    const chart = await api("emr-chart-api");
    const watch = await events.watch(process.env.CONSENTS_TOPIC ?? "");
    const id = `c-${runId}`;
    expect((await intake.put(`/api/v1/consents/${id}`, { data: {/* synthetic */} })).status()).toBe(202);
    await watch.next((e) => e.subject === `consent/${id}`);
    await eventually(async () => {
      const res = await chart.get(`/api/v1/patients/p-${runId}/consents`);
      return res.ok() && ((await res.json()) as unknown[]).length > 0 ? true : undefined;
    });
  },
);
```

`spec()` makes the tags the pipeline selects by: `@EMR-FEAT-12`, `@EMR-FEAT-12/AC-1`,
`@cap-consent`, a `@comp-<component>` per component in the covers, and `@critical` for the
product's critical journeys (they also run in staging for every feature). After each test, the
fixtures check that everything it reached through `api` and `events` is in its covers.

Covers: `<component> <METHOD> <path> [<status>]`, `event <type>`, `page <component> <path>`. A
status tells apart tests of one route (the happy path, a refusal). Covers are how overlap is found,
so declare routes a browser journey exercises too.

## Extending instead of adding

`catalog.json` lists every test with its tags, capability and covers (`npm run catalog`; CI checks
it is current). The Valxel SDLC gives it to the planner, and the plan says per criterion:

```
- AC-2: extend consents/capture.spec.ts "records consent"
- AC-3: replace consents/expiry.spec.ts "expires after a year"
- AC-4: add consents/withdraw.spec.ts covers: emr-intake-api DELETE /api/v1/consents/{id} 204
```

A new test whose covers an existing test of the same kind (API or browser) already has is rejected
unless the line gives `because:`. The nightly full run's review lists tests another test already
covers and the slowest tests, to merge or trim them.

## Runs

`.github/workflows/acceptance.yml`:

- **Per feature** (`repository_dispatch: valxel-acceptance`): every component's URL (`VALXEL_ENV`),
  the selected tags and projects, the feature's criteria. Posts the check run
  `acceptance / <feature> / <stage>` with a line per criterion and the duration.
- **Nightly** (and by hand): the full regression against staging, plus the review.

Set up GitHub environments `dev` and `staging` with: `ACCEPTANCE_ENV` (component URLs, for
scheduled runs), `ACCEPTANCE_KAFKA_BOOTSTRAP` (+ SASL variables and `ACCEPTANCE_KAFKA_PASSWORD`),
`ACCEPTANCE_OIDC_TOKEN_URL`, `ACCEPTANCE_OIDC_CLIENT_ID` and secret `ACCEPTANCE_OIDC_CLIENT_SECRET`
for the test identity (or a secret `ACCEPTANCE_TOKEN`), topic variables your tests read, and
`ACCEPTANCE_BUDGET_S`. Never point a run at production.

## Develop

```bash
npm ci
npm test                     # the fixtures' own tests
npm run catalog              # after adding or changing tests
VALXEL_ENV='{"template-service":"http://localhost:8080"}' npx playwright test --project api
```

The examples in `tests/greetings` run against the templates (template-service,
template-event-worker, template-web). Replace them with your product's journeys.

## Screens scan (accessibility and screenshots)

`.github/workflows/screens.yml` runs when the Valxel SDLC sends `valxel-screens` after staging is
deployed. It opens each screen the approved UX spec names (through the BFF when the product has one),
with the staging test identity, at 1280 and 390 pixels wide; runs axe against WCAG 2.1 AA; commits the
screenshots to the `valxel-screens` branch; and posts the check run `screens / <feature> / staging`.
Serious and critical violations, and screens that don't load, fail it and block the release.

Locally: `SCREENS='[{"id":"S1","route":"/checkin"}]' VALXEL_ENV='{"web":"http://localhost:3000"}' npm run screens`
then `npm run screens-report`.
