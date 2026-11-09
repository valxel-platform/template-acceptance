// Journey load test (k6), in staging, when the Vrixel SDLC says the change set needs one: the
// product's critical journeys across its components, at the expected peak scaled to staging
// (TARGET_RPS), for three minutes after a warm-up. perf/compare.py judges it against the budget and
// the last passing run; the acceptance report carries the result. Replace the journey below with
// your product's critical ones, using the same component URLs the acceptance tests use.
import http from "k6/http";
import { check, group } from "k6";

const ENV = JSON.parse(__ENV.VRIXEL_ENV || "{}");
const RATE = Math.max(1, Math.round(Number(__ENV.TARGET_RPS || 5)));
const headers = __ENV.ACCEPTANCE_TOKEN ? { Authorization: `Bearer ${__ENV.ACCEPTANCE_TOKEN}` } : {};

export const options = {
  scenarios: {
    warmup: {
      executor: "constant-arrival-rate",
      rate: Math.max(1, Math.round(RATE / 2)),
      timeUnit: "1s",
      duration: "30s",
      preAllocatedVUs: 10,
      maxVUs: 200,
    },
    load: {
      executor: "constant-arrival-rate",
      rate: RATE,
      timeUnit: "1s",
      duration: __ENV.DURATION || "3m",
      startTime: "30s",
      preAllocatedVUs: 10,
      maxVUs: 200,
    },
  },
  summaryTrendStats: ["avg", "p(95)", "p(99)", "max"],
  thresholds: {
    "http_req_duration{scenario:load}": ["max>=0"],
    "http_req_failed{scenario:load}": ["rate>=0"],
    "http_reqs{scenario:load}": ["count>=0"],
  },
};

export default function () {
  group("a person gets a greeting", () => {
    const service = ENV["template-service"];
    if (!service) return;
    const res = http.get(`${service}/api/v1/greetings?name=Perf`, { headers });
    check(res, { "greeting 200": (r) => r.status === 200 });
  });
}

export function handleSummary(data) {
  return { [__ENV.SUMMARY || "summary.json"]: JSON.stringify(data) };
}
