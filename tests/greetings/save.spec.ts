import { expect, spec, test } from "../../src/fixtures.ts";

const topic = process.env.GREETINGS_TOPIC ?? "local.template-service.greetings.v1";

// A command across repos: the service publishes the change to Kafka first (VX-16); the event
// worker applies it. The test watches the topic before acting, so it sees only its own event.
test(
  "a saved greeting is published once, even when the request is retried",
  spec({
    proves: { "TPL-FEAT-2": ["AC-1", "AC-2"] },
    capability: "greetings",
    covers: ["template-service PUT /api/v1/greetings/{id} 202", "event valxel.greeting.saved.v1"],
  }),
  async ({ api, events, runId }) => {
    const service = await api("template-service");
    const watch = await events.watch(topic);
    const id = `g-${runId}`; // synthetic data only, unique per run
    const save = () =>
      service.put(`/api/v1/greetings/${id}`, {
        data: { name: "Test Person", message: "Welcome back" },
        headers: { "Idempotency-Key": runId },
      });

    const first = await save();
    expect(first.status()).toBe(202);
    const retry = await save(); // a client retry: same Idempotency-Key, same event id
    expect(retry.status()).toBe(202);
    const { eventId } = (await first.json()) as { eventId: string };
    expect(((await retry.json()) as { eventId: string }).eventId).toBe(eventId);

    const event = await watch.next((e) => e.subject === `greeting/${id}`);
    expect(event.type).toBe("valxel.greeting.saved.v1");
    expect(event.id).toBe(eventId);
    expect(event.data).toMatchObject({ id, message: "Welcome back" });
  },
);
