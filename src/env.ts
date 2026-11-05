/**
 * Where the run points, from the environment the acceptance workflow sets:
 *   VRIXEL_ENV                    {"<component>": "<base url>"} for every deployed component
 *   ACCEPTANCE_TOKEN              a bearer token for the test identity, or
 *   ACCEPTANCE_OIDC_TOKEN_URL     client credentials: _CLIENT_ID, _CLIENT_SECRET, _SCOPE
 *   ACCEPTANCE_KAFKA_BOOTSTRAP    the environment's Kafka (+ _SASL_MECHANISM, _USERNAME, _PASSWORD)
 */

export function components(raw = process.env.VRIXEL_ENV): Record<string, string> {
  if (!raw) return {};
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error('VRIXEL_ENV must be a JSON object: {"<component>": "<url>"}');
  }
  return Object.fromEntries(
    Object.entries(parsed as Record<string, unknown>).filter(
      (e): e is [string, string] => typeof e[1] === "string" && !!e[1],
    ),
  );
}

export function urlOf(component: string, all = components()): string {
  const url = all[component];
  if (!url) {
    const known = Object.keys(all).join(", ") || "none";
    throw new Error(`${component} is not deployed in this environment (VRIXEL_ENV has: ${known})`);
  }
  return url;
}

export interface Credentials {
  token?: string;
  tokenUrl?: string;
  clientId?: string;
  clientSecret?: string;
  scope?: string;
}

export function credentials(e: NodeJS.ProcessEnv = process.env): Credentials {
  return {
    token: e.ACCEPTANCE_TOKEN || undefined,
    tokenUrl: e.ACCEPTANCE_OIDC_TOKEN_URL || undefined,
    clientId: e.ACCEPTANCE_OIDC_CLIENT_ID || undefined,
    clientSecret: e.ACCEPTANCE_OIDC_CLIENT_SECRET || undefined,
    scope: e.ACCEPTANCE_OIDC_SCOPE || undefined,
  };
}

/** A bearer token for the test identity: given, or by OAuth client credentials; none locally. */
export async function token(
  c: Credentials = credentials(),
  fetcher: typeof fetch = fetch,
): Promise<string | undefined> {
  if (c.token) return c.token;
  if (!c.tokenUrl) return undefined;
  if (!c.clientId || !c.clientSecret)
    throw new Error("ACCEPTANCE_OIDC_TOKEN_URL needs _CLIENT_ID and _CLIENT_SECRET");
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: c.clientId,
    client_secret: c.clientSecret,
  });
  if (c.scope) body.set("scope", c.scope);
  const res = await fetcher(c.tokenUrl, { method: "POST", body });
  if (!res.ok) throw new Error(`token request failed: ${res.status}`);
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) throw new Error("token response has no access_token");
  return json.access_token;
}
