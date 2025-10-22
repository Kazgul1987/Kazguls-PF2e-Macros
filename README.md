# Kazguls-PF2e-Macros

This Foundry VTT module collects utility macros for the Pathfinder Second Edition system. The macros are available both as script files and bundled in an in-module compendium so you can drag them directly into your world.

## Available Macros

- **Pick a Lock** – Provides an interactive dialog for selecting a skill and rolling to pick a lock, including support for lore skills and inline check requests.
- **Quick Prompt** – Opens a lightweight prompt for rolling damage or posting checks with PF2e damage type tags and sends the result straight to chat.

## Using the Compendium

After installing or updating the module, open the **Kazgul's PF2e Macros** compendium found under the Macro tab in the Compendium Browser. Drag the desired macro into your hotbar or macro directory to import it into your world.

## Quick Prompt

Press **Ctrl+Shift+D** (configurable from the Foundry keybindings settings under "Quick Prompt") or run the bundled macro to open the quick prompt. Enter a roll formula followed by one of the supported damage codes and press <kbd>Enter</kbd> to execute the roll. The prompt stays open so you can queue up additional rolls or post checks; press <kbd>Esc</kbd> to close it.

Commonly used aliases include:

| Code | Damage Type |
|------|-------------|
| `fir`, `fire` | Fire |
| `col`, `cold` | Cold |
| `ele`, `elec` | Electricity |
| `aci` | Acid |
| `poi` | Poison |
| `blu` | Bludgeoning |
| `pie` | Piercing |
| `sla` | Slashing |
| `son` | Sonic |
| `neg`, `pos` | Negative, Positive |

Any recognized code will append the appropriate damage tag (for example, `3d6+4 fir` becomes `3d6+4[fire]`) before rolling and posting the result to chat.
