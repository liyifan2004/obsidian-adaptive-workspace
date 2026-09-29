import { PLUGIN_LOG_SIZE } from "../config";

export type LogLevel = "info" | "warn" | "error";

export interface LogEntry {
  time: number;
  level: LogLevel;
  message: string;
  detail?: string;
}

/** Ring-buffer log shared with the Diagnostics view. */
export class PluginLog {
  private entries: LogEntry[] = [];

  constructor(private readonly max: number = PLUGIN_LOG_SIZE) {}

  add(level: LogLevel, message: string, detail?: string): void {
    this.entries.push({ time: Date.now(), level, message, detail });
    if (this.entries.length > this.max) {
      this.entries.splice(0, this.entries.length - this.max);
    }
  }

  info(message: string, detail?: string): void {
    this.add("info", message, detail);
  }

  warn(message: string, detail?: string): void {
    this.add("warn", message, detail);
  }

  error(message: string, detail?: string): void {
    this.add("error", message, detail);
  }

  getEntries(): readonly LogEntry[] {
    return this.entries;
  }

  clear(): void {
    this.entries = [];
  }
}
