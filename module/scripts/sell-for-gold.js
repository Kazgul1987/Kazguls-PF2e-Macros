const MODULE_ID = "kazguls-pf2e-macros";
const SELL_LOOT_ACTOR_NAME = "Sell";
const SELL_BUTTON_CLASS = "sell-for-gold__button";
const COIN_VALUES = { pp: 1000, gp: 100, sp: 10, cp: 1 };

const readCoinObject = (source) => {
  if (!source || typeof source !== "object") return 0;
  let total = 0;
  for (const [denom, multiplier] of Object.entries(COIN_VALUES)) {
    const direct = source[denom];
    const upper = source[typeof denom === "string" ? denom.toUpperCase() : denom];
    const value = Number(direct ?? upper);
    if (Number.isFinite(value)) total += value * multiplier;
  }
  return total;
};

const parseCoinString = (value) => {
  if (typeof value !== "string" || !value.trim()) return 0;
  if (game?.pf2e?.Coins?.fromString) {
    try {
      const coins = game.pf2e.Coins.fromString(value);
      const copper = coins?.copperValue ?? coins?.copper;
      if (Number.isFinite(copper)) return copper;
    } catch (error) {
      console.warn(`${MODULE_ID} | Failed to parse coin string via PF2e API`, error);
    }
  }

  let total = 0;
  let matched = false;
  const pattern = /(-?[\d.,]+)\s*(pp|gp|sp|cp)/gi;
  for (const match of value.matchAll(pattern)) {
    matched = true;
    const amount = Number(match[1]?.replace?.(",", "."));
    const denom = match[2]?.toLowerCase?.();
    if (!Number.isFinite(amount) || !denom) continue;
    const multiplier = COIN_VALUES[denom];
    if (!multiplier) continue;
    total += amount * multiplier;
  }

  if (matched) return total;

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

const coinsToCopper = (value) => {
  if (!value) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") return parseCoinString(value);

  if (game?.pf2e?.Coins && value instanceof game.pf2e.Coins) {
    const copper = value?.copperValue ?? value?.copper;
    if (Number.isFinite(copper)) return copper;
  }

  const copperValue = Number(value?.copperValue ?? value?.copper);
  if (Number.isFinite(copperValue)) return copperValue;

  let total = 0;
  if (typeof value === "object") {
    total += readCoinObject(value);

    if (value.value && typeof value.value === "object") {
      total += readCoinObject(value.value);
    } else if (typeof value.value === "string") {
      total += parseCoinString(value.value);
    } else if (Number.isFinite(Number(value.value))) {
      const denom = String(value.denomination ?? value.type ?? "").toLowerCase();
      const multiplier = COIN_VALUES[denom];
      if (multiplier) total += Number(value.value) * multiplier;
    }
  }

  return total;
};

const copperToCoins = (value) => {
  let remaining = Math.max(0, Math.floor(Number(value) || 0));
  const result = { pp: 0, gp: 0, sp: 0, cp: 0 };

  for (const [denom, multiplier] of Object.entries(COIN_VALUES)) {
    if (denom === "cp") continue;
    const amount = Math.floor(remaining / multiplier);
    result[denom] = amount;
    remaining -= amount * multiplier;
  }

  result.cp = remaining;
  return result;
};

const formatCoins = (coins) => {
  if (!coins || typeof coins !== "object") return "0 cp";
  const parts = [];
  for (const denom of ["pp", "gp", "sp", "cp"]) {
    const amount = Math.floor(Number(coins[denom]) || 0);
    if (amount) parts.push(`${amount} ${denom}`);
  }
  return parts.length ? parts.join(", ") : "0 cp";
};

const getItemQuantity = (item) => {
  const value = Number(item?.system?.quantity ?? item?.quantity ?? 0);
  return Number.isFinite(value) && value > 0 ? value : 0;
};

const getItemUnitPriceInCopper = (item) => {
  const price = item?.system?.price ?? item?.price;
  if (!price) return 0;

  const perRaw = Number(price?.per ?? 1);
  const per = Number.isFinite(perRaw) && perRaw > 0 ? perRaw : 1;

  const rawValue = coinsToCopper(price?.value ?? price);
  if (rawValue > 0) return rawValue / per;

  if (Number.isFinite(Number(price?.copperValue ?? price?.copper))) {
    return Number(price.copperValue ?? price.copper) / per;
  }

  if (typeof price?.value === "string") {
    const parsed = parseCoinString(price.value);
    if (parsed > 0) return parsed / per;
  }

  if (Number.isFinite(Number(price?.value))) {
    const denom = String(price?.denomination ?? price?.type ?? "").toLowerCase();
    const multiplier = COIN_VALUES[denom];
    if (multiplier) return Number(price.value) * multiplier / per;
  }

  if (typeof price === "string") {
    const parsed = parseCoinString(price);
    if (parsed > 0) return parsed / per;
  }

  return 0;
};

const performSale = async (actor, percentage) => {
  const items = Array.from(actor?.items ?? []);
  const sellable = items.filter((item) => getItemQuantity(item) > 0);
  if (!sellable.length) {
    ui.notifications?.warn?.(game.i18n.localize?.("PF2E.SellNoItems") ?? "There are no items to sell.");
    return;
  }

  const baseFactor = Math.max(0, Number(percentage) || 0) / 100;
  let copperTotal = 0;

  for (const item of sellable) {
    const quantity = getItemQuantity(item);
    if (!quantity) continue;
    const unitPrice = getItemUnitPriceInCopper(item);
    if (!(unitPrice > 0)) continue;
    const factor = item.type === "treasure" ? 1 : baseFactor;
    if (factor <= 0) continue;
    copperTotal += unitPrice * quantity * factor;
  }

  const copperEarned = Math.max(0, Math.floor(copperTotal + 0.0001));

  if (copperEarned > 0) {
    const currentCopper = coinsToCopper(actor.system?.currencies ?? {});
    const updatedCoins = copperToCoins(currentCopper + copperEarned);
    await actor.update({ "system.currencies": updatedCoins });
  }

  const itemIds = sellable.map((item) => item.id).filter(Boolean);
  if (itemIds.length) {
    await actor.deleteEmbeddedDocuments("Item", itemIds);
  }

  const message = copperEarned > 0 ? formatCoins(copperToCoins(copperEarned)) : "0 cp";
  const soldCount = sellable.length;
  ui.notifications?.info?.(
    `${game.i18n.localize?.("PF2E.SellPromptTitle") ?? "Sell for gold"}: ${soldCount} ${soldCount === 1 ? "item" : "items"} → ${message}`
  );
};

const openSellDialog = (actor) => {
  const content = `
    <form>
      <div class="form-group">
        <label>${game.i18n.localize?.("PF2E.SellPercentage") ?? "Sell percentage"}</label>
        <input type="number" name="sell-percentage" value="50" min="0" max="100" step="1" />
        <p class="notes">${game.i18n.localize?.("PF2E.SellTreasureNote") ?? "Treasure items are sold at 100%."}</p>
      </div>
    </form>
  `;

  const dialog = new Dialog({
    title: game.i18n.localize?.("PF2E.SellPromptTitle") ?? "Sell for gold",
    content,
    default: "sell",
    buttons: {
      cancel: {
        label: game.i18n.localize?.("Cancel") ?? game.i18n.localize?.("PF2E.Cancel") ?? "Cancel",
      },
      sell: {
        icon: "<i class=\"fas fa-coins\"></i>",
        label: game.i18n.localize?.("PF2E.Actions.Sell.Label") ?? "Sell",
        callback: (html) => {
          const input = html?.find?.('input[name="sell-percentage"]')?.[0];
          const percent = Number(input?.value ?? 50);
          performSale(actor, percent).catch((error) => {
            console.error(`${MODULE_ID} | Failed to sell items`, error);
            ui.notifications?.error?.(game.i18n.localize?.("ERROR") ?? "Failed to sell items.");
          });
        },
      },
    },
  });

  dialog.render(true);
};

Hooks.on("renderLootSheetPF2e", (sheet, html) => {
  const actor = sheet?.actor;
  if (!actor || actor.type !== "loot" || actor.name !== SELL_LOOT_ACTOR_NAME) return;

  const root = html instanceof HTMLElement ? html : html?.[0];
  if (!root) return;

  if (root.querySelector(`.${SELL_BUTTON_CLASS}`)) return;

  const button = document.createElement("button");
  button.type = "button";
  button.classList.add("header-button", SELL_BUTTON_CLASS);
  button.innerHTML = `<i class="fas fa-coins"></i> <span>${game.i18n.localize?.("PF2E.SellPromptTitle") ?? "Sell for gold"}</span>`;
  button.addEventListener("click", () => openSellDialog(actor));

  const headerActions = root.querySelector(".sheet-header .header-actions") ?? root.querySelector(".header-actions");
  if (headerActions) {
    headerActions.append(button);
    return;
  }

  const sidebarButtons = root.querySelector(".sheet-sidebar .sidebar-buttons");
  if (sidebarButtons) {
    sidebarButtons.append(button);
    return;
  }

  const sheetHeader = root.querySelector(".sheet-header") ?? root.querySelector("header");
  if (sheetHeader) {
    const container = document.createElement("div");
    container.classList.add("header-actions");
    container.appendChild(button);
    sheetHeader.appendChild(container);
  }
});
