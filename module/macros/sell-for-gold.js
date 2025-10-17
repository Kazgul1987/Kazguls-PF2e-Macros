const SELL_LOOT_ACTOR_NAME = "Sell";
const SELL_PROCEEDS_DEFAULT_NAME = "Sale Proceeds";
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
      console.warn("Sell macro | Failed to parse coin string via PF2e API", error);
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

const getFolderId = (folder) => {
  if (!folder) return null;
  if (typeof folder === "string") return folder;
  if (typeof folder === "object") {
    if (typeof folder.id === "string") return folder.id;
    if (typeof folder._id === "string") return folder._id;
  }
  return null;
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
    if (multiplier) return (Number(price.value) * multiplier) / per;
  }

  if (typeof price === "string") {
    const parsed = parseCoinString(price);
    if (parsed > 0) return parsed / per;
  }

  return 0;
};

const performSale = async (actor, percentage) => {
  const items = Array.from(actor?.items ?? []);
  let sellable = items.filter((item) => getItemQuantity(item) > 0);

  let saleTreasureItemName =
    game.i18n.localize?.("PF2E.SellProceedsItemName") ??
    game.i18n.localize?.("PF2E.SellProceeds") ??
    SELL_PROCEEDS_DEFAULT_NAME;

  let sellFolderId = null;
  const sellFolderItem = items.find((item) => item?.folder?.name === SELL_LOOT_ACTOR_NAME);
  sellFolderId = getFolderId(sellFolderItem?.folder);

  if (!sellFolderId) {
    const folderCollections = [actor.items?.directory?.folders, actor.folders, game?.folders];
    for (const collection of folderCollections) {
      if (typeof collection?.find !== "function") continue;
      const found = collection.find((folder) => {
        if (!folder) return false;
        if (folder?.name !== SELL_LOOT_ACTOR_NAME) return false;
        if (folder?.type && folder.type !== "Item") return false;
        return true;
      });
      if (found?.id) {
        sellFolderId = found.id;
        break;
      }
    }
  }

  const treasureItems = actor.items.filter((item) => item.type === "treasure");
  let existingTreasure = null;

  if (sellFolderId) {
    existingTreasure = treasureItems.find((item) => getFolderId(item.folder) === sellFolderId);
  }

  if (!existingTreasure) {
    existingTreasure = treasureItems.find((item) => item.folder?.name === SELL_LOOT_ACTOR_NAME);
  }

  if (!existingTreasure) {
    existingTreasure = treasureItems.find((item) => item.name === saleTreasureItemName);
  }

  if (existingTreasure) {
    saleTreasureItemName = existingTreasure.name ?? saleTreasureItemName;
    sellable = sellable.filter((item) => item.id !== existingTreasure.id);
  }

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

  let saleTreasureItem = existingTreasure ?? null;
  let totalCopperAfterSale = 0;

  if (copperEarned > 0) {
    if (existingTreasure) {
      const existingCopper = coinsToCopper(existingTreasure.system?.price?.value);
      totalCopperAfterSale = existingCopper + copperEarned;
      const updatedCoins = copperToCoins(totalCopperAfterSale);
      const updatedItems = await actor.updateEmbeddedDocuments("Item", [
        { _id: existingTreasure.id, "system.price.value": updatedCoins },
      ]);
      saleTreasureItem = updatedItems?.[0] ?? existingTreasure;
      saleTreasureItemName = saleTreasureItem?.name ?? saleTreasureItemName;
    } else {
      totalCopperAfterSale = copperEarned;
      const newItemData = {
        name: saleTreasureItemName,
        type: "treasure",
        system: {
          quantity: 1,
          price: {
            value: copperToCoins(totalCopperAfterSale),
            per: 1,
          },
        },
      };
      if (sellFolderId) newItemData.folder = sellFolderId;
      const createdItems = await actor.createEmbeddedDocuments("Item", [newItemData]);
      saleTreasureItem = createdItems?.[0] ?? null;
      saleTreasureItemName = saleTreasureItem?.name ?? saleTreasureItemName;
    }
  }

  const itemIds = sellable.map((item) => item.id).filter(Boolean);
  if (itemIds.length) {
    await actor.deleteEmbeddedDocuments("Item", itemIds);
  }

  const message =
    totalCopperAfterSale > 0 && saleTreasureItemName
      ? `${saleTreasureItemName}: ${formatCoins(copperToCoins(totalCopperAfterSale))}`
      : copperEarned > 0
      ? formatCoins(copperToCoins(copperEarned))
      : "0 cp";
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
            console.error("Sell macro | Failed to sell items", error);
            ui.notifications?.error?.(game.i18n.localize?.("ERROR") ?? "Failed to sell items.");
          });
        },
      },
    },
  });

  dialog.render(true);
};

const resolveSellActor = () => {
  const controlled = canvas?.tokens?.controlled?.[0]?.actor;
  if (controlled?.type === "loot" && controlled.name === SELL_LOOT_ACTOR_NAME) return controlled;

  const openSheet = Object.values(ui.windows ?? {}).find(
    (app) => app?.actor?.type === "loot" && app?.actor?.name === SELL_LOOT_ACTOR_NAME
  );
  if (openSheet?.actor) return openSheet.actor;

  const sidebarActor = game?.actors?.getName?.(SELL_LOOT_ACTOR_NAME);
  if (sidebarActor?.type === "loot") return sidebarActor;

  ui.notifications?.warn?.(`Sell macro | Could not find the "${SELL_LOOT_ACTOR_NAME}" loot actor.`);
  return null;
};

const actor = resolveSellActor();
if (actor) openSellDialog(actor);
