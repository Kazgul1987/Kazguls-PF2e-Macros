const prompt =
  globalThis.kazgulsPf2e?.quickPrompt ?? globalThis.kazgulsPf2e?.quickDamagePrompt;

if (prompt) {
  prompt();
} else {
  ui.notifications?.warn?.(
    "Quick roller prompt is not available. Ensure Kazgul's PF2e Macros module is active."
  );
}
