/**
 * catalog.json: every acceptance test with its file, title, tags, capability and covers, so the
 * Valxel SDLC can plan new tests against what exists. Built from `playwright test --list
 * --reporter=json`; `npm run catalog` writes it, CI checks it is current and complete.
 */

export interface Entry {
  file: string;
  title: string;
  project: string;
  tags: string[];
  capability: string;
  covers: string[];
}

export interface Catalog {
  tests: Entry[];
}

interface ListTest {
  projectName?: string;
  annotations?: { type: string; description?: string }[];
}
interface ListSpec {
  title: string;
  file: string;
  tags?: string[];
  tests?: ListTest[];
}
interface ListSuite {
  title: string;
  file?: string;
  specs?: ListSpec[];
  suites?: ListSuite[];
}

/** Walk Playwright's JSON list output: one entry per test and project. */
export function fromList(list: { suites?: ListSuite[] }): Catalog {
  const out: Entry[] = [];
  const walk = (suite: ListSuite, path: string[], top: boolean) => {
    const here = top ? path : [...path, suite.title];
    for (const s of suite.specs ?? []) {
      for (const t of s.tests ?? []) {
        const notes = t.annotations ?? [];
        out.push({
          file: s.file,
          title: [...here, s.title].join(" › "),
          project: t.projectName ?? "api",
          tags: (s.tags ?? []).map((tag) => (tag.startsWith("@") ? tag : `@${tag}`)),
          capability: notes.find((a) => a.type === "capability")?.description ?? "",
          covers: notes.filter((a) => a.type === "covers").map((a) => a.description ?? ""),
        });
      }
    }
    for (const child of suite.suites ?? []) walk(child, here, false);
  };
  for (const file of list.suites ?? []) walk(file, [], true);
  out.sort(
    (a, b) =>
      a.file.localeCompare(b.file) || a.title.localeCompare(b.title) || a.project.localeCompare(b.project),
  );
  return { tests: out };
}

/** Every test says which feature and criteria it proves, its capability and what it covers. */
export function problems(catalog: Catalog): string[] {
  const out: string[] = [];
  for (const t of catalog.tests) {
    const name = `${t.file} "${t.title}"`;
    if (!t.tags.some((tag) => /^@[A-Z][A-Z0-9]*-FEAT-\d+\/AC-\d+$/.test(tag))) {
      out.push(`${name} proves no acceptance criterion (tag @<feature>/AC-<n>; use spec())`);
    }
    if (!t.capability) out.push(`${name} has no capability`);
    if (t.covers.length === 0) out.push(`${name} declares no covers`);
  }
  return out;
}

export function render(catalog: Catalog): string {
  return `${JSON.stringify(catalog, null, 2)}\n`;
}
