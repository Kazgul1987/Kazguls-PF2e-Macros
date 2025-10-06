const PICK_A_LOCK_TEMPLATE = "modules/kazguls-pf2e-macros/templates/pick-a-lock.hbs";

let SKILL_MOD = 0;

const LOCK_TYPES = [
  {
    key: "custom",
    name: "Custom",
    level: null,
    dc: "",
    requiredSuccesses: 1,
    intervalMinutes: 2,
    maxAttempts: 0,
    criticalFailureBreaks: false,
    sneakyKey: false,
    silentMode: false,
  },
  {
    key: "poor",
    name: "Poor",
    level: 0,
    dc: 14,
    requiredSuccesses: 1,
    intervalMinutes: 2,
    maxAttempts: 0,
    criticalFailureBreaks: false,
    sneakyKey: false,
    silentMode: false,
  },
  {
    key: "average",
    name: "Average",
    level: 1,
    dc: 15,
    requiredSuccesses: 1,
    intervalMinutes: 2,
    maxAttempts: 0,
    criticalFailureBreaks: false,
    sneakyKey: false,
    silentMode: false,
  },
  {
    key: "good",
    name: "Good",
    level: 5,
    dc: 20,
    requiredSuccesses: 2,
    intervalMinutes: 10,
    maxAttempts: 0,
    criticalFailureBreaks: true,
    sneakyKey: false,
    silentMode: false,
  },
  {
    key: "superior",
    name: "Superior",
    level: 10,
    dc: 28,
    requiredSuccesses: 3,
    intervalMinutes: 10,
    maxAttempts: 0,
    criticalFailureBreaks: true,
    sneakyKey: true,
    silentMode: false,
  },
  {
    key: "incredible",
    name: "Incredible",
    level: 15,
    dc: 34,
    requiredSuccesses: 3,
    intervalMinutes: 10,
    maxAttempts: 0,
    criticalFailureBreaks: true,
    sneakyKey: true,
    silentMode: true,
  },
];

const DEFAULT_LOCK_KEY = "poor";

const FALLBACK_MODIFIER_TYPES = [
  { value: "circumstance", label: "Circumstance" },
  { value: "status", label: "Status" },
  { value: "item", label: "Item" },
  { value: "untyped", label: "Untyped" },
];

function localize(key, fallback) {
  const localized = game.i18n?.localize?.(key);
  if (localized && localized !== key) return localized;
  return fallback ?? key;
}

function getModifierTypes() {
  const types = CONFIG?.PF2E?.modifierTypes;
  if (types && typeof types === "object") {
    const entries = Object.entries(types)
      .filter(([value]) => typeof value === "string" && value.length)
      .map(([value, label]) => ({ value, label }));
    if (entries.length) return entries;
  }
  return FALLBACK_MODIFIER_TYPES;
}

function getLockType(key) {
  return LOCK_TYPES.find((lock) => lock.key === key) ?? LOCK_TYPES[0];
}

function formatLockLabel(lock) {
  const name = localize(`PF2E.Lock.${lock.name}`, lock.name);
  if (typeof lock.level === "number") {
    const levelLabel = localize("PF2E.LevelLabel", "level");
    return `${name} (${levelLabel} ${lock.level})`;
  }
  return name;
}

function getLockOptions() {
  return LOCK_TYPES.map((lock) => ({
    key: lock.key,
    label: formatLockLabel(lock),
    ...lock,
  }));
}

function parseNullableNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function getSkillMod(actor, skillSlug) {
  if (!actor) return 0;

  const system = actor.system ?? {};
  const skills = system.skills ?? {};
  const lore = (system.customModifiers ?? {}).lore ?? {};

  if (skillSlug.startsWith("lore-")) {
    const loreKey = skillSlug.slice(5);
    return Number(lore[loreKey]?.totalModifier ?? 0);
  }

  const skillData = skills?.[skillSlug];
  if (!skillData) return 0;

  const modifiers = skillData?.modifiers;
  if (Array.isArray(modifiers)) {
    const total = modifiers.reduce((sum, modifier) => {
      if (!modifier?.enabled) return sum;
      return sum + Number(modifier.value ?? 0);
    }, 0);
    return Number(total);
  }

  if (typeof skillData.totalModifier === "number") return skillData.totalModifier;
  if (typeof skillData.value === "number") return skillData.value;
  if (typeof skillData.mod === "number") return skillData.mod;

  return Number(skillData) || 0;
}

function getSkillOptions(actor) {
  const system = actor?.system ?? {};
  const skills = system.skills ?? {};
  const options = Object.entries(skills).map(([key, value]) => ({
    slug: key,
    label: game.i18n?.localize?.(value?.label) ?? value?.label ?? key,
  }));

  const lores = system.lores ?? {};
  const loreOptions = Object.entries(lores).map(([key, value]) => ({
    slug: `lore-${key}`,
    label: value.label ?? game.i18n?.localize?.("PF2E.Lore") ?? key,
  }));

  return [...options, ...loreOptions].sort((a, b) => a.label.localeCompare(b.label));
}

async function renderPickLockDialog(actor) {
  const skills = getSkillOptions(actor);
  const selectedSkill = skills.find((skill) => skill.slug === "thievery")?.slug ?? skills.at(0)?.slug ?? "thievery";
  const initialMod = getSkillMod(actor, selectedSkill);

  SKILL_MOD = initialMod;

  const lockOptions = getLockOptions();
  const initialLock = { ...getLockType(DEFAULT_LOCK_KEY) };

  const templateData = {
    skills,
    selectedSkill,
    skillMod: initialMod,
    actorName: actor?.name ?? "",
    actorLabel: localize("PF2E.Actor", "Actor"),
    additionalBonusesLabel: localize("PF2E.AdditionalBonuses", "Additional bonuses"),
    addBonusLabel: localize("PF2E.AddBonus", "Add bonus"),
    lockTypeLabel: localize("PF2E.LockType", "Lock type"),
    requiredSuccessesLabel: localize("PF2E.Check.RequiredSuccesses", "Required successes"),
    minutesPerAttemptLabel: localize("PF2E.MinutesPerAttempt", "Minutes per attempt"),
    maxAttemptsLabel: localize("PF2E.MaxAttempts", "Maximum attempts"),
    criticalFailureLabel: localize("PF2E.CriticalFailureStops", "Critical failure ends attempt?"),
    sneakyKeyLabel: localize("PF2E.SneakyKey", "Sneaky Key active?"),
    silentModeLabel: localize("PF2E.SilentMode", "Silent mode?"),
    bonusLabelPlaceholder: localize("PF2E.ModifierLabel", "Label"),
    lockTypes: lockOptions,
    initialLock,
  };

  const content = await renderTemplate(PICK_A_LOCK_TEMPLATE, templateData);

  return new Promise((resolve, reject) => {
    const dialog = new Dialog({
      title: game.i18n?.localize?.("PF2E.Actions.PickALock") ?? "Pick a Lock",
      content,
      render: (html) => {
        const form = html[0]?.querySelector?.("form");
        if (!form) return;

        const skillSelect = form.querySelector("[name=skill]");
        const skillModField = form.querySelector("[name=skillMod]");
        const bonusList = form.querySelector("[data-bonus-list]");
        const addBonusButton = form.querySelector("[data-add-bonus]");
        const bonusPlaceholder = bonusList?.dataset?.bonusPlaceholder ?? localize("PF2E.ModifierLabel", "Label");
        const lockSelect = form.querySelector("[name=lockType]");
        const dcField = form.querySelector("[name=dc]");
        const successesField = form.querySelector("[name=requiredSuccesses]");
        const intervalField = form.querySelector("[name=intervalMinutes]");
        const maxAttemptsField = form.querySelector("[name=maxAttempts]");
        const criticalFailureField = form.querySelector("[name=criticalFailureBreaks]");
        const sneakyKeyField = form.querySelector("[name=sneakyKey]");
        const silentModeField = form.querySelector("[name=silentMode]");

        let baseSkillMod = initialMod;

        const getBonusTotal = () => {
          if (!bonusList) return 0;
          return Array.from(bonusList.querySelectorAll("[data-bonus-row]"))
            .map((row) => Number(row.querySelector("[data-bonus-value]")?.value ?? 0))
            .reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0);
        };

        const updateSkillModDisplay = () => {
          const total = baseSkillMod + getBonusTotal();
          if (skillModField) {
            skillModField.value = total;
          }
          SKILL_MOD = total;
        };

        const modifierTypes = getModifierTypes();

        const createBonusRow = (bonus = {}) => {
          if (!bonusList) return;

          const row = document.createElement("div");
          row.classList.add("bonus-row");
          row.dataset.bonusRow = "";

          const valueInput = document.createElement("input");
          valueInput.type = "number";
          valueInput.step = "1";
          valueInput.dataset.bonusValue = "";
          valueInput.value = Number(bonus.value ?? 0) || 0;
          valueInput.addEventListener("input", () => updateSkillModDisplay());

          const typeSelect = document.createElement("select");
          typeSelect.dataset.bonusType = "";
          modifierTypes.forEach((type) => {
            const option = document.createElement("option");
            option.value = type.value;
            option.textContent = type.label;
            typeSelect.appendChild(option);
          });
          const typeValues = modifierTypes.map((type) => type.value);
          const preferredType = typeValues.includes(bonus.type) ? bonus.type : modifierTypes[0]?.value ?? "untyped";
          typeSelect.value = preferredType;

          const labelInput = document.createElement("input");
          labelInput.type = "text";
          labelInput.dataset.bonusLabel = "";
          labelInput.placeholder = bonusPlaceholder;
          labelInput.value = bonus.label ?? "";

          const removeButton = document.createElement("button");
          removeButton.type = "button";
          removeButton.dataset.removeBonus = "";
          removeButton.classList.add("remove-bonus");
          removeButton.innerHTML = "&times;";
          removeButton.addEventListener("click", () => {
            row.remove();
            updateSkillModDisplay();
          });

          row.appendChild(valueInput);
          row.appendChild(typeSelect);
          row.appendChild(labelInput);
          row.appendChild(removeButton);

          bonusList.appendChild(row);
          updateSkillModDisplay();
        };

        if (bonusList) {
          if (addBonusButton) {
            addBonusButton.addEventListener("click", () => {
              createBonusRow();
            });
          }

          if (!bonusList.querySelector("[data-bonus-row]")) {
            createBonusRow();
          }
        }

        if (skillModField) {
          skillModField.value = initialMod;
          skillModField.disabled = true;
        }

        if (skillSelect) {
          skillSelect.value = selectedSkill;
          skillSelect.addEventListener("change", () => {
            const skill = skillSelect.value;
            const mod = getSkillMod(actor, skill);
            baseSkillMod = mod;
            updateSkillModDisplay();
          });
        }

        if (lockSelect) {
          lockSelect.value = DEFAULT_LOCK_KEY;

          const applyLockDefaults = (lockKey) => {
            const lock = getLockType(lockKey);
            if (lockKey === "custom") {
              if (dcField) dcField.value = "";
              if (successesField) successesField.value = "";
              if (intervalField) intervalField.value = "";
              if (maxAttemptsField) maxAttemptsField.value = "";
              if (criticalFailureField) criticalFailureField.checked = false;
              if (sneakyKeyField) sneakyKeyField.checked = false;
              if (silentModeField) silentModeField.checked = false;
              return;
            }

            if (dcField) dcField.value = lock.dc ?? "";
            if (successesField) successesField.value = lock.requiredSuccesses ?? "";
            if (intervalField) intervalField.value = lock.intervalMinutes ?? "";
            if (maxAttemptsField) maxAttemptsField.value = lock.maxAttempts ?? "";
            if (criticalFailureField) criticalFailureField.checked = Boolean(lock.criticalFailureBreaks);
            if (sneakyKeyField) sneakyKeyField.checked = Boolean(lock.sneakyKey);
            if (silentModeField) silentModeField.checked = Boolean(lock.silentMode);
          };

          applyLockDefaults(lockSelect.value);
          lockSelect.addEventListener("change", () => {
            applyLockDefaults(lockSelect.value);
          });
        }

        const reqInput =
          form.querySelector("[data-req-input]") ??
          form.querySelector("[name=requestCheck]") ??
          form.querySelector("[name=request]") ??
          form.querySelector("[name=req]");
        const reqPayload =
          form.querySelector("[data-req-payload]") ??
          form.querySelector("[name=requestPayload]") ??
          form.querySelector("[name=reqPayload]");
        const reqDrop =
          form.querySelector("[data-req-drop]") ??
          form.querySelector("[data-inline-check-drop]") ??
          reqInput ??
          null;

        const updateReqPayload = (rawText) => {
          if (!reqPayload) return;

          const text = typeof rawText === "string" ? rawText.trim() : "";
          const match = text.match(/@Check\[[^\]]+\]/i);
          reqPayload.value = match ? match[0] : "";
        };

        if (reqInput) {
          reqInput.addEventListener("input", () => {
            updateReqPayload(reqInput.value);
          });
          reqInput.addEventListener("change", () => {
            updateReqPayload(reqInput.value);
          });
          updateReqPayload(reqInput.value);
        }

        if (reqDrop) {
          const assignFromText = (text) => {
            if (!text) return;
            if (reqInput) {
              reqInput.value = text;
            }
            updateReqPayload(text);
          };

          reqDrop.addEventListener("dragenter", (event) => {
            event.preventDefault();
          });

          reqDrop.addEventListener("dragover", (event) => {
            event.preventDefault();
          });

          reqDrop.addEventListener("drop", (event) => {
            event.preventDefault();
            const droppedText = event.dataTransfer?.getData("text/plain");
            if (!droppedText) return;
            assignFromText(droppedText.trim());
          });
        }
      },
      buttons: {
        start: {
          label: game.i18n?.localize?.("PF2E.Start") ?? "Start",
          callback: (html) => {
            const form = html[0]?.querySelector?.("form");
            if (!form) return reject(new Error("Missing pick-a-lock form"));

            const skillField = form.querySelector("[name=skill]");
            const skillModField = form.querySelector("[name=skillMod]");
            const selectedSkill = skillField?.value ?? "thievery";
            const baseSkillMod = getSkillMod(actor, selectedSkill);

            const bonusRows = Array.from(form.querySelectorAll("[data-bonus-row]"));
            const bonuses = bonusRows.map((row) => {
              const value = Number(row.querySelector("[data-bonus-value]")?.value ?? 0);
              const type = row.querySelector("[data-bonus-type]")?.value ?? "untyped";
              const label = row.querySelector("[data-bonus-label]")?.value?.trim() ?? "";
              return {
                value: Number.isFinite(value) ? value : 0,
                type,
                label,
              };
            });
            const bonusTotal = bonuses.reduce((sum, bonus) => sum + (Number.isFinite(bonus.value) ? bonus.value : 0), 0);
            const totalSkillMod = baseSkillMod + bonusTotal;

            let data;
            if (skillModField) {
              const wasDisabled = skillModField.disabled;
              skillModField.value = totalSkillMod;
              if (wasDisabled) skillModField.disabled = false;
              const formData = new FormData(form);
              if (wasDisabled) skillModField.disabled = true;
              data = Object.fromEntries(formData.entries());
            } else {
              data = Object.fromEntries(new FormData(form).entries());
            }

            data.skill = selectedSkill;
            data.baseSkillMod = baseSkillMod;
            data.bonuses = bonuses;
            data.bonusTotal = bonusTotal;
            data.skillMod = totalSkillMod;

            const lockKey = data.lockType ?? form.querySelector("[name=lockType]")?.value ?? DEFAULT_LOCK_KEY;
            const lockInfo = getLockType(lockKey);
            data.lockType = lockKey;
            data.lockLabel = formatLockLabel(lockInfo);

            data.dc = parseNullableNumber(data.dc);
            data.requiredSuccesses = parseNullableNumber(data.requiredSuccesses);
            data.intervalMinutes = parseNullableNumber(data.intervalMinutes);
            data.maxAttempts = parseNullableNumber(data.maxAttempts);

            data.criticalFailureBreaks = Boolean(form.querySelector("[name=criticalFailureBreaks]")?.checked ?? data.criticalFailureBreaks);
            data.sneakyKey = Boolean(form.querySelector("[name=sneakyKey]")?.checked ?? data.sneakyKey);
            data.silentMode = Boolean(form.querySelector("[name=silentMode]")?.checked ?? data.silentMode);

            const reqInput = form.querySelector("[data-req-input]") ?? form.querySelector("[name=request]") ?? null;
            const reqPayload = form.querySelector("[data-req-payload]") ?? form.querySelector("[name=requestPayload]") ?? null;
            data.request = reqInput?.value ?? data.request ?? "";
            data.requestPayload = reqPayload?.value ?? data.requestPayload ?? "";
            data.requestRoll = Boolean(
              form.querySelector("[name=requestCheck]")?.checked ??
                form.querySelector("[name=requestRoll]")?.checked ??
                data.requestRoll,
            );

            SKILL_MOD = totalSkillMod;

            resolve(data);
          },
        },
        cancel: {
          label: game.i18n?.localize?.("Cancel") ?? "Cancel",
          callback: () => reject(new Error("cancelled")),
        },
      },
      default: "start",
      close: () => reject(new Error("closed")),
    });

    dialog.render(true);
  });
}

async function performPickLockRoll(actor, submission) {
  const {
    skill,
    skillMod,
    dc,
    lockType,
    lockLabel,
    bonuses = [],
    bonusTotal = 0,
    baseSkillMod,
  } = submission;

  const totalModifier = Number(skillMod) || 0;
  const rollFormula = `1d20 + ${totalModifier}`;
  const roll = await (new Roll(rollFormula)).roll({ async: true });

  const baseFlavor = game.i18n?.localize?.("PF2E.Actions.PickALock") ?? "Pick a Lock";
  const flavorParts = [`${baseFlavor} (${skill})`];

  if (lockLabel && lockType) {
    flavorParts.push(lockLabel);
  }

  const dcNumber = typeof dc === "number" && Number.isFinite(dc) ? dc : null;
  if (dcNumber !== null) {
    flavorParts.push(`DC ${dcNumber}`);
  }

  if (bonusTotal) {
    const bonusLabel = localize("PF2E.BonusLabel", "Bonuses");
    const breakdown = bonuses
      .filter((bonus) => Number.isFinite(bonus.value) && bonus.value)
      .map((bonus) => {
        const sign = bonus.value >= 0 ? "+" : "";
        const type = bonus.type ? ` ${bonus.type}` : "";
        const label = bonus.label ? ` (${bonus.label})` : "";
        return `${sign}${bonus.value}${type}${label}`;
      })
      .join(", ");
    const summary = breakdown || `${bonusTotal >= 0 ? "+" : ""}${bonusTotal}`;
    flavorParts.push(`${bonusLabel}: ${summary}`);
  }

  if (Number.isFinite(baseSkillMod) && bonusTotal) {
    flavorParts.push(`${localize("PF2E.BaseModifier", "Base Mod")}: ${baseSkillMod}`);
  }

  await roll.toMessage({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: flavorParts.join(" – "),
  });

  if (dcNumber !== null) {
    const successText = roll.total >= dcNumber
      ? game.i18n?.localize?.("PF2E.Check.Succeeded") ?? "Success"
      : game.i18n?.localize?.("PF2E.Check.Failed") ?? "Failure";
    ui.notifications?.info?.(`${roll.total} vs DC ${dcNumber}: ${successText}`);
  }
}

async function pickALock(actor = canvas?.tokens?.controlled?.[0]?.actor ?? game.user?.character ?? null) {
  if (!actor) {
    ui.notifications?.warn?.("No actor selected for Pick a Lock");
    return;
  }

  try {
    const submission = await renderPickLockDialog(actor);
    await performPickLockRoll(actor, submission);
  } catch (error) {
    if (error?.message !== "cancelled" && error?.message !== "closed") {
      console.error(error);
    }
  }
}

const namespace = (globalThis.kazgulsPf2eMacros ??= {});
namespace.pickALock = pickALock;
namespace.getSkillMod = getSkillMod;
Object.defineProperty(namespace, "SKILL_MOD", {
  get: () => SKILL_MOD,
  set: (value) => {
    SKILL_MOD = Number(value) || 0;
  },
  configurable: true,
});

if (game?.modules?.get) {
  const module = game.modules.get("kazguls-pf2e-macros");
  if (module) {
    module.api ??= {};
    module.api.pickALock = pickALock;
    module.api.getSkillMod = getSkillMod;
    Object.defineProperty(module.api, "SKILL_MOD", {
      get: () => SKILL_MOD,
      set: (value) => {
        SKILL_MOD = Number(value) || 0;
      },
      configurable: true,
    });
  }
}
