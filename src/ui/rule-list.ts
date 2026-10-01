import { Modal, Setting, type App } from "obsidian";
import type { Rule } from "../types/rule";
import type { ConditionRegistry } from "../conditions/condition-registry";
import type { ActionRegistry } from "../actions/action-registry";
import type { Operator } from "../types/condition";

export interface RuleListCallbacks {
  onEdit(rule: Rule): void;
  onToggle(rule: Rule, enabled: boolean): void;
  onDelete(rule: Rule): void;
}

class ConfirmDeleteModal extends Modal {
  constructor(
    app: App,
    private readonly message: string,
    private readonly onConfirm: () => void,
  ) {
    super(app);
  }

  override onOpen(): void {
    this.contentEl.createEl("p", { text: this.message });
    new Setting(this.contentEl)
      .addButton((b) =>
        b.setButtonText("Cancel").onClick(() => {
          this.close();
        }),
      )
      .addButton((b) =>
        b.setButtonText("Delete").onClick(() => {
          this.close();
          this.onConfirm();
        }),
      );
  }
}

function operatorLabel(op: Operator): string {
  switch (op) {
    case "equals":
      return "=";
    case "notEquals":
      return "≠";
    case "gt":
      return ">";
    case "gte":
      return "≥";
    case "lt":
      return "<";
    case "lte":
      return "≤";
    default:
      return op;
  }
}

export function summarizeRule(
  rule: Rule,
  conditions: ConditionRegistry,
  actions: ActionRegistry,
): string {
  const condText = rule.conditions
    .map((c) => {
      const def = conditions.get(c.type);
      const prop = def?.properties.find((p) => p.key === c.property);
      return `${def?.label ?? c.type} ${prop?.label ?? c.property} ${operatorLabel(c.operator)} ${String(c.value)}`;
    })
    .join(rule.conditionLogic === "OR" ? " OR " : " + ");

  const actionText = rule.actions
    .map((a) => {
      const def = actions.get(a.type);
      return def ? def.describe(a) : `unknown(${a.type})`;
    })
    .join(", ");

  return `${condText || "(always)"} → ${actionText || "(no action)"}`;
}

export function renderRuleList(
  app: App,
  container: HTMLElement,
  rules: Rule[],
  conditions: ConditionRegistry,
  actions: ActionRegistry,
  callbacks: RuleListCallbacks,
): void {
  container.empty();
  if (rules.length === 0) {
    container.createDiv({
      cls: "aw-empty",
      text: "No rules yet. Create one to adapt your workspace automatically.",
    });
    return;
  }
  const sorted = [...rules].sort((a, b) => b.priority - a.priority);
  for (const rule of sorted) {
    const setting = new Setting(container).setName(rule.name).setDesc(summarizeRule(rule, conditions, actions));
    setting.addToggle((t) => {
      t.setValue(rule.enabled).onChange((v) => callbacks.onToggle(rule, v));
    });
    setting.addExtraButton((b) => {
      b.setIcon("pencil");
      b.setTooltip("Edit rule");
      b.onClick(() => callbacks.onEdit(rule));
    });
    setting.addExtraButton((b) => {
      b.setIcon("trash");
      b.setTooltip("Delete rule");
      b.onClick(() => {
        new ConfirmDeleteModal(
          app,
          `Delete rule "${rule.name}"? ` +
            `Its ${rule.conditions.length} condition(s) and ` +
            `${rule.actions.length} action(s) will be removed permanently. This cannot be undone.`,
          () => callbacks.onDelete(rule),
        ).open();
      });
    });
  }
}
