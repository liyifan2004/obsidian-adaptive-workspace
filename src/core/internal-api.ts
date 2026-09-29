import type { App } from "obsidian";
import type { ApiProbe, CapabilityTier, Rect } from "../types/environment";

/**
 * Single point of access for ALL undocumented Obsidian / Electron APIs.
 * Business code must never touch `app.plugins`, `app.commands` or
 * `electron.remote` directly — everything goes through this adapter
 * (see docs/adr/0003).
 *
 * Shapes below are minimal structural types for exactly what we use.
 * They are verified against @obsidian-typings/obsidian-public-latest
 * and against the real app bundle (Obsidian 1.13.4 / Electron 28 /
 * @electron/remote 2.1.3).
 */

export interface ElectronDisplayLike {
  id: number;
  label?: string;
  bounds: Rect;
  workArea?: Rect;
  size: { width: number; height: number };
  scaleFactor: number;
  internal?: boolean;
  rotation?: number;
}

export interface ElectronScreenLike {
  getAllDisplays(): ElectronDisplayLike[];
  getPrimaryDisplay(): ElectronDisplayLike;
  getDisplayMatching(rect: Rect): ElectronDisplayLike;
  on(event: string, listener: (...args: unknown[]) => void): unknown;
  removeListener(event: string, listener: (...args: unknown[]) => void): unknown;
}

export interface ElectronBrowserWindowLike {
  getBounds(): Rect;
  isMaximized(): boolean;
  isFullScreen(): boolean;
  isMinimized(): boolean;
  isNormal?(): boolean;
  on(event: string, listener: (...args: unknown[]) => void): unknown;
  removeListener(event: string, listener: (...args: unknown[]) => void): unknown;
}

interface RemoteLike {
  getCurrentWindow(): ElectronBrowserWindowLike;
  screen: ElectronScreenLike;
}

export interface PluginManifestLike {
  id: string;
  name: string;
  description?: string;
}

interface PluginsLike {
  manifests?: Record<string, PluginManifestLike>;
  plugins?: Record<string, unknown>;
  enabledPlugins?: { has(id: string): boolean } | string[];
  enablePluginAndSave?(id: string): unknown;
  disablePluginAndSave?(id: string): unknown;
}

export interface CommandLike {
  id: string;
  name: string;
}

interface CommandsLike {
  listCommands?(): CommandLike[];
  commands?: Record<string, CommandLike>;
  executeCommandById?(id: string): boolean | void;
}

interface AppInternals {
  plugins?: PluginsLike;
  commands?: CommandsLike;
}

interface WindowWithElectron {
  electron?: { remote?: RemoteLike };
  require?: (id: string) => unknown;
}

function findRemote(): { remote: RemoteLike | null; via: string } {
  const w = window as unknown as WindowWithElectron;
  const direct = w.electron?.remote;
  if (direct && typeof direct.getCurrentWindow === "function" && direct.screen) {
    return { remote: direct, via: "window.electron.remote" };
  }
  if (typeof w.require === "function") {
    try {
      const electron = w.require("electron") as { remote?: RemoteLike } | undefined;
      const r = electron?.remote;
      if (r && typeof r.getCurrentWindow === "function" && r.screen) {
        return { remote: r, via: "require('electron').remote" };
      }
    } catch {
      /* fall through */
    }
    try {
      const r = w.require("@electron/remote") as RemoteLike | undefined;
      if (r && typeof r.getCurrentWindow === "function" && r.screen) {
        return { remote: r, via: "require('@electron/remote')" };
      }
    } catch {
      /* fall through */
    }
  }
  return { remote: null, via: "none" };
}

export interface WindowStateSnapshot {
  maximized: boolean;
  fullscreen: boolean;
  minimized: boolean;
}

export interface WindowEventHandlers {
  /** Geometry changed (resize / move). */
  onGeometry: () => void;
  /** Discrete state change (maximize / fullscreen / minimize). */
  onStateChange: () => void;
}

export interface DisplayEventHandlers {
  onDisplayChange: () => void;
}

/** DOM-only fallback data source when remote is unavailable. */
interface DomScreenLike {
  width: number;
  height: number;
  availLeft: number;
  availTop: number;
  availWidth: number;
  availHeight: number;
}

export class InternalApi {
  private readonly remote: RemoteLike | null = null;
  private readonly remoteVia: string;
  private readonly appInternals: AppInternals;
  private readonly notes: string[] = [];
  private readonly browserWindow: ElectronBrowserWindowLike | null = null;
  private probeCache: ApiProbe | null = null;

  constructor(app: App) {
    this.appInternals = app as unknown as AppInternals;
    const found = findRemote();
    this.remote = found.remote;
    this.remoteVia = found.via;
    if (this.remote) {
      try {
        this.browserWindow = this.remote.getCurrentWindow();
      } catch (e) {
        this.notes.push(`getCurrentWindow() failed: ${String(e)}`);
        this.browserWindow = null;
      }
      if (!this.browserWindow) this.notes.push("BrowserWindow unavailable; using DOM fallback");
    } else {
      this.notes.push("electron remote unavailable; using DOM fallback (degraded)");
    }
  }

  /* ---------------- capability probing ---------------- */

  probe(): ApiProbe {
    if (this.probeCache) return this.probeCache;
    const plugins = this.appInternals.plugins;
    const commands = this.appInternals.commands;
    const hasPlugins =
      !!plugins &&
      typeof plugins.enablePluginAndSave === "function" &&
      typeof plugins.disablePluginAndSave === "function";
    const hasCommands = !!commands && typeof commands.executeCommandById === "function";
    if (!hasPlugins) this.notes.push("app.plugins API incomplete: plugin state actions disabled");
    if (!hasCommands) this.notes.push("app.commands API incomplete: command actions disabled");
    const probe: ApiProbe = {
      remote: this.remote !== null,
      screen: this.remote !== null,
      browserWindow: this.browserWindow !== null,
      plugins: hasPlugins,
      commands: hasCommands,
      via: this.remoteVia,
      notes: [...this.notes],
    };
    this.probeCache = probe;
    return probe;
  }

  capabilityTier(): CapabilityTier {
    const p = this.probe();
    if (p.remote && p.plugins && p.commands) return "full";
    if (!p.remote) return "degraded";
    return "limited";
  }

  /* ---------------- displays ---------------- */

  getDisplays(): ElectronDisplayLike[] {
    if (this.remote) {
      try {
        return this.remote.screen.getAllDisplays();
      } catch (e) {
        this.notes.push(`getAllDisplays() failed: ${String(e)}`);
      }
    }
    return this.domDisplays();
  }

  getPrimaryDisplay(): ElectronDisplayLike | null {
    if (this.remote) {
      try {
        return this.remote.screen.getPrimaryDisplay();
      } catch {
        /* fall through */
      }
    }
    return this.domDisplays()[0] ?? null;
  }

  /** Electron's own matcher, used as a cross-check in Diagnostics. */
  getDisplayMatching(rect: Rect): ElectronDisplayLike | null {
    if (!this.remote) return null;
    try {
      return this.remote.screen.getDisplayMatching(rect);
    } catch {
      return null;
    }
  }

  private domDisplays(): ElectronDisplayLike[] {
    const s = window.screen as unknown as DomScreenLike;
    return [
      {
        id: 0,
        label: "DOM screen",
        bounds: {
          x: s.availLeft ?? 0,
          y: s.availTop ?? 0,
          width: s.width ?? 0,
          height: s.height ?? 0,
        },
        workArea: {
          x: s.availLeft ?? 0,
          y: s.availTop ?? 0,
          width: s.availWidth ?? 0,
          height: s.availHeight ?? 0,
        },
        size: { width: s.width ?? 0, height: s.height ?? 0 },
        scaleFactor: window.devicePixelRatio || 1,
        internal: undefined,
      },
    ];
  }

  /* ---------------- window ---------------- */

  isRemoteAvailable(): boolean {
    return this.remote !== null && this.browserWindow !== null;
  }

  getWindowBounds(): Rect {
    if (this.browserWindow) {
      try {
        return this.browserWindow.getBounds();
      } catch {
        /* fall through */
      }
    }
    return {
      x: window.screenX,
      y: window.screenY,
      width: window.outerWidth,
      height: window.outerHeight,
    };
  }

  getWindowState(): WindowStateSnapshot {
    if (this.browserWindow) {
      try {
        return {
          maximized: this.browserWindow.isMaximized(),
          fullscreen: this.browserWindow.isFullScreen(),
          minimized: this.browserWindow.isMinimized(),
        };
      } catch {
        /* fall through */
      }
    }
    // DOM fallback: approximate. Native fullscreen is NOT detectable here.
    const s = window.screen as unknown as DomScreenLike;
    const near = (a: number, b: number) => Math.abs(a - b) <= 4;
    const maximized =
      near(window.outerWidth, s.availWidth ?? 0) && near(window.outerHeight, s.availHeight ?? 0);
    const fullscreen =
      typeof document !== "undefined" && document.fullscreenElement !== null;
    return { maximized, fullscreen, minimized: false };
  }

  subscribeWindowEvents(handlers: WindowEventHandlers): () => void {
    const cleanups: Array<() => void> = [];
    const win = this.browserWindow;
    if (win) {
      const geometryEvents = ["resize", "move"];
      const stateEvents = [
        "maximize",
        "unmaximize",
        "minimize",
        "restore",
        "enter-full-screen",
        "leave-full-screen",
      ];
      for (const ev of geometryEvents) {
        const listener = () => handlers.onGeometry();
        win.on(ev, listener);
        cleanups.push(() => {
          try {
            win.removeListener(ev, listener);
          } catch {
            /* window may be destroyed */
          }
        });
      }
      for (const ev of stateEvents) {
        const listener = () => handlers.onStateChange();
        win.on(ev, listener);
        cleanups.push(() => {
          try {
            win.removeListener(ev, listener);
          } catch {
            /* window may be destroyed */
          }
        });
      }
    }
    // DOM-level fallbacks / supplements.
    const onResize = () => handlers.onGeometry();
    window.addEventListener("resize", onResize);
    cleanups.push(() => window.removeEventListener("resize", onResize));
    const onFullscreen = () => handlers.onStateChange();
    document.addEventListener("fullscreenchange", onFullscreen);
    cleanups.push(() => document.removeEventListener("fullscreenchange", onFullscreen));
    return () => cleanups.forEach((fn) => fn());
  }

  subscribeDisplayEvents(handlers: DisplayEventHandlers): () => void {
    if (!this.remote) return () => undefined;
    const screen = this.remote.screen;
    const events = ["display-added", "display-removed", "display-metrics-changed"];
    const listeners = events.map((ev) => {
      const listener = () => handlers.onDisplayChange();
      screen.on(ev, listener);
      return { ev, listener };
    });
    return () => {
      for (const { ev, listener } of listeners) {
        try {
          screen.removeListener(ev, listener);
        } catch {
          /* ignore */
        }
      }
    };
  }

  /* ---------------- plugin management ---------------- */

  listInstalledPlugins(): PluginManifestLike[] {
    const manifests = this.appInternals.plugins?.manifests;
    if (!manifests) return [];
    return Object.values(manifests);
  }

  getManifest(pluginId: string): PluginManifestLike | null {
    const manifests = this.appInternals.plugins?.manifests;
    return manifests?.[pluginId] ?? null;
  }

  /** Enabled = in the persisted enabled set (authoritative per ADR 0005). */
  isPluginEnabled(pluginId: string): boolean {
    const p = this.appInternals.plugins;
    if (!p) return false;
    const set = p.enabledPlugins;
    if (set) {
      if (Array.isArray(set)) return set.includes(pluginId);
      if (typeof set.has === "function") return set.has(pluginId);
    }
    // Fallback: running instance implies enabled.
    return p.plugins ? pluginId in p.plugins : false;
  }

  isPluginLoaded(pluginId: string): boolean {
    const plugins = this.appInternals.plugins?.plugins;
    return plugins ? pluginId in plugins : false;
  }

  enablePluginAndSave(pluginId: string): void {
    this.appInternals.plugins?.enablePluginAndSave?.(pluginId);
  }

  disablePluginAndSave(pluginId: string): void {
    this.appInternals.plugins?.disablePluginAndSave?.(pluginId);
  }

  /* ---------------- commands ---------------- */

  listCommands(): CommandLike[] {
    const c = this.appInternals.commands;
    if (!c) return [];
    if (typeof c.listCommands === "function") {
      try {
        return c.listCommands();
      } catch {
        /* fall through to record */
      }
    }
    return c.commands ? Object.values(c.commands) : [];
  }

  executeCommandById(commandId: string): boolean {
    const c = this.appInternals.commands;
    if (!c || typeof c.executeCommandById !== "function") return false;
    const result = c.executeCommandById(commandId);
    return result !== false;
  }
}
