import type { Rule } from "./rule";
import type { Condition } from "./condition";
import type { Action } from "./action";
import type { Operator } from "./condition";

/** User-facing choice per display. */
export type DisplayIdentitySetting = "auto" | "internal" | "external";

export interface DisplayAssignment {
  identity: DisplayIdentitySetting;
  /** Last seen label, for UI only. */
  label?: string;
  /** Backup matching fields in case `display.id` changes across sessions. */
  width?: number;
  height?: number;
  scaleFactor?: number;
}

export interface Settings {
  /** Master switch. When false, nothing is evaluated or executed. */
  enabled: boolean;
  /** Fire Event Actions on the startup evaluation (default false). */
  runCommandsOnStartup: boolean;
  /** key: String(display.id) */
  displayAssignments: Record<string, DisplayAssignment>;
  rules: Rule[];
}

export const CURRENT_SETTINGS_VERSION = 1;

export interface PersistedData {
  settingsVersion: number;
  settings: Settings;
}

export const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  runCommandsOnStartup: false,
  displayAssignments: {},
  rules: [],
};

/* ------------------------------------------------------------------ */
/* Sanitizers — persisted data is untrusted input.                     */
/* 0 is a legal value; bad types fall back to defaults.                */
/* ------------------------------------------------------------------ */

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function asBool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}

function asNumber(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function asString(v: unknown, fallback: string): string {
  return typeof v === "string" ? v : fallback;
}

const OPERATORS: readonly Operator[] = ["equals", "notEquals", "gt", "gte", "lt", "lte"];

function sanitizeCondition(raw: unknown): Condition | null {
  if (!isRecord(raw)) return null;
  const type = asString(raw["type"], "");
  const property = asString(raw["property"], "");
  if (!type || !property) return null;
  const operator = asString(raw["operator"], "equals");
  if (!OPERATORS.includes(operator as Operator)) return null;
  const value = raw["value"];
  if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") {
    return null;
  }
  return { type, property, operator: operator as Operator, value };
}

function sanitizeAction(raw: unknown): Action | null {
  if (!isRecord(raw)) return null;
  const type = asString(raw["type"], "");
  const target = asString(raw["target"], "");
  if (!type || !target) return null;
  const action: Action = { type, target };
  const trigger = raw["trigger"];
  if (trigger === "onEnter" || trigger === "onEvaluate") action.trigger = trigger;
  if (typeof raw["persist"] === "boolean") action.persist = raw["persist"];
  return action;
}

function sanitizeRule(raw: unknown, index: number): Rule | null {
  if (!isRecord(raw)) return null;
  const conditions = Array.isArray(raw["conditions"])
    ? (raw["conditions"] as unknown[]).map(sanitizeCondition).filter((c): c is Condition => c !== null)
    : [];
  const actions = Array.isArray(raw["actions"])
    ? (raw["actions"] as unknown[]).map(sanitizeAction).filter((a): a is Action => a !== null)
    : [];
  const logic = raw["conditionLogic"] === "OR" ? "OR" : "AND";
  // A rule with neither conditions nor actions is malformed — drop it.
  if (conditions.length === 0 && actions.length === 0) return null;
  return {
    id: asString(raw["id"], `rule-${index}`),
    name: asString(raw["name"], `Rule ${index + 1}`),
    enabled: asBool(raw["enabled"], true),
    conditions,
    conditionLogic: logic,
    actions,
    priority: asNumber(raw["priority"], 0),
  };
}

function sanitizeDisplayAssignments(raw: unknown): Record<string, DisplayAssignment> {
  const out: Record<string, DisplayAssignment> = {};
  if (!isRecord(raw)) return out;
  for (const [key, value] of Object.entries(raw)) {
    if (!isRecord(value)) continue;
    const identity = value["identity"];
    if (identity !== "auto" && identity !== "internal" && identity !== "external") continue;
    const assignment: DisplayAssignment = { identity };
    if (typeof value["label"] === "string") assignment.label = value["label"];
    if (typeof value["width"] === "number") assignment.width = value["width"];
    if (typeof value["height"] === "number") assignment.height = value["height"];
    if (typeof value["scaleFactor"] === "number") assignment.scaleFactor = value["scaleFactor"];
    out[key] = assignment;
  }
  return out;
}

function sanitizeSettings(raw: unknown): Settings {
  const s = isRecord(raw) ? raw : {};
  return {
    enabled: asBool(s["enabled"], DEFAULT_SETTINGS.enabled),
    runCommandsOnStartup: asBool(s["runCommandsOnStartup"], DEFAULT_SETTINGS.runCommandsOnStartup),
    displayAssignments: sanitizeDisplayAssignments(s["displayAssignments"]),
    rules: Array.isArray(s["rules"])
      ? (s["rules"] as unknown[])
          .map(sanitizeRule)
          .filter((r): r is Rule => r !== null)
      : [],
  };
}

/* ------------------------------------------------------------------ */
/* Migration — versioned, sequential.                                  */
/* ------------------------------------------------------------------ */

type MigrationStep = (data: Record<string, unknown>) => Record<string, unknown>;

/** key: from version → step to the next version. */
const MIGRATIONS: Record<number, MigrationStep> = {
  // 0 → 1: the initial schema; normalization is done by the sanitizers.
  0: (data) => data,
};

export interface MigrationResult {
  settings: Settings;
  migrated: boolean;
  fromVersion: number;
}

export function migrate(raw: unknown): MigrationResult {
  const data: Record<string, unknown> = isRecord(raw) ? raw : {};
  let version = asNumber(data["settingsVersion"], 0);
  const fromVersion = version;
  if (version > CURRENT_SETTINGS_VERSION) {
    // Data from a newer plugin version: keep what we understand.
    version = CURRENT_SETTINGS_VERSION;
  }
  while (version < CURRENT_SETTINGS_VERSION) {
    const step = MIGRATIONS[version];
    if (step) {
      const stepped = step(data);
      // Steps may rewrite `settings`; keep the raw settings object for sanitizing.
      Object.assign(data, stepped);
    }
    version += 1;
  }
  const settingsRaw = isRecord(data["settings"]) ? data["settings"] : data;
  return {
    settings: sanitizeSettings(settingsRaw),
    migrated: fromVersion !== CURRENT_SETTINGS_VERSION,
    fromVersion,
  };
}

export function toPersisted(settings: Settings): PersistedData {
  return { settingsVersion: CURRENT_SETTINGS_VERSION, settings };
}
