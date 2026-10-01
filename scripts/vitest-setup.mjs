// Test-only shim: plugin code uses window.setTimeout (popout-window safe);
// in the Node test environment there is no window, so alias it to globalThis.
globalThis.window ??= globalThis;
