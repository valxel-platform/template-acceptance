/**
 * What a test proves and what it reaches, declared once and checked at run time.
 *
 * A cover is one of:
 *   <component> <METHOD> <path> [<status>]   e.g. "emr-intake-api PUT /api/v1/consents/{id} 202"
 *   event <type>                  e.g. "event valxel.consent.recorded.v1"
 *   page <component> <path>       e.g. "page emr-web /consents"
 *
 * `spec()` turns a declaration into Playwright tags and annotations. The Valxel SDLC selects tests
 * by tag (feature, components, @critical) and finds overlap from the covers, so keep both true:
 * the api and events fixtures fail a test that reaches something it doesn't declare. A status in
 * a cover tells apart tests of the same route (the happy path and a refusal); without one, any
 * status matches.
 */

export interface Declaration {
  /**
   * The criteria it proves, per feature: { "EMR-FEAT-12": ["AC-1", "AC-3"] }. When a later feature
   * extends the test, add its criteria and keep the earlier ones, so both stay traced.
   */
  proves: Record<string, string[]>;
  /** The capability, as the product names it, e.g. "consent". */
  capability: string;
  covers: string[];
  /** One of the product's critical journeys: also runs in staging for every feature. */
  critical?: boolean;
}

export interface Details {
  tag: string[];
  annotation: { type: string; description: string }[];
}

const METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);

export function normCover(cover: string): string {
  const parts = cover.trim().split(/\s+/);
  const [first, second, ...rest] = parts;
  if (first && second && METHODS.has(second.toUpperCase())) {
    return [first, second.toUpperCase(), ...rest].join(" ");
  }
  return parts.join(" ");
}

/** The component a cover reaches; events belong to no single component. */
export function componentOf(cover: string): string | undefined {
  const [first, second] = normCover(cover).split(" ");
  if (first === "event") return undefined;
  if (first === "page") return second;
  return first;
}

export function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function spec(d: Declaration): Details {
  const features = Object.entries(d.proves);
  if (features.length === 0) throw new Error("say which feature's criteria the test proves");
  for (const [feature, criteria] of features) {
    if (!/^[A-Z][A-Z0-9]*-FEAT-\d+$/.test(feature)) {
      throw new Error(`features look like EMR-FEAT-12, got ${feature}`);
    }
    if (criteria.length === 0 || criteria.some((c) => !/^AC-\d+$/.test(c))) {
      throw new Error(
        `${feature}: criteria must be AC-<n> and not empty, got ${criteria.join(", ") || "none"}`,
      );
    }
  }
  if (d.covers.length === 0) throw new Error("declare what the test covers");
  const covers = d.covers.map(normCover);
  const components = [...new Set(covers.map(componentOf).filter((c): c is string => !!c))].sort();
  const tag = [
    ...features.flatMap(([feature, criteria]) => [`@${feature}`, ...criteria.map((c) => `@${feature}/${c}`)]),
    `@cap-${slug(d.capability)}`,
    ...components.map((c) => `@comp-${c}`),
    ...(d.critical ? ["@critical"] : []),
  ];
  return {
    tag,
    annotation: [
      { type: "capability", description: slug(d.capability) },
      ...covers.map((c) => ({ type: "covers", description: c })),
    ],
  };
}

/** Whether a concrete path matches a declared template like /api/v1/consents/{id}. */
export function matchesPath(template: string, path: string): boolean {
  const bare = path.split("?")[0] ?? path;
  const rx = template
    .split("/")
    .map((seg) => (/^\{[^}]+\}$/.test(seg) ? "[^/]+" : seg.replace(/[.*+?^$()|[\]\\]/g, "\\$&")))
    .join("/");
  return new RegExp(`^${rx}/?$`).test(bare);
}

/** What a test reached but didn't declare (observed as "<component> <METHOD> <path> <status>" or "event <type>"). */
export function undeclared(declared: string[], observed: string[]): string[] {
  const decl = declared.map(normCover);
  return [...new Set(observed.map(normCover))].filter((o) => {
    const [comp, method, path, status] = o.split(" ");
    if (comp === "event") return !decl.includes(o);
    return !decl.some((d) => {
      const [dc, dm, dp, ds] = d.split(" ");
      return (
        dc === comp && dm === method && !!dp && !!path && matchesPath(dp, path) && (!ds || ds === status)
      );
    });
  });
}
