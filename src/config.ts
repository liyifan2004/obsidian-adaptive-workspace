/** Plugin id — must match manifest.json. Also used for self-protection. */
export const PLUGIN_ID = "adaptive-workspace";

/** Debounce for high-frequency window events (resize / move), in milliseconds. */
export const EVALUATE_DEBOUNCE_MS = 300;

/** How many evaluate records the diagnostics log keeps. */
export const EVALUATE_LOG_SIZE = 50;

/** How many general log entries are kept. */
export const PLUGIN_LOG_SIZE = 200;

/** View type of the diagnostics side panel. */
export const VIEW_TYPE_DIAGNOSTICS = "adaptive-workspace-diagnostics";

/**
 * A window is considered "spanning" when the second-largest display
 * intersection exceeds this fraction of the window area.
 */
export const SPANNING_RATIO_THRESHOLD = 0.1;
