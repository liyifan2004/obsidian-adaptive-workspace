import { Modal, Setting, type App } from "obsidian";
import type { Action, ActionTrigger } from "../types/action";
import type { Condition, Operator } from "../types/condition";
import type { Rule } from "../types/rule";
import type { ActionRegistry } from "../actions/action-registry";
import type {
  ConditionPropertyDef,
  ConditionRegistry,
} from "../conditions/condition-registry";
import type { CommandLike, PluginManifestLike } from "../core/internal-api";
import { CommandSuggestModal, PluginSuggestModal } from "./pickers";
import { isLikelyToggleCommand } from "../actions/command-action";
import { PLUGIN_ID } from "../config";

export interface RuleEditorHost {
  conditionRegistry: ConditionRegistry;
  actionRegistry: ActionRegistry;
  listPlugins(): PluginManifestLike[];
  listCommands(): CommandLike[];
}

function cloneRule(rule: Rule): Rule {
  return {
    ...rule,
    conditions: rule.conditions.map((c) => ({ ...c })),
    actions: rule.actions.map((a) => ({ ...a })),
  };
}

/**
 * Schema-driven rule editor: condition/action rows are rendered from the
 * registry definitions, so new condition types never require rewriting this
 * modal (architecture requirement).
 */
export class RuleEditorModal extends Modal {
  private readonly draft: Rule;
  private conditionsEl!: HTMLElement;
  private actionsEl!: HTMLElement;
  private errorEl!: HTMLElement;
  private readonly conditionRows: HTMLElement[] = [];
  private readonly actionRows: HTMLElement[] = [];

  constructor(
    app: App,
    private readonly host: RuleEditorHost,
    rule: Rule,
    private readonly onSave: (rule: Rule) => void,
  ) {
    super(app);
    this.draft = cloneRule(rule);
    this.modalEl.addClass("aw-rule-editor");
  }

  override onOpen(): void {
    super.onOpen();
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "Edit rule" });

    new Setting(contentEl).setName("Rule name").addText((t) => {
      t.setValue(this.draft.name).onChange((v) => {
        this.draft.name = v;
      });
    });

    new Setting(contentEl)
      .setName("Condition logic")
      .setDesc("All conditions must hold (and) or any condition (or).")
      .addDropdown((d) => {
        d.addOption("AND", "And — all conditions");
        d.addOption("OR", "Or — any condition");
        d.setValue(this.draft.conditionLogic).onChange((v) => {
          this.draft.conditionLogic = v === "OR" ? "OR" : "AND";
        });
      });

    contentEl.createEl("h3", { text: "Conditions" });
    this.conditionsEl = contentEl.createDiv({ cls: "aw-rows" });
    new Setting(contentEl).addButton((b) =>
      b.setButtonText("Add condition").onClick(() => {
        const def = this.host.conditionRegistry.all()[0];
        if (!def) return;
        const prop = def.properties[0];
        if (!prop) return;
        this.draft.conditions.push(defaultCondition(def.type, prop));
        this.renderConditions();
      }),
    );

    contentEl.createEl("h3", { text: "Actions" });
    this.actionsEl = contentEl.createDiv({ cls: "aw-rows" });
    new Setting(contentEl).addButton((b) =>
      b.setButtonText("Add action").onClick(() => {
        const def = this.host.actionRegistry.all()[0];
        if (!def) return;
        this.draft.actions.push({ type: def.type, target: "" });
        this.renderActions();
      }),
    );

    new Setting(contentEl).setName("Priority").setDesc("Higher wins when rules conflict.").addText((t) => {
      t.inputEl.type = "number";
      t.setValue(String(this.draft.priority)).onChange((v) => {
        const n = Number(v);
        if (Number.isFinite(n)) this.draft.priority = n;
      });
    });

    new Setting(contentEl).setName("Enabled").addToggle((t) => {
      t.setValue(this.draft.enabled).onChange((v) => {
        this.draft.enabled = v;
      });
    });

    this.errorEl = contentEl.createDiv({ cls: "aw-error" });

    new Setting(contentEl)
      .addButton((b) =>
        b.setButtonText("Save").setCta().onClick(() => {
          if (this.validate()) {
            this.onSave(this.draft);
            this.close();
          }
        }),
      )
      .addButton((b) => b.setButtonText("Cancel").onClick(() => this.close()));

    this.renderConditions();
    this.renderActions();
  }

  override onClose(): void {
    super.onClose();
    this.contentEl.empty();
  }

  /* ---------------- conditions ---------------- */

  private renderConditions(): void {
    this.conditionsEl.empty();
    this.conditionRows.length = 0;
    for (const condition of this.draft.conditions) {
      const row = this.conditionsEl.createDiv({ cls: "aw-row" });
      this.conditionRows.push(row);
      this.renderConditionRow(row, condition);
    }
  }

  private renderConditionRow(row: HTMLElement, condition: Condition): void {
    row.empty();
    const def = this.host.conditionRegistry.get(condition.type);

    const setting = new Setting(row);
    setting.addDropdown((d) => {
      for (const c of this.host.conditionRegistry.all()) d.addOption(c.type, c.label);
      d.setValue(condition.type);
      d.onChange((v: string) => {
        const newDef = this.host.conditionRegistry.get(v);
        const prop = newDef?.properties[0];
        condition.type = v;
        if (prop) {
          condition.property = prop.key;
          condition.operator = prop.defaultOperator;
          condition.value = prop.defaultValue;
        }
        this.renderConditions();
      });
    });
    if (!def) {
      setting.setDesc(`Unknown condition type "${condition.type}" (ignored at runtime)`);
      this.addRemoveButton(setting, () => this.removeCondition(condition));
      return;
    }

    const propDef =
      def.properties.find((p) => p.key === condition.property) ?? def.properties[0];
    if (propDef) condition.property = propDef.key;

    setting.addDropdown((d) => {
      for (const p of def.properties) d.addOption(p.key, p.label);
      d.setValue(condition.property);
      d.onChange((v: string) => {
        const p = def.properties.find((x) => x.key === v);
        condition.property = v;
        if (p) {
          condition.operator = p.defaultOperator;
          condition.value = p.defaultValue;
        }
        this.renderConditions();
      });
    });

    if (propDef) {
      setting.addDropdown((d) => {
        for (const op of propDef.operators) d.addOption(op, operatorLabel(op));
        if (!propDef.operators.includes(condition.operator)) {
          condition.operator = propDef.defaultOperator;
        }
        d.setValue(condition.operator);
        d.onChange((v: string) => {
          condition.operator = v as Operator;
        });
      });
      this.renderValueInput(setting, propDef, condition);
    }

    this.addRemoveButton(setting, () => this.removeCondition(condition));
  }

  private renderValueInput(
    setting: Setting,
    propDef: ConditionPropertyDef,
    condition: Condition,
  ): void {
    switch (propDef.kind) {
      case "boolean":
        setting.addDropdown((d) => {
          d.addOption("true", "True");
          d.addOption("false", "False");
          d.setValue(String(condition.value === true));
          d.onChange((v) => {
            condition.value = v === "true";
          });
        });
        break;
      case "enum":
        setting.addDropdown((d) => {
          for (const o of propDef.options ?? []) d.addOption(o.value, o.label);
          d.setValue(String(condition.value));
          d.onChange((v) => {
            condition.value = v;
          });
        });
        break;
      case "number":
        setting.addText((t) => {
          t.inputEl.type = "number";
          t.setValue(String(condition.value));
          t.onChange((v) => {
            const n = Number(v);
            if (v.trim() !== "" && Number.isFinite(n)) condition.value = n;
          });
        });
        break;
      default:
        setting.addText((t) => {
          t.setValue(String(condition.value));
          t.onChange((v) => {
            condition.value = v;
          });
        });
    }
  }

  private removeCondition(condition: Condition): void {
    this.draft.conditions = this.draft.conditions.filter((c) => c !== condition);
    this.renderConditions();
  }

  /* ---------------- actions ---------------- */

  private renderActions(): void {
    this.actionsEl.empty();
    this.actionRows.length = 0;
    for (const action of this.draft.actions) {
      const row = this.actionsEl.createDiv({ cls: "aw-row" });
      this.actionRows.push(row);
      this.renderActionRow(row, action);
    }
  }

  private renderActionRow(row: HTMLElement, action: Action): void {
    row.empty();
    const setting = new Setting(row);
    setting.addDropdown((d) => {
      for (const a of this.host.actionRegistry.all()) d.addOption(a.type, a.label);
      d.setValue(action.type);
      d.onChange((v: string) => {
        action.type = v;
        action.target = "";
        this.renderActions();
      });
    });

    const def = this.host.actionRegistry.get(action.type);
    if (!def) {
      setting.setDesc(`Unknown action type "${action.type}" (skipped at runtime)`);
      this.addRemoveButton(setting, () => this.removeAction(action));
      return;
    }

    if (def.targetKind === "plugin") {
      setting.addButton((b) => {
        b.setButtonText(action.target ? `Plugin: ${action.target}` : "Choose plugin…");
        b.onClick(() => {
          new PluginSuggestModal(this.app, this.host.listPlugins(), (item) => {
            action.target = item.id;
            this.renderActions();
          }).open();
        });
      });
    } else if (def.targetKind === "command") {
      setting.addButton((b) => {
        const label = action.target ? `Command: ${action.target}` : "Choose command…";
        b.setButtonText(label);
        b.onClick(() => {
          new CommandSuggestModal(this.app, this.host.listCommands(), (item) => {
            action.target = item.id;
            this.renderActions();
          }).open();
        });
      });
      setting.addDropdown((d) => {
        d.addOption("onEnter", "Run once when rule activates");
        d.addOption("onEvaluate", "Run on every matching evaluation");
        d.setValue(action.trigger === "onEvaluate" ? "onEvaluate" : "onEnter");
        d.onChange((v: string) => {
          action.trigger = v as ActionTrigger;
        });
      });
      if (action.target) {
        const cmd = this.host.listCommands().find((c) => c.id === action.target);
        if (cmd && isLikelyToggleCommand(cmd.id, cmd.name)) {
          setting.setDesc("⚠ This looks like a toggle command — prefer the default enter trigger.");
        }
      }
    }

    this.addRemoveButton(setting, () => this.removeAction(action));
  }

  private removeAction(action: Action): void {
    this.draft.actions = this.draft.actions.filter((a) => a !== action);
    this.renderActions();
  }

  /* ---------------- helpers ---------------- */

  private addRemoveButton(setting: Setting, onClick: () => void): void {
    setting.addExtraButton((b) => {
      b.setIcon("trash");
      b.setTooltip("Remove");
      b.onClick(onClick);
    });
  }

  private validate(): boolean {
    const errors: string[] = [];
    if (!this.draft.name.trim()) errors.push("Rule name is required.");
    if (this.draft.conditions.length === 0) errors.push("Add at least one condition.");
    for (const c of this.draft.conditions) {
      if (c.property === "" || c.type === "") errors.push("Every condition needs a type and property.");
    }
    for (const a of this.draft.actions) {
      if (!a.target) errors.push(`Action "${a.type}" has no target.`);
      if (
        (a.type === "enablePlugin" || a.type === "disablePlugin") &&
        a.target === PLUGIN_ID
      ) {
        errors.push("Adaptive Workspace cannot manage itself (self-protection).");
      }
    }
    if (this.draft.actions.length === 0) errors.push("Add at least one action.");
    this.errorEl.empty();
    if (errors.length > 0) {
      for (const e of errors) this.errorEl.createDiv({ text: e });
      return false;
    }
    return true;
  }
}

function defaultCondition(type: string, prop: ConditionPropertyDef): Condition {
  return {
    type,
    property: prop.key,
    operator: prop.defaultOperator,
    value: prop.defaultValue,
  };
}

function operatorLabel(op: Operator): string {
  switch (op) {
    case "equals":
      return "equals";
    case "notEquals":
      return "not equals";
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
