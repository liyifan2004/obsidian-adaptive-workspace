import type { Rule } from "../types/rule";

export type MoveDirection = "up" | "down";

/**
 * Move a rule one step up or down in the priority-ordered list (CHANGELOG_DEV
 * O-08). "Moving" swaps priority values with the neighbor — the list order IS
 * the priority order, so this is what the user means by reordering. When the
 * two priorities are equal the array position is swapped as well: array order
 * breaks priority ties in the merge (docs/adr/0006).
 *
 * Returns the same array instance when nothing changes, so callers can skip
 * saving.
 */
export function moveRule(rules: Rule[], ruleId: string, direction: MoveDirection): Rule[] {
  const ordered = [...rules].sort((a, b) => b.priority - a.priority);
  const i = ordered.findIndex((r) => r.id === ruleId);
  const j = direction === "up" ? i - 1 : i + 1;
  const moved = i >= 0 ? ordered[i] : undefined;
  const neighbor = j >= 0 ? ordered[j] : undefined;
  if (!moved || !neighbor) return rules;

  const next = rules.map((r) =>
    r.id === moved.id
      ? { ...r, priority: neighbor.priority }
      : r.id === neighbor.id
        ? { ...r, priority: moved.priority }
        : r,
  );

  // Swap array positions too: it only matters for equal priorities (tie-break),
  // and keeps the array order consistent with the displayed order otherwise.
  const mi = next.findIndex((r) => r.id === moved.id);
  const ni = next.findIndex((r) => r.id === neighbor.id);
  const movedCopy = next[mi];
  const neighborCopy = next[ni];
  if (!movedCopy || !neighborCopy) return next;
  next[mi] = neighborCopy;
  next[ni] = movedCopy;
  return next;
}
