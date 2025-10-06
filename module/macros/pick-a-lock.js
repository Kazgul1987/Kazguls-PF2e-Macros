const PICK_A_LOCK_TEMPLATE = "modules/kazguls-pf2e-macros/templates/pick-a-lock.hbs";
const LOCK_ICON_PATH = "static/icons/equipment/held-items/key-short-gold.webp";

let SKILL_MOD = 0;

const LOCK_TYPES = [
  {
    key: "custom",
    name: "Custom",
    level: null,
    dc: 20,
    requiredSuccesses: 3,
    intervalMinutes: 1,
    maxAttempts: 0,
    criticalFailureBreaks: true,
    sneakyKey: false,
    silentMode: true,
  },
  {
    key: "poor",
    name: "Poor",
    level: 0,
    dc: 15,
    requiredSuccesses: 2,
    intervalMinutes: 1,
    maxAttempts: 0,
    criticalFailureBreaks: true,
    sneakyKey: false,
    silentMode: true,
  },
  {
    key: "simple",
    name: "Simple",
    level: 1,
    dc: 20,
    requiredSuccesses: 3,
    intervalMinutes: 1,
    maxAttempts: 0,
    criticalFailureBreaks: true,
    sneakyKey: false,
    silentMode: true,
  },
  {
    key: "average",
    name: "Average",
    level: 3,
    dc: 25,
    requiredSuccesses: 4,
    intervalMinutes: 1,
    maxAttempts: 0,
    criticalFailureBreaks: true,
    sneakyKey: false,
    silentMode: true,
  },
  {
    key: "good",
    name: "Good",
    level: 9,
    dc: 30,
    requiredSuccesses: 5,
    intervalMinutes: 1,
    maxAttempts: 0,
    criticalFailureBreaks: true,
    sneakyKey: false,
    silentMode: true,
  },
  {
    key: "superior",
    name: "Superior",
    level: 17,
    dc: 40,
    requiredSuccesses: 6,
    intervalMinutes: 1,
    maxAttempts: 0,
    criticalFailureBreaks: true,
    sneakyKey: false,
    silentMode: true,
  },
];

const DEFAULT_LOCK_KEY = "superior";
const HARD_CAP = 1000;
const REQUEST_FLAG_SCOPE = "kazguls-pf2e-macros";
const REQUEST_FLAG_KEY = "pickALock";

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

function escapeHtml(value) {
  if (typeof value !== "string") return "";
  if (foundry?.utils?.escapeHTML) return foundry.utils.escapeHTML(value);
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
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

function numberOrZero(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function aggregateBonuses(bonuses = []) {
  const groups = {
    item: [],
    status: [],
    circumstance: [],
    untyped: [],
  };

  for (const bonus of bonuses) {
    const value = Number(bonus?.value ?? 0);
    if (!Number.isFinite(value)) continue;

    const type = String(bonus?.type ?? "").toLowerCase();
    if (type === "item") groups.item.push(value);
    else if (type === "status") groups.status.push(value);
    else if (type === "circumstance") groups.circumstance.push(value);
    else groups.untyped.push(value);
  }

  const pickByAbs = (values) => values.reduce((best, current) => {
    if (best === null) return current;
    return Math.abs(current) > Math.abs(best) ? current : best;
  }, null);

  const itemEff = pickByAbs(groups.item) ?? 0;
  const statusEff = pickByAbs(groups.status) ?? 0;
  const circSum = groups.circumstance.reduce((sum, v) => sum + v, 0);
  const untypedSum = groups.untyped.reduce((sum, v) => sum + v, 0);
  const total = itemEff + statusEff + circSum + untypedSum;

  return { itemEff, statusEff, circSum, untypedSum, total };
}

function formatSigned(value) {
  const numeric = Number(value) || 0;
  return `${numeric >= 0 ? "+" : ""}${numeric}`;
}

const rollD20Silent = () => Math.floor(Math.random() * 20) + 1;
const rollD20Foundry = () => {
  try {
    const roll = new Roll("1d20").evaluate({ async: false });
    const face = Number(roll.dice?.[0]?.results?.[0]?.result ?? roll.total);
    return Number.isFinite(face) ? face : rollD20Silent();
  } catch (error) {
    console.error(error);
    return rollD20Silent();
  }
};

function getSkillMod(actor, key) {
  if (!actor || !key) return 0;

  if (key.startsWith("lore-")) {
    const loreKey = key.slice(5);
    const lore = actor.system?.lores?.[loreKey] ?? actor.system?.skills?.[loreKey];
    const value = lore?.check?.mod ?? lore?.mod ?? lore?.value ?? lore?.totalModifier;
    return Number(value) || 0;
  }

  const alias = {
    acrobatics: ["acrobatics", "acr"],
    arcana: ["arcana", "arc"],
    athletics: ["athletics", "ath"],
    crafting: ["crafting", "cra"],
    deception: ["deception", "dec"],
    diplomacy: ["diplomacy", "dip"],
    intimidation: ["intimidation", "itm"],
    medicine: ["medicine", "med"],
    nature: ["nature", "nat"],
    occultism: ["occultism", "occ"],
    performance: ["performance", "prf"],
    religion: ["religion", "rel"],
    society: ["society", "soc"],
    stealth: ["stealth", "ste"],
    survival: ["survival", "sur"],
    thievery: ["thievery", "thi"],
    perception: ["perception", "per"],
  };

  const searchKeys = [...(alias[key] ?? []), key]
    .filter((value, index, array) => typeof value === "string" && array.indexOf(value) === index);

  for (const slug of searchKeys) {
    try {
      const statistic = actor.getStatistic?.(slug);
      const value = statistic?.check?.mod ?? statistic?.mod;
      if (typeof value === "number") return value;
    } catch (error) {
      /* ignore */
    }
  }

  for (const slug of searchKeys) {
    const skill = actor.skills?.[slug];
    const value = skill?.check?.mod ?? skill?.totalModifier ?? skill?.mod;
    if (typeof value === "number") return value;
  }

  for (const slug of searchKeys) {
    const skill = actor.system?.skills?.[slug];
    const value = skill?.check?.mod ?? skill?.totalModifier ?? skill?.mod ?? skill?.value;
    if (typeof value === "number") return value;
  }

  const abilityBySkill = {
    thievery: "dex",
    stealth: "dex",
    acrobatics: "dex",
    athletics: "str",
    religion: "wis",
    medicine: "wis",
    survival: "wis",
    perception: "wis",
    arcana: "int",
    occultism: "int",
    crafting: "int",
    society: "int",
    nature: "wis",
    deception: "cha",
    diplomacy: "cha",
    intimidation: "cha",
    performance: "cha",
  };

  const ability = abilityBySkill[key];
  if (ability) {
    const abilityValue = actor.abilities?.[ability]?.mod ?? actor.system?.abilities?.[ability]?.mod;
    if (typeof abilityValue === "number") return abilityValue;
  }

  return 0;
}

function getSkillOptions(actor) {
  const system = actor?.system ?? {};
  const skills = system.skills ?? {};
  const options = Object.entries(skills).map(([slug, data]) => ({
    slug,
    label: game.i18n?.localize?.(data?.label) ?? data?.label ?? slug,
  }));

  const lores = system.lores ?? {};
  const loreOptions = Object.entries(lores).map(([slug, data]) => ({
    slug: `lore-${slug}`,
    label: data?.label ?? game.i18n?.localize?.("PF2E.Lore") ?? slug,
  }));

  const skillMap = new Map();
  for (const option of [...options, ...loreOptions]) {
    if (!skillMap.has(option.slug)) {
      skillMap.set(option.slug, option);
    }
  }

  const sorted = [...skillMap.values()].sort((a, b) => a.label.localeCompare(b.label));
  sorted.push({ slug: "custom", label: localize("PF2E.CustomSkill", "Benutzerdefiniert") });
  return sorted;
}

function parseInlineCheckTag(text) {
  if (typeof text !== "string" || !text.trim()) return null;
  const tagMatch = text.match(/@Check\[(.*?)\]/i);
  if (!tagMatch) return null;

  const inside = tagMatch[1];
  const parts = inside.split("|").map((part) => part.trim());
  const data = {};
  for (const part of parts) {
    const [key, value] = part.split(":");
    if (!key || value === undefined) continue;
    data[key.trim().toLowerCase()] = value.trim().toLowerCase();
  }

  const type = data.type ?? "thievery";
  const dc = Number(data.dc ?? "0");
  if (!Number.isFinite(dc) || dc <= 0) return null;
  return { type, dc, raw: tagMatch[0] };
}

async function renderPickLockDialog(actor) {
  const skills = getSkillOptions(actor);
  const selectedSkill = skills.find((skill) => skill.slug === "thievery")?.slug ?? skills.at(0)?.slug ?? "custom";
  const initialBaseMod = selectedSkill === "custom" ? 0 : getSkillMod(actor, selectedSkill);

  SKILL_MOD = initialBaseMod;

  const lockOptions = getLockOptions();
  const initialLock = { ...getLockType(DEFAULT_LOCK_KEY) };

  const templateData = {
    skills,
    selectedSkill,
    skillMod: initialBaseMod,
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
    whisperLabel: localize("PF2E.WhisperToSelf", "Whisper an mich?"),
    requestRollLabel: localize("PF2E.RequestRoll", "Request-Roll aktivieren"),
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
        const whisperField = form.querySelector("[name=whisper]");
        const reqEnable = form.querySelector("[data-req-enable]");
        const reqContainer = form.querySelector("[data-req-container]");
        const reqInput = form.querySelector("[data-req-input]");
        const reqPayloadField = form.querySelector("[data-req-payload]");
        const reqDrop = form.querySelector("[data-req-drop]");

        const modifierTypes = getModifierTypes();
        let baseSkillMod = initialBaseMod;

        const readBonuses = () => {
          if (!bonusList) return [];
          return Array.from(bonusList.querySelectorAll("[data-bonus-row]")).map((row) => {
            const valueInput = row.querySelector("[data-bonus-value]");
            const typeSelect = row.querySelector("[data-bonus-type]");
            const labelInput = row.querySelector("[data-bonus-label]");
            return {
              value: Number(valueInput?.value ?? 0),
              type: typeSelect?.value ?? "untyped",
              label: labelInput?.value?.trim() ?? "",
            };
          });
        };

        const updateTotals = () => {
          const aggregation = aggregateBonuses(readBonuses());
          SKILL_MOD = baseSkillMod + aggregation.total;
        };

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
          valueInput.addEventListener("input", updateTotals);

          const typeSelect = document.createElement("select");
          typeSelect.dataset.bonusType = "";
          modifierTypes.forEach((type) => {
            const option = document.createElement("option");
            option.value = type.value;
            option.textContent = type.label;
            typeSelect.appendChild(option);
          });
          const availableTypes = modifierTypes.map((type) => type.value);
          const preferredType = availableTypes.includes(bonus.type) ? bonus.type : modifierTypes[0]?.value ?? "untyped";
          typeSelect.value = preferredType;
          typeSelect.addEventListener("change", updateTotals);

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
            updateTotals();
          });

          row.appendChild(valueInput);
          row.appendChild(typeSelect);
          row.appendChild(labelInput);
          row.appendChild(removeButton);

          bonusList.appendChild(row);
          updateTotals();
        };

        if (bonusList) {
          if (addBonusButton) {
            addBonusButton.addEventListener("click", () => createBonusRow());
          }

          if (!bonusList.querySelector("[data-bonus-row]")) {
            createBonusRow();
          }
        }

        if (skillModField) {
          skillModField.value = initialBaseMod;
          if (skillSelect?.value !== "custom") skillModField.disabled = true;
          skillModField.addEventListener("input", () => {
            if (skillSelect?.value === "custom") {
              baseSkillMod = Number(skillModField.value) || 0;
              updateTotals();
            }
          });
        }

        if (skillSelect) {
          skillSelect.value = selectedSkill;
          skillSelect.addEventListener("change", () => {
            const skill = skillSelect.value;
            if (skill === "custom") {
              if (skillModField) {
                skillModField.disabled = false;
                baseSkillMod = Number(skillModField.value) || 0;
              } else {
                baseSkillMod = 0;
              }
            } else {
              const mod = getSkillMod(actor, skill);
              baseSkillMod = mod;
              if (skillModField) {
                skillModField.value = mod;
                skillModField.disabled = true;
              }
            }
            updateTotals();
          });
        }

        const applyLockDefaults = (lockKey) => {
          const lock = getLockType(lockKey);
          const isCustom = lockKey === "custom";

          const assign = (field, value) => {
            if (!field) return;
            field.value = value ?? "";
            field.disabled = !isCustom;
          };

          assign(dcField, lock.dc ?? "");
          assign(successesField, lock.requiredSuccesses ?? "");
          assign(intervalField, lock.intervalMinutes ?? "");
          assign(maxAttemptsField, lock.maxAttempts ?? "");

          if (criticalFailureField) {
            criticalFailureField.checked = Boolean(lock.criticalFailureBreaks);
            criticalFailureField.disabled = !isCustom;
          }

          if (sneakyKeyField) {
            sneakyKeyField.checked = Boolean(lock.sneakyKey);
            sneakyKeyField.disabled = !isCustom;
          }

          if (silentModeField) {
            silentModeField.checked = Boolean(lock.silentMode);
            silentModeField.disabled = !isCustom;
          }
        };

        if (lockSelect) {
          lockSelect.value = DEFAULT_LOCK_KEY;
          applyLockDefaults(lockSelect.value);
          lockSelect.addEventListener("change", () => applyLockDefaults(lockSelect.value));
        }

        const toggleReqContainer = () => {
          if (!reqContainer) return;
          const enabled = Boolean(reqEnable?.checked);
          reqContainer.hidden = !enabled;
        };

        if (reqEnable) {
          reqEnable.checked = false;
          toggleReqContainer();
          reqEnable.addEventListener("change", toggleReqContainer);
        }

        const updateReqPayload = (rawText) => {
          if (!reqPayloadField) return;
          const match = typeof rawText === "string" ? rawText.match(/@Check\[[^\]]+\]/i) : null;
          reqPayloadField.value = match ? match[0] : "";
        };

        if (reqInput) {
          reqInput.addEventListener("input", () => updateReqPayload(reqInput.value));
          reqInput.addEventListener("change", () => updateReqPayload(reqInput.value));
        }

        const extractInlineCheck = (text) => {
          if (!text) return "";
          const html = text.match(/@Check\[[^\]]+\][^{]*(\{[^}]*\})?/i);
          if (html) return html[0];
          return text.trim();
        };

        if (reqDrop) {
          reqDrop.addEventListener("dragenter", (event) => event.preventDefault());
          reqDrop.addEventListener("dragover", (event) => event.preventDefault());
          reqDrop.addEventListener("drop", (event) => {
            event.preventDefault();
            const htmlData = event.dataTransfer?.getData("text/html");
            const textData = event.dataTransfer?.getData("text/plain");
            const payload = extractInlineCheck(htmlData || textData || "");
            if (reqInput) reqInput.value = payload;
            updateReqPayload(payload);
          });
          reqDrop.addEventListener("paste", (event) => {
            const text = event.clipboardData?.getData("text") ?? "";
            const payload = extractInlineCheck(text);
            if (reqInput) reqInput.value = payload;
            updateReqPayload(payload);
            event.preventDefault();
          });
        }

        updateTotals();
        if (whisperField) whisperField.checked = false;
      },
      buttons: {
        start: {
          label: game.i18n?.localize?.("PF2E.Start") ?? "Start",
          callback: (html) => {
            const form = html[0]?.querySelector?.("form");
            if (!form) return reject(new Error("Missing pick-a-lock form"));

            const skillField = form.querySelector("[name=skill]");
            const lockField = form.querySelector("[name=lockType]");
            const skill = skillField?.value ?? "thievery";
            const lockKey = lockField?.value ?? DEFAULT_LOCK_KEY;
            const lockInfo = getLockType(lockKey);

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

            const aggregation = aggregateBonuses(bonuses);

            let baseSkillMod = skill === "custom" ? Number(form.querySelector("[name=skillMod]")?.value ?? 0) : getSkillMod(actor, skill);
            if (!Number.isFinite(baseSkillMod)) baseSkillMod = 0;
            const totalSkillMod = baseSkillMod + aggregation.total;

            const isCustom = lockKey === "custom";

            const data = {
              skill,
              skillLabel: skillField?.selectedOptions?.[0]?.textContent ?? skill,
              lockType: lockKey,
              lockLabel: formatLockLabel(lockInfo),
              dc: isCustom ? parseNullableNumber(form.querySelector("[name=dc]")?.value ?? lockInfo.dc) ?? lockInfo.dc : lockInfo.dc,
              requiredSuccesses: isCustom
                ? parseNullableNumber(form.querySelector("[name=requiredSuccesses]")?.value ?? lockInfo.requiredSuccesses) ?? lockInfo.requiredSuccesses
                : lockInfo.requiredSuccesses,
              intervalMinutes: isCustom
                ? parseNullableNumber(form.querySelector("[name=intervalMinutes]")?.value ?? lockInfo.intervalMinutes) ?? lockInfo.intervalMinutes
                : lockInfo.intervalMinutes,
              maxAttempts: isCustom
                ? parseNullableNumber(form.querySelector("[name=maxAttempts]")?.value ?? lockInfo.maxAttempts) ?? lockInfo.maxAttempts
                : lockInfo.maxAttempts,
              criticalFailureBreaks: isCustom
                ? Boolean(form.querySelector("[name=criticalFailureBreaks]")?.checked ?? lockInfo.criticalFailureBreaks)
                : Boolean(lockInfo.criticalFailureBreaks),
              sneakyKey: isCustom
                ? Boolean(form.querySelector("[name=sneakyKey]")?.checked ?? lockInfo.sneakyKey)
                : Boolean(lockInfo.sneakyKey),
              silentMode: isCustom
                ? Boolean(form.querySelector("[name=silentMode]")?.checked ?? lockInfo.silentMode)
                : Boolean(lockInfo.silentMode),
              whisper: Boolean(form.querySelector("[name=whisper]")?.checked ?? false),
              bonuses,
              aggregation,
              baseSkillMod,
              skillMod: totalSkillMod,
              request: form.querySelector("[data-req-input]")?.value ?? "",
              requestPayload: form.querySelector("[data-req-payload]")?.value ?? "",
              requestRoll: Boolean(form.querySelector("[data-req-enable]")?.checked ?? false),
            };

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

function buildBonusBreakdown(aggregation) {
  const parts = [
    `Item ${formatSigned(aggregation.itemEff)}`,
    `Status ${formatSigned(aggregation.statusEff)}`,
    `Circumstance ${formatSigned(aggregation.circSum)}`,
  ];
  if (aggregation.untypedSum) parts.push(`Andere ${formatSigned(aggregation.untypedSum)}`);
  return `<small>Effektiv: ${parts.join(", ")}</small>`;
}

function degree(total, dc, face) {
  let deg;
  if (total >= dc + 10) deg = 3;
  else if (total >= dc) deg = 2;
  else if (total <= dc - 10) deg = 0;
  else deg = 1;
  if (face === 20) deg = Math.min(3, deg + 1);
  if (face === 1) deg = Math.max(0, deg - 1);
  return deg;
}

async function performPickLockSimulation(actor, submission) {
  const lockInfo = getLockType(submission.lockType ?? DEFAULT_LOCK_KEY);
  const skillLabel = submission.skillLabel ?? submission.skill ?? "thievery";
  const bonuses = Array.isArray(submission.bonuses) ? submission.bonuses : [];
  const aggregation = submission.aggregation ?? aggregateBonuses(bonuses);

  let baseSkillMod = Number(submission.baseSkillMod);
  if (!Number.isFinite(baseSkillMod)) {
    const derivedBase = Number(submission.skillMod) - aggregation.total;
    baseSkillMod = Number.isFinite(derivedBase) ? derivedBase : 0;
  }
  baseSkillMod = Number.isFinite(baseSkillMod) ? baseSkillMod : 0;

  let totalModifier = Number(submission.skillMod);
  if (!Number.isFinite(totalModifier)) {
    totalModifier = baseSkillMod + aggregation.total;
  }
  totalModifier = Number.isFinite(totalModifier) ? totalModifier : 0;

  let dc = numberOrZero(submission.dc ?? lockInfo.dc ?? 0);
  let needed = numberOrZero(submission.requiredSuccesses ?? lockInfo.requiredSuccesses ?? 1);
  let minutesPerAttempt = numberOrZero(submission.intervalMinutes ?? lockInfo.intervalMinutes ?? 1);
  let maxAttempts = numberOrZero(submission.maxAttempts ?? lockInfo.maxAttempts ?? 0);

  needed = Math.max(1, needed);
  minutesPerAttempt = Math.max(0, minutesPerAttempt);

  const stopOnCritFail = Boolean(submission.criticalFailureBreaks);
  let sneakyKey = Boolean(submission.sneakyKey);
  const silentMode = Boolean(submission.silentMode);
  const whisper = Boolean(submission.whisper);

  if (!maxAttempts) maxAttempts = Math.min(300, Math.max(30, needed * 10));

  const bestTotal = totalModifier + 20;
  const successPossible = bestTotal >= dc || bestTotal >= dc - 10;
  if (!successPossible) {
    ui.notifications?.error?.(
      `Mit ${skillLabel} ${formatSigned(totalModifier)} gegen DC ${dc} ist kein Fortschritt möglich (selbst mit nat 20 nur Fehlschlag).`,
    );
    return;
  }

  const d20 = silentMode ? rollD20Silent : rollD20Foundry;

  let progress = 0;
  let tries = 0;
  let minutes = 0;
  let broken = false;
  const log = [];

  while (progress < needed && tries < maxAttempts && tries < HARD_CAP) {
    tries += 1;
    const face = d20();
    const total = face + totalModifier;
    const deg = degree(total, dc, face);

    let step = 0;
    let note = "";

    if (deg === 3) {
      step = 2;
      note = "Kritischer Erfolg (+2)";
    } else if (deg === 2) {
      step = 1;
      note = "Erfolg (+1)";
    } else if (deg === 1) {
      step = 0;
      note = "Fehlschlag";
    } else {
      note = "Kritischer Fehlschlag – Werkzeuge beschädigt!";
      broken = true;
      minutes += minutesPerAttempt;
      log.push({ tries, face, total, deg, step, note });
      if (stopOnCritFail) break;
      continue;
    }

    if (sneakyKey && (deg === 2 || deg === 3)) {
      step += 1;
      note += " | Sneaky Key: +1 Fortschritt";
      sneakyKey = false;
    }

    progress += step;
    minutes += minutesPerAttempt;

    log.push({ tries, face, total, deg, step, note });

    if (progress >= needed) break;
  }

  const finish =
    progress >= needed
      ? '<b style="color:green">Schloss geöffnet</b>'
      : broken && stopOnCritFail
      ? '<b style="color:#b00">Abbruch: Kritischer Fehlschlag (Werkzeugbruch)</b>'
      : tries >= maxAttempts
      ? '<b style="color:orange">Abbruch: Versuchs-Limit erreicht</b>'
      : '<b>Nicht geschafft</b>';

  const rows = log
    .map((entry) => {
      const color = entry.deg === 3 ? "#0a0" : entry.deg === 2 ? "#060" : entry.deg === 0 ? "#b00" : "#666";
      const labels = ["Krit-Fehl", "Fehl", "Erfolg", "Krit-Erfolg"];
      return `
        <tr>
          <td style="text-align:right">${entry.tries}</td>
          <td style="text-align:center">${entry.face}</td>
          <td style="text-align:right">${entry.total}</td>
          <td style="color:${color}">${labels[entry.deg] ?? entry.deg}</td>
          <td style="text-align:right">+${entry.step}</td>
          <td>${entry.note}</td>
        </tr>`;
    })
    .join("");

  const bonusBreakdown = buildBonusBreakdown(aggregation);
  const skillLine = `<b>Skill:</b> ${escapeHtml(skillLabel)} | <b>Basis:</b> ${formatSigned(baseSkillMod)} | <b>Gesamt:</b> ${formatSigned(totalModifier)}<br/>${bonusBreakdown}`;
  const lockLine = `<b>Schlosstyp:</b> ${escapeHtml(submission.lockLabel ?? formatLockLabel(lockInfo))} | <b>DC:</b> ${dc} | <b>Erfolge:</b> ${needed} | <b>Modus:</b> ${silentMode ? "Silent" : "Foundry"}`;
  const progressLine = `<b>Versuche:</b> ${tries} | <b>Fortschritt:</b> ${progress}/${needed} | <b>Zeit:</b> ${minutes} Min.`;

  let reqSectionHTML = "";
  let requestData = null;
  if (submission.requestRoll) {
    requestData = parseInlineCheckTag(submission.requestPayload ?? submission.request ?? "");
    if (requestData) {
      const pretty = escapeHtml(submission.requestPayload ?? requestData.raw ?? "");
      reqSectionHTML = `
        <hr/>
        <div><b>Request-Roll:</b> <code>${pretty}</code></div>
        <button class="pf2e-reqroll-btn" data-msg="__MSGID__" data-type="${escapeHtml(requestData.type)}" data-dc="${requestData.dc}">Würfeln bis Erfolg/KritErfolg oder KritFehlschlag</button>
        <div class="pf2e-reqroll-note" style="font-size:12px;opacity:.8">Bitte einen Token auswählen; nat20/nat1 Erfolgsgrad-Shift aktiv.</div>
      `;
    } else {
      reqSectionHTML = `
        <hr/>
        <div style="color:#b00"><b>Request-Roll:</b> Ungültiger oder fehlender @Check-Tag.</div>
      `;
    }
  }

  const content = `
    <div class="pf2e chat-card">
      <header class="card-header flexrow">
        <img src="${LOCK_ICON_PATH}" width="36" height="36"/>
        <h3>Pick a Lock – Hintergrundwürfe</h3>
      </header>
      <section class="card-content">
        <p>${skillLine}</p>
        <p>${lockLine}</p>
        <p>${progressLine}</p>
        <p>${finish}${broken && stopOnCritFail ? "<br/><i>Werkzeuge beschädigt – Ersatzpicks nötig.</i>" : ""}</p>
        <details><summary>Würfelverlauf</summary>
          <table style="width:100%; border-collapse:collapse;">
            <thead><tr><th>#</th><th>d20</th><th>Gesamt</th><th>Grad</th><th>Fortschr.</th><th>Notiz</th></tr></thead>
            <tbody>${rows || "<tr><td colspan='6'>Keine Versuche</td></tr>"}</tbody>
          </table>
        </details>
        ${reqSectionHTML}
      </section>
    </div>
  `;

  const message = await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content,
    whisper: whisper ? [game.user?.id].filter(Boolean) : undefined,
    flags: {
      [REQUEST_FLAG_SCOPE]: {
        [REQUEST_FLAG_KEY]: {
          request: requestData ? { type: requestData.type, dc: requestData.dc } : null,
        },
      },
    },
  });

  if (requestData) {
    try {
      const html = await message.getHTML();
      html.find(".pf2e-reqroll-btn").attr("data-msg", message.id);
    } catch (error) {
      console.error(error);
    }

    const handler = function handler(msg, jHtml) {
      if (msg.id !== message.id) return;
      const button = jHtml.find(".pf2e-reqroll-btn");
      if (!button.length) return;

      button.off("click").on("click", async () => {
        const clickActor = canvas.tokens?.controlled?.[0]?.actor ?? game.user?.character ?? null;
        if (!clickActor) {
          ui.notifications?.warn?.("Bitte einen Token auswählen (für Request-Roll).");
          return;
        }

        const flag = msg.getFlag(REQUEST_FLAG_SCOPE, REQUEST_FLAG_KEY) ?? {};
        const type = button.attr("data-type") || flag?.request?.type || "thievery";
        const dcValue = Number(button.attr("data-dc") ?? flag?.request?.dc ?? 0);
        if (!Number.isFinite(dcValue) || dcValue <= 0) {
          ui.notifications?.error?.("Request-Roll: Ungültiger DC.");
          return;
        }

        const mod = getSkillMod(clickActor, type) ?? 0;
        const maxLoops = 200;
        const logs = [];
        let stopReason = "—";

        for (let i = 1; i <= maxLoops; i += 1) {
          const face = rollD20Silent();
          const total = face + mod;
          const deg = degree(total, dcValue, face);
          logs.push({ i, face, total, deg });
          if (deg === 3) {
            stopReason = "Kritischer Erfolg";
            break;
          }
          if (deg === 2) {
            stopReason = "Erfolg";
            break;
          }
          if (deg === 0) {
            stopReason = "Kritischer Fehlschlag";
            break;
          }
        }

        const rowsHtml = logs
          .map((entry) => {
            const color = entry.deg === 3 ? "#0a0" : entry.deg === 2 ? "#060" : entry.deg === 0 ? "#b00" : "#666";
            const labels = ["Krit-Fehl", "Fehl", "Erfolg", "Krit-Erfolg"];
            return `
              <tr>
                <td style="text-align:right">${entry.i}</td>
                <td style="text-align:center">${entry.face}</td>
                <td style="text-align:right">${entry.total}</td>
                <td style="color:${color}">${labels[entry.deg] ?? entry.deg}</td>
              </tr>`;
          })
          .join("");

        const requestContent = `
          <div class="pf2e chat-card">
            <header class="card-header flexrow">
              <img src="${LOCK_ICON_PATH}" width="36" height="36"/>
              <h3>Request-Roll Ergebnis – ${escapeHtml(clickActor.name ?? "")}</h3>
            </header>
            <section class="card-content">
              <p><b>Check:</b> ${escapeHtml(type)} vs. DC ${dcValue} | <b>Mod:</b> ${formatSigned(mod)}</p>
              <p><b>Stop:</b> ${stopReason} &nbsp; | &nbsp; <b>Würfe:</b> ${logs.length}</p>
              <details><summary>Verlauf</summary>
                <table style="width:100%; border-collapse:collapse;">
                  <thead><tr><th>#</th><th>d20</th><th>Gesamt</th><th>Grad</th></tr></thead>
                  <tbody>${rowsHtml}</tbody>
                </table>
              </details>
            </section>
          </div>
        `;

        ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor: clickActor }),
          content: requestContent,
        });
      });

      Hooks.off("renderChatMessage", handler);
    };

    Hooks.on("renderChatMessage", handler);
  }

  if (broken && stopOnCritFail) {
    const gmIds = game.users?.filter?.((user) => user.isGM).map((user) => user.id) ?? [];
    if (gmIds.length) {
      ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `<b>Hinweis:</b> ${escapeHtml(actor.name ?? "")} hat beim Schloss einen kritischen Fehlschlag (Werkzeuge beschädigt).`,
        whisper: gmIds,
      });
    }
  }
}

async function pickALock(actor = canvas?.tokens?.controlled?.[0]?.actor ?? game.user?.character ?? null) {
  if (!actor) {
    ui.notifications?.warn?.("Bitte einen Token auswählen oder ein Charakterblatt öffnen.");
    return;
  }

  try {
    const submission = await renderPickLockDialog(actor);
    await performPickLockSimulation(actor, submission);
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
