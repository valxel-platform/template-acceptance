/**
 * Events in acceptance tests: publish synthetic events and watch for the events a component must
 * publish. A watch starts at the topic's current end, so it only sees what the test causes.
 */
import { Kafka, type Admin, type Consumer, type Producer, type SASLOptions } from "kafkajs";
import { eventually } from "./eventually.ts";

export interface CloudEvent {
  id: string;
  type: string;
  source: string;
  subject?: string;
  time?: string;
  data?: Record<string, unknown>;
}

export interface Watch {
  next(match: (e: CloudEvent) => boolean, opts?: { timeoutMs?: number }): Promise<CloudEvent>;
}

export class Events {
  private kafka: Kafka | undefined;
  private admin: Admin | undefined;
  private producer: Producer | undefined;
  private consumers: Consumer[] = [];

  private readonly runId: string;
  private readonly reached: string[];
  private readonly e: NodeJS.ProcessEnv;

  constructor(runId: string, reached: string[], e: NodeJS.ProcessEnv = process.env) {
    this.runId = runId;
    this.reached = reached;
    this.e = e;
  }

  private client(): Kafka {
    if (this.kafka) return this.kafka;
    const brokers = (this.e.ACCEPTANCE_KAFKA_BOOTSTRAP ?? "").split(",").filter(Boolean);
    if (brokers.length === 0) throw new Error("set ACCEPTANCE_KAFKA_BOOTSTRAP to test events");
    const mechanism = this.e.ACCEPTANCE_KAFKA_SASL_MECHANISM as SASLOptions["mechanism"] | undefined;
    this.kafka = new Kafka({
      clientId: `acceptance-${this.runId}`,
      brokers,
      ssl: this.e.ACCEPTANCE_KAFKA_SSL === "true" || !!mechanism,
      ...(mechanism
        ? {
            sasl: {
              mechanism,
              username: this.e.ACCEPTANCE_KAFKA_USERNAME ?? "",
              password: this.e.ACCEPTANCE_KAFKA_PASSWORD ?? "",
            } as SASLOptions,
          }
        : {}),
    });
    return this.kafka;
  }

  /** Start watching a topic before the action that should publish to it. */
  async watch(topic: string): Promise<Watch> {
    const kafka = this.client();
    this.admin ??= kafka.admin();
    await this.admin.connect();
    const ends = await this.admin.fetchTopicOffsets(topic);
    const consumer = kafka.consumer({ groupId: `acceptance-${this.runId}-${this.consumers.length}` });
    this.consumers.push(consumer);
    await consumer.connect();
    await consumer.subscribe({ topics: [topic] });
    const seen: CloudEvent[] = [];
    await consumer.run({
      eachMessage: ({ message }) => {
        try {
          seen.push(JSON.parse(message.value?.toString() ?? "") as CloudEvent);
        } catch {
          // not an event: the component's own tests cover that
        }
        return Promise.resolve();
      },
    });
    for (const { partition, offset } of ends) consumer.seek({ topic, partition, offset });
    return {
      next: async (match, opts) => {
        const hit = await eventually(() => seen.find(match), {
          timeoutMs: opts?.timeoutMs ?? 20_000,
          what: `an event on ${topic}`,
        });
        this.reached.push(`event ${hit.type}`);
        return hit;
      },
    };
  }

  /** Publish a synthetic event, as another team's service would. */
  async publish(topic: string, key: string, event: CloudEvent): Promise<void> {
    this.producer ??= this.client().producer({ idempotent: true });
    await this.producer.connect();
    await this.producer.send({
      topic,
      acks: -1,
      messages: [
        {
          key,
          value: JSON.stringify({ specversion: "1.0", datacontenttype: "application/json", ...event }),
          headers: { ce_id: event.id, ce_type: event.type, ce_source: event.source },
        },
      ],
    });
    this.reached.push(`event ${event.type}`);
  }

  async close(): Promise<void> {
    await Promise.all(this.consumers.map((c) => c.disconnect()));
    await this.producer?.disconnect();
    await this.admin?.disconnect();
  }
}
