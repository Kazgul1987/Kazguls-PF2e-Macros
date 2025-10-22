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

const STATISTIC_ALIASES = {
  acr: "acrobatics",
  acrobatics: "acrobatics",
  arc: "arcana",
  arcana: "arcana",
  ath: "athletics",
  athletics: "athletics",
  cra: "crafting",
  crafting: "crafting",
  dec: "deception",
  deception: "deception",
  dip: "diplomacy",
  diplomacy: "diplomacy",
  for: "fortitude",
  fort: "fortitude",
  fortitude: "fortitude",
  int: "intimidation",
  intimidation: "intimidation",
  med: "medicine",
  medicine: "medicine",
  nat: "nature",
  nature: "nature",
  occ: "occultism",
  occultism: "occultism",
  per: "performance",
  performance: "performance",
  perc: "perception",
  perception: "perception",
  rel: "religion",
  religion: "religion",
  soc: "society",
  society: "society",
  ste: "stealth",
  stealth: "stealth",
  sur: "survival",
  survival: "survival",
  thi: "thievery",
  thievery: "thievery",
  wil: "will",
  will: "will",
  ref: "reflex",
  reflex: "reflex",
};

const STATISTIC_LABELS = {
  acrobatics: "Acrobatics",
  arcana: "Arcana",
  athletics: "Athletics",
  crafting: "Crafting",
  deception: "Deception",
  diplomacy: "Diplomacy",
  fortitude: "Fortitude",
  intimidation: "Intimidation",
  medicine: "Medicine",
  nature: "Nature",
  occultism: "Occultism",
  performance: "Performance",
  perception: "Perception",
  reflex: "Reflex",
  religion: "Religion",
  society: "Society",
  stealth: "Stealth",
  survival: "Survival",
  thievery: "Thievery",
  will: "Will",
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

const getStatisticLabel = (statistic) => {
  const label = STATISTIC_LABELS[statistic];
  if (label) return label;
  if (typeof statistic !== "string" || !statistic) return "";
  return statistic.replace(/\b\w/g, (char) => char.toUpperCase());
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

const parseCheckInput = (rawInput) => {
  const trimmed = rawInput?.trim();
  if (!trimmed) {
    return { error: "Please enter a skill or save to roll." };
  }

  const match = trimmed.match(/^([A-Za-z]+)\s*(?:[,\s]+(\d+))?$/);
  if (!match) {
    return {
      error: "Invalid check input. Use formats like 'perc' or 'perc 19'.",
    };
  }

  const alias = match[1].toLowerCase();
  const statistic = STATISTIC_ALIASES[alias];
  if (!statistic) {
    return { error: `Unknown skill or save code: ${alias}.` };
  }

  const dc = match[2] ? Number.parseInt(match[2], 10) : null;
  if (Number.isNaN(dc)) {
    return { error: "DC must be a number." };
  }

  return {
    statistic,
    label: getStatisticLabel(statistic),
    dc,
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

const postCheckToChat = async ({ statistic, dc, label }) => {
  const dcPart = typeof dc === "number" ? `|dc:${dc}` : "";
  const link = `@Check[${statistic}${dcPart}]`;
  const content = `Quick Check (${label}) ${link}`;

  try {
    await globalThis.ChatMessage?.create?.({ content });
  } catch (error) {
    console.error(`${MODULE_ID} | Failed to create check message`, error);
    ui.notifications?.error?.("Failed to post the check to chat.");
    return false;
  }

  return true;
};

const executeCheck = async (rawInput, dialog) => {
  const parsed = parseCheckInput(rawInput);
  if (parsed.error) {
    ui.notifications?.warn?.(parsed.error);
    return false;
  }

  const success = await postCheckToChat(parsed);
  if (!success) return false;

  if (dialog) focusPromptInput(dialog);
  return true;
};

const dispatchInput = (rawInput, dialog) => {
  const trimmed = rawInput?.trim();
  if (!trimmed) {
    ui.notifications?.warn?.("Please enter a value to roll.");
    return Promise.resolve(false);
  }

  if (/^\d/.test(trimmed)) {
    return executeDamageRoll(trimmed, dialog);
  }

  if (/^[A-Za-z]/.test(trimmed)) {
    return executeCheck(trimmed, dialog);
  }

  ui.notifications?.warn?.("Unrecognized input. Begin with a formula or skill.");
  return Promise.resolve(false);
};

function openQuickPrompt() {
  if (activePrompt?.rendered) {
    activePrompt.bringToTop?.();
    focusPromptInput(activePrompt);
    return activePrompt;
  }

  const id = `${MODULE_ID}-quick-prompt`;
  const dialog = new Dialog(
    {
      title: "Quick Prompt",
      content: `
        <form class="quick-damage-roller" autocomplete="off">
          <div class="form-group">
            <label for="quick-damage-input">Roll Damage or Check</label>
            <input id="quick-damage-input" type="text" name="damage-formula" placeholder="3d6+4 fir  |  perc, 19" autofocus />
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
          const success = await dispatchInput(input.value, dialog);
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
globalThis.kazgulsPf2e.quickPrompt = globalThis.kazgulsPf2e.quickPrompt ?? openQuickPrompt;
globalThis.kazgulsPf2e.quickDamagePrompt =
  globalThis.kazgulsPf2e.quickDamagePrompt ?? openQuickPrompt;

Hooks.once("init", () => {
  try {
    game.keybindings?.register?.(MODULE_ID, "quickPrompt", {
      name: "Quick Prompt",
      hint: "Open the quick prompt dialog.",
      editable: [
        {
          key: "KeyD",
          modifiers: ["CONTROL", "SHIFT"],
        },
      ],
      restricted: false,
      onDown: () => {
        openQuickPrompt();
        return true;
      },
    });

    game.keybindings?.register?.(MODULE_ID, "openCheckPrompt", {
      name: "GM Check Prompt",
      hint: "Open the GM check prompt dialog.",
      editable: [
        {
          key: "KeyC",
          modifiers: ["ALT"],
        },
      ],
      restricted: true,
      onDown: () => {
        game.pf2e?.gm?.checkPrompt?.();
        return true;
      },
    });
  } catch (error) {
    console.error(`${MODULE_ID} | Failed to register keybinding`, error);
  }

  globalThis.kazgulsPf2e = globalThis.kazgulsPf2e ?? {};
  globalThis.kazgulsPf2e.quickPrompt = openQuickPrompt;
  globalThis.kazgulsPf2e.quickDamagePrompt = openQuickPrompt;
});
