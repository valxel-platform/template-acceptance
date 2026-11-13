/**
 * The built screens, scanned for the Valxel SDLC (see .github/workflows/screens.yml): each screen the
 * approved UX spec names is opened at desktop and phone widths, checked with axe against WCAG 2.1 AA,
 * and screenshotted. The check run `screens / <feature> / <stage>` carries one line per screen and
 * one per violation; serious and critical violations block the release in the tool.
 */

export interface Screen {
  id: string;
  name?: string;
  app?: string; // "<org>/<repo>" of the web app the screen lives in
  route: string;
}

export interface Violation {
  impact: "minor" | "moderate" | "serious" | "critical";
  rule: string;
  text: string;
}

export interface Visit {
  id: string;
  route: string;
  ok: boolean; // the page loaded (status below 400, no navigation error)
  error?: string;
  shots: { desktop?: string; phone?: string }; // paths on the screenshots branch
  violations: Violation[];
}

const BLOCKING = new Set(["serious", "critical"]);

/** Where a screen is opened: through the product's BFF when it has one (a web app is reached only
 * through it), else the app's own URL. `env` maps component names to URLs. */
export function baseFor(screen: Screen, env: Record<string, string>): string {
  const pick = (re: RegExp): string | undefined => {
    const key = Object.keys(env).find((k) => re.test(k));
    return key ? env[key] : undefined;
  };
  const app = (screen.app ?? "").split("/").pop() ?? "";
  const url = pick(/(^|-)bff$/) ?? (app ? env[app] : undefined) ?? pick(/(^|-)web$/);
  if (url) return url;
  throw new Error(`no URL for ${screen.id}: VALXEL_ENV has ${Object.keys(env).join(", ") || "nothing"}`);
}

export function join(base: string, route: string): string {
  return base.replace(/\/+$/, "") + "/" + route.replace(/^\/+/, "");
}

/** The check run the tool reads: a line per screen, a line per violation (one per rule per screen). */
export function summarize(visits: Visit[]): {
  conclusion: "success" | "failure";
  title: string;
  summary: string;
} {
  const lines: string[] = [];
  let blocking = 0;
  for (const v of visits) {
    const shots = [
      v.shots.desktop && `desktop: ${v.shots.desktop}`,
      v.shots.phone && `phone: ${v.shots.phone}`,
    ]
      .filter(Boolean)
      .join("; ");
    // "failed": didn't load, or has a serious or critical problem (listed on the lines below it)
    const bad = !v.ok || v.violations.some((x) => BLOCKING.has(x.impact));
    lines.push(
      `- ${v.id} ${v.route || "-"}: ${bad ? "failed" : "passed"}${shots ? `; ${shots}` : ""}${v.error ? ` (${v.error})` : ""}`,
    );
    const seen = new Set<string>();
    for (const x of v.violations) {
      if (seen.has(x.rule)) continue;
      seen.add(x.rule);
      if (BLOCKING.has(x.impact)) blocking += 1;
      lines.push(`- ${v.id} ${x.impact} ${x.rule}: ${x.text.replace(/\s+/g, " ").slice(0, 200)}`);
    }
  }
  const failed = visits.filter((v) => !v.ok).length;
  const conclusion = blocking || failed ? "failure" : "success";
  const title = failed
    ? `${failed} screen(s) didn't load`
    : blocking
      ? `${blocking} serious or critical accessibility problem(s)`
      : `${visits.length} screen(s) scanned, no serious problems`;
  return { conclusion, title, summary: `${visits.length} screens\n${lines.join("\n")}\n` };
}

export function parseScreens(raw: string | undefined): Screen[] {
  if (!raw) return [];
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error("SCREENS must be a JSON list");
  return parsed.filter(
    (s): s is Screen =>
      !!s &&
      typeof s === "object" &&
      typeof (s as Screen).id === "string" &&
      typeof (s as Screen).route === "string",
  );
}
