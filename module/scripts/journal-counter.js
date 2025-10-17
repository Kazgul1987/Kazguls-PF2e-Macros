const MODULE_ID = "kazguls-pf2e-macros";
const FLAG_SCOPE = "journalCounters";

const clamp = (value, min, max) => {
  const lower = Number.isFinite(min) ? min : Number.NEGATIVE_INFINITY;
  const upper = Number.isFinite(max) ? max : Number.POSITIVE_INFINITY;
  if (foundry?.utils?.clamp) return foundry.utils.clamp(value, lower, upper);
  if (typeof Math.clamped === "function") return Math.clamped(value, lower, upper);
  return Math.min(Math.max(value, lower), upper);
};

const getCounterStore = (doc) => {
  if (!doc) return {};
  const stored = doc.getFlag(MODULE_ID, FLAG_SCOPE) ?? {};
  return stored;
};

const getCounterValue = (doc, key, initialValue = 0) => {
  if (!doc) return initialValue;
  const stored = getCounterStore(doc);
  const raw = stored?.[key];
  return Number.isFinite(Number(raw)) ? Number(raw) : initialValue;
};

const setCounterValue = async (doc, key, value) => {
  if (!doc) return;
  const current = doc.getFlag(MODULE_ID, FLAG_SCOPE) ?? {};
  const updated = { ...current, [key]: value };
  await doc.setFlag(MODULE_ID, FLAG_SCOPE, updated);
};

const parseCounterMatch = (match) => {
  const { key, options, label } = match.groups ?? {};
  const settings = {
    key,
    label: label?.trim() || key,
    min: undefined,
    max: undefined,
    step: 1,
    initial: 0,
  };

  if (!options) return settings;

  for (const pair of options.split("|")) {
    const [rawName, rawValue] = pair.split("=");
    const name = rawName?.trim()?.toLowerCase();
    const value = rawValue?.trim();
    if (!name) continue;
    switch (name) {
      case "min":
        settings.min = value === undefined || value === "" ? undefined : Number(value);
        break;
      case "max":
        settings.max = value === undefined || value === "" ? undefined : Number(value);
        break;
      case "step":
        settings.step = value === undefined || value === "" ? 1 : Number(value);
        break;
      case "initial":
      case "default":
        settings.initial = value === undefined || value === "" ? 0 : Number(value);
        break;
      case "label":
        settings.label = value ?? settings.label;
        break;
      default:
        break;
    }
  }

  return settings;
};

const buildButton = (text, cssClass) => {
  const button = document.createElement("button");
  button.type = "button";
  button.classList.add("journal-counter__button", cssClass);
  button.textContent = text;
  return button;
};

const updateButtonState = (button, disabled) => {
  button.disabled = Boolean(disabled);
};

const refreshDisplay = (container, value, min, max, canEdit = true) => {
  const valueSpan = container.querySelector(".journal-counter__value");
  if (valueSpan) valueSpan.textContent = String(value);

  const dec = container.querySelector(".journal-counter__button--decrement");
  const inc = container.querySelector(".journal-counter__button--increment");

  if (dec) updateButtonState(dec, !canEdit || (Number.isFinite(min) && value <= min));
  if (inc) updateButtonState(inc, !canEdit || (Number.isFinite(max) && value >= max));
};

const handleAdjustment = (doc, container, settings, delta) => async (event) => {
  event.preventDefault();
  event.stopPropagation();

  if (!doc) {
    ui.notifications?.warn?.(game.i18n.localize?.("DOCUMENT.NotOwned") ?? "You do not have permission to modify this counter.");
    return;
  }

  if (!doc.isOwner) {
    ui.notifications?.warn?.(game.i18n.localize?.("DOCUMENT.NotOwned") ?? "You do not have permission to modify this counter.");
    return;
  }

  const { key, min, max, step } = settings;
  const current = getCounterValue(doc, key, settings.initial);
  const stepSize = Number.isFinite(step) && step > 0 ? step : 1;
  const target = clamp(current + delta * stepSize, min, max);

  if (target === current) {
    refreshDisplay(container, current, min, max);
    return;
  }

  try {
    await setCounterValue(doc, key, target);
    refreshDisplay(container, target, min, max, true);
  } catch (error) {
    console.error(`${MODULE_ID} | Failed to update counter`, error);
    ui.notifications?.error?.(game.i18n.localize?.("ERROR") ?? "Unable to update counter.");
  }
};

const createCounterElement = (doc, settings) => {
  const { key, label, min, max, initial } = settings;
  const container = document.createElement("span");
  container.classList.add("journal-counter");
  container.dataset.counterKey = key;
  const canEdit = doc?.isOwner ?? false;

  const labelSpan = document.createElement("span");
  labelSpan.classList.add("journal-counter__label");
  labelSpan.textContent = label;
  container.appendChild(labelSpan);

  const controls = document.createElement("span");
  controls.classList.add("journal-counter__controls");

  const decrement = buildButton("-", "journal-counter__button--decrement");
  const increment = buildButton("+", "journal-counter__button--increment");

  const valueSpan = document.createElement("span");
  valueSpan.classList.add("journal-counter__value");
  controls.appendChild(decrement);
  controls.appendChild(valueSpan);
  controls.appendChild(increment);
  container.appendChild(controls);

  const currentValue = getCounterValue(doc, key, initial);
  refreshDisplay(container, currentValue, min, max, canEdit);

  if (canEdit) {
    decrement.addEventListener("click", handleAdjustment(doc, container, settings, -1));
    increment.addEventListener("click", handleAdjustment(doc, container, settings, 1));
  }

  return container;
};

Hooks.once("init", () => {
  const pattern = /@counter\[(?<key>[^\]\s]+)(?:\s*,\s*(?<options>[^\]]+))?](?:\{(?<label>[^}]*)})?/gi;

  const enrichers = CONFIG.TextEditor?.enrichers ?? TextEditor.enrichers;
  enrichers.push({
    pattern,
    enricher: async (match, { document } = {}) => {
      const settings = parseCounterMatch(match);
      if (!settings.key) return match[0];
      const doc = document ?? null;
      try {
        return createCounterElement(doc, settings);
      } catch (error) {
        console.error(`${MODULE_ID} | Failed to render counter`, error);
        return match[0];
      }
    },
  });
});
