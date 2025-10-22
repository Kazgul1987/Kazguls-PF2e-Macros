const MODULE_ID = "kazguls-pf2e-macros";

const DAMAGE_TYPES = {
  acid: "Acid",
  bleed: "Bleed",
  bludgeoning: "Bludgeoning",
  cold: "Cold",
  electricity: "Electricity",
  fire: "Fire",
  force: "Force",
  mental: "Mental",
  negative: "Negative",
  piercing: "Piercing",
  poison: "Poison",
  positive: "Positive",
  spirit: "Spirit",
  slashing: "Slashing",
  sonic: "Sonic",
  vitality: "Vitality",
  void: "Void",
};

const DAMAGE_ALIASES = {
  aci: "acid",
  acid: "acid",
  ble: "bleed",
  bleed: "bleed",
  blu: "bludgeoning",
  bludgeoning: "bludgeoning",
  col: "cold",
  cold: "cold",
  ele: "electricity",
  elec: "electricity",
  electricity: "electricity",
  fir: "fire",
  fire: "fire",
  for: "force",
  force: "force",
  men: "mental",
  mental: "mental",
  neg: "negative",
  negative: "negative",
  pie: "piercing",
  piercing: "piercing",
  poi: "poison",
  poison: "poison",
  pos: "positive",
  positive: "positive",
  spi: "spirit",
  spirit: "spirit",
  sla: "slashing",
  slashing: "slashing",
  son: "sonic",
  sonic: "sonic",
  vit: "vitality",
  vitality: "vitality",
  voi: "void",
  void: "void",
};

let activePrompt = null;

const getDamageLabel = (type) => {
  const label = DAMAGE_TYPES[type];
  if (label) return label;
  if (typeof type !== "string" || !type) return "";
  return type.replace(/\b\w/g, (char) => char.toUpperCase());
};

const focusPromptInput = (dialog) => {
  if (!dialog?.rendered) return;
  const element = dialog.element?.[0];
  if (!element) return;
  const input = element.querySelector('input[name="damage-formula"]');
  if (input) {
    input.focus();
    input.select?.();
  }
};

const parseDamageInput = (rawInput) => {
  const trimmed = rawInput?.trim();
  if (!trimmed) {
    return { error: "Please enter a damage formula with a damage type." };
  }

  const aliasMatch = trimmed.match(/([A-Za-z]+)$/);
  if (!aliasMatch) {
    return { error: "No damage type found. Append a damage type code such as 'fir'." };
  }

  const alias = aliasMatch[1].toLowerCase();
  const damageType = DAMAGE_ALIASES[alias];
  if (!damageType) {
    return { error: `Unknown damage type code: ${alias}.` };
  }

  const formulaPart = trimmed.slice(0, trimmed.length - alias.length).trim();
  if (!formulaPart) {
    return { error: "Damage formula is missing." };
  }

  const formulaWithType = `${formulaPart}[${damageType}]`;
  const damageLabel = getDamageLabel(damageType);

  return {
    formula: formulaPart,
    formulaWithType,
    damageType,
    damageLabel,
  };
};

const executeDamageRoll = async (rawInput, dialog) => {
  const parsed = parseDamageInput(rawInput);
  if (parsed.error) {
    ui.notifications?.warn?.(parsed.error);
    return false;
  }

  let roll;
  try {
    roll = await new Roll(parsed.formulaWithType).evaluate({ async: true });
  } catch (error) {
    console.error(`${MODULE_ID} | Failed to evaluate roll`, error);
    ui.notifications?.error?.("Failed to evaluate the damage roll. Check your formula.");
    return false;
  }

  const flavor = `Quick Damage (${parsed.damageLabel})`;

  try {
    await roll.toMessage({
      flavor,
      speaker: globalThis.ChatMessage?.getSpeaker?.() ?? undefined,
    });
  } catch (error) {
    console.error(`${MODULE_ID} | Failed to post roll message`, error);
    ui.notifications?.error?.("Failed to post the damage roll to chat.");
    return false;
  }

  if (dialog) focusPromptInput(dialog);
  return true;
};

function openQuickDamagePrompt() {
  if (activePrompt?.rendered) {
    activePrompt.bringToTop?.();
    focusPromptInput(activePrompt);
    return activePrompt;
  }

  const id = `${MODULE_ID}-quick-damage-prompt`;
  const dialog = new Dialog(
    {
      title: "Quick Damage Roller",
      content: `
        <form class="quick-damage-roller" autocomplete="off">
          <div class="form-group">
            <label for="quick-damage-input">Damage</label>
            <input id="quick-damage-input" type="text" name="damage-formula" placeholder="3d6+4 fir" autofocus />
          </div>
        </form>
      `,
      buttons: {},
      close: () => {
        activePrompt = null;
      },
      render: (html) => {
        const element = html?.[0];
        const input = element?.querySelector('input[name="damage-formula"]');
        if (!input) return;

        const handleSubmit = async () => {
          const success = await executeDamageRoll(input.value, dialog);
          if (success) {
            input.select();
          }
        };

        input.addEventListener("keydown", (event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            event.stopPropagation();
            handleSubmit();
          } else if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            dialog.close();
          }
        });

        focusPromptInput(dialog);
      },
    },
    {
      id,
      width: 280,
      height: "auto",
      popOut: true,
      resizable: false,
    }
  );

  dialog.render(true);
  activePrompt = dialog;
  return dialog;
}

globalThis.kazgulsPf2e = globalThis.kazgulsPf2e ?? {};
globalThis.kazgulsPf2e.quickDamagePrompt = globalThis.kazgulsPf2e.quickDamagePrompt ?? openQuickDamagePrompt;

Hooks.once("init", () => {
  try {
    game.keybindings?.register?.(MODULE_ID, "quickDamagePrompt", {
      name: "Quick Damage Prompt",
      hint: "Open the quick damage roller dialog.",
      editable: [
        {
          key: "KeyD",
          modifiers: ["CONTROL", "SHIFT"],
        },
      ],
      restricted: false,
      onDown: () => {
        openQuickDamagePrompt();
        return true;
      },
    });
  } catch (error) {
    console.error(`${MODULE_ID} | Failed to register keybinding`, error);
  }

  globalThis.kazgulsPf2e = globalThis.kazgulsPf2e ?? {};
  globalThis.kazgulsPf2e.quickDamagePrompt = openQuickDamagePrompt;
});
