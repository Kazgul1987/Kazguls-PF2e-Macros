if (globalThis.kazgulsPf2e?.quickDamagePrompt) {
  globalThis.kazgulsPf2e.quickDamagePrompt();
} else {
  ui.notifications?.warn?.("Quick damage prompt is not available. Ensure the module is active.");
}
