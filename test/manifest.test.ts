import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Submission-consistency checks for manifest.json / package.json / versions.json.
 *
 * The constraints mirror the official review-bot rules — the same checks
 * encoded in eslint-plugin-obsidianmd's `validate-manifest` rule (FORBIDDEN_WORDS
 * = ["obsidian", "plugin"] for name/description/id; description format:
 * 10–250 chars, capital start, period end, restricted charset) plus the
 * release requirement that manifest, package.json and versions.json agree on
 * the version. That rule cannot run here: it requires an ESTree-shaped JSON
 * AST (Program > ExpressionStatement > ObjectExpression) which neither
 * @eslint/json (root: "Document") nor jsonc-eslint-parser (JSONExpressionStatement
 * / JSONObjectExpression) produces, so it silently passes everything.
 * See docs/TECHNICAL_REFERENCES.md R1.
 */

interface Manifest {
  id?: unknown;
  name?: unknown;
  version?: unknown;
  description?: unknown;
  minAppVersion?: unknown;
  author?: unknown;
  isDesktopOnly?: unknown;
  [key: string]: unknown;
}

function readJson(relPath: string): unknown {
  const url = new URL(`../${relPath}`, import.meta.url);
  return JSON.parse(readFileSync(url, "utf8"));
}

const manifest = readJson("manifest.json") as Manifest;
const pkg = readJson("package.json") as Manifest;
const versions = readJson("versions.json") as Record<string, unknown>;

/** Same charset check as the official descriptionFormat rule. */
const DESCRIPTION_CHARSET = /^[A-Za-z0-9\s.,!?'"-]+$/;
const FORBIDDEN_WORDS = ["obsidian", "plugin"];

describe("manifest submission constraints", () => {
  it("has every required key with the right type", () => {
    expect(typeof manifest.id).toBe("string");
    expect(typeof manifest.name).toBe("string");
    expect(typeof manifest.version).toBe("string");
    expect(typeof manifest.description).toBe("string");
    expect(typeof manifest.minAppVersion).toBe("string");
    expect(typeof manifest.author).toBe("string");
    expect(typeof manifest.isDesktopOnly).toBe("boolean");
  });

  it("only carries known keys (no leftovers from experiments)", () => {
    const allowed = new Set([
      "id",
      "name",
      "version",
      "description",
      "minAppVersion",
      "author",
      "authorUrl",
      "fundingUrl",
      "isDesktopOnly",
    ]);
    for (const key of Object.keys(manifest)) {
      expect(allowed.has(key), `unexpected manifest key: ${key}`).toBe(true);
    }
  });

  it("keeps forbidden words out of id, name and description", () => {
    for (const key of ["id", "name", "description"] as const) {
      const value = String(manifest[key]).toLowerCase();
      for (const word of FORBIDDEN_WORDS) {
        expect(value.includes(word), `${key} must not contain "${word}"`).toBe(false);
      }
    }
  });

  it("formats the description per the submission rules", () => {
    const description = String(manifest.description);
    expect(description.length).toBeGreaterThanOrEqual(10);
    expect(description.length).toBeLessThanOrEqual(250);
    expect(description).toMatch(/^[A-Z]/);
    expect(description.endsWith(".")).toBe(true);
    expect(description).toMatch(DESCRIPTION_CHARSET);
  });

  it("uses a lowercase, hyphenated id", () => {
    expect(String(manifest.id)).toMatch(/^[a-z0-9-]+$/);
  });

  it("keeps the version in sync across manifest, package.json and versions.json", () => {
    expect(manifest.version).toBe(pkg.version);
    expect(versions).toHaveProperty(String(manifest.version));
  });
});
