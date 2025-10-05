const PICK_A_LOCK_TEMPLATE = "modules/kazguls-pf2e-macros/templates/pick-a-lock.hbs";

let SKILL_MOD = 0;

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

  const templateData = {
    skills,
    selectedSkill,
    skillMod: initialMod,
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

        if (skillModField) {
          skillModField.value = initialMod;
          skillModField.disabled = true;
        }

        if (skillSelect) {
          skillSelect.value = selectedSkill;
          skillSelect.addEventListener("change", () => {
            const skill = skillSelect.value;
            const mod = getSkillMod(actor, skill);
            if (skillModField) {
              skillModField.value = mod;
            }
            SKILL_MOD = mod;
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
            const computedMod = getSkillMod(actor, selectedSkill);

            if (skillModField) {
              const wasDisabled = skillModField.disabled;
              skillModField.value = computedMod;
              if (wasDisabled) skillModField.disabled = false;

              const formData = new FormData(form);
              if (wasDisabled) skillModField.disabled = true;

              const data = Object.fromEntries(formData.entries());
              data.skill = selectedSkill;
              data.skillMod = Number(computedMod);

              SKILL_MOD = data.skillMod;

              resolve(data);
              return;
            }

            const data = Object.fromEntries(new FormData(form).entries());
            data.skill = selectedSkill;
            data.skillMod = Number(computedMod);

            SKILL_MOD = data.skillMod;

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

async function performPickLockRoll(actor, { skill, skillMod, dc }) {
  const rollFormula = `1d20 + ${Number(skillMod) || 0}`;
  const roll = await (new Roll(rollFormula)).roll({ async: true });
  await roll.toMessage({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: `${game.i18n?.localize?.("PF2E.Actions.PickALock") ?? "Pick a Lock"} (${skill})`,
  });

  if (dc) {
    const dcResult = roll.total >= Number(dc) ? game.i18n?.localize?.("PF2E.Check.Succeeded") ?? "Success" : game.i18n?.localize?.("PF2E.Check.Failed") ?? "Failure";
    ui.notifications?.info?.(`${roll.total} vs DC ${dc}: ${dcResult}`);
  }
}

export async function pickALock(actor = canvas?.tokens?.controlled?.[0]?.actor ?? game.user?.character ?? null) {
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

export { SKILL_MOD, getSkillMod };
