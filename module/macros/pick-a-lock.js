// Pathfinder 2e Lock Picker v2.8.2 (Full)
// Features:
// - Mehrere Bonuszeilen (Item/Status/Circumstance) mit PF2e-Stacking
// - Presets: Poor/Simple/Average/Good/Superior (setzt DC & Erfolge automatisch; "Eigene Werte" entsperrt)
// - Skill-Auswahl (Thievery, Occultism, Arcana, Religion, Society, Crafting, Benutzerdefiniert)
// - Sneaky Key (erster Erfolg +1 Fortschritt)
// - Silent-/Foundry-Würfel
// - Request-Roll: Inline @Check-Link per Drag & Drop; Button würfelt bis Erfolg/Krit oder Krit-Fehlschlag
// - Robuste Skill-Erkennung (neue/alte PF2e-Versionen)
// Icon: static/icons/equipment/held-items/key-short-gold.webp

/******************** Helpers ********************/
function getSelectedActor() {
  return canvas.tokens?.controlled[0]?.actor ?? game.user.character ?? null;
}

// Robust: Holt den Skillmodifikator aus neuen und alten PF2e-Versionen
function getSkillMod(actor, key) {
  if (!actor) return 0;

  const alias = {
    acrobatics: ["acrobatics","acr"], arcana:["arcana","arc"], athletics:["athletics","ath"],
    crafting:["crafting","cra"], deception:["deception","dec"], diplomacy:["diplomacy","dip"],
    intimidation:["intimidation","itm"], medicine:["medicine","med"], nature:["nature","nat"],
    occultism:["occultism","occ"], performance:["performance","prf"], religion:["religion","rel"],
    society:["society","soc"], stealth:["stealth","ste"], survival:["survival","sur"],
    thievery:["thievery","thi"], perception:["perception","per"]
  };

  const keys = [...(alias[key] ?? []), key].filter((v, i, a) => typeof v === "string" && a.indexOf(v) === i);

  // 1) Neue PF2e-API
  for (const k of keys) {
    try {
      const stat = actor.getStatistic?.(k);
      const v = stat?.check?.mod ?? stat?.mod;
      if (typeof v === "number") return v;
    } catch {}
  }

  // 2) Klassisch (actor.skills)
  for (const k of keys) {
    const s = actor?.skills?.[k];
    const v = s?.check?.mod ?? s?.totalModifier ?? s?.mod;
    if (typeof v === "number") return v;
  }

  // 3) Systemdaten (actor.system.skills)
  for (const k of keys) {
    const s = actor?.system?.skills?.[k];
    const v = s?.check?.mod ?? s?.totalModifier ?? s?.mod ?? s?.value;
    if (typeof v === "number") return v;
  }

  // 4) Fallback auf Attribut
  const abilityBySkill = {
    thievery:"dex", stealth:"dex", acrobatics:"dex",
    athletics:"str", religion:"wis", medicine:"wis", survival:"wis", perception:"wis",
    arcana:"int", occultism:"int", crafting:"int", society:"int", nature:"wis",
    deception:"cha", diplomacy:"cha", intimidation:"cha", performance:"cha"
  };
  const abil = abilityBySkill[key] ?? "dex";
  return actor?.abilities?.[abil]?.mod ?? actor?.system?.abilities?.[abil]?.mod ?? 0;
}

const rollD20Silent = () => Math.floor(Math.random()*20)+1;
const rollD20Foundry = () => {
  const r = new Roll("1d20").evaluate({async:false});
  const face = Number(r.dice?.[0]?.results?.[0]?.result ?? r.total);
  return Number.isFinite(face) ? face : rollD20Silent();
};
const num = (v,f=0)=>{ const n = Number(v); return Number.isNaN(n) ? f : n; };
const on  = (v)=>!!v && (v==="on" || v===true);

// PF2e-Stacking: Item/Status → bester Einzelwert; Circumstance → Summe
function aggregateTyped(values, types) {
  const list = values.map((v,i)=>({v:Number(v), t:types[i]})).filter(x=>Number.isFinite(x.v));
  const by = t => list.filter(x=>x.t===t).map(x=>x.v);
  const pickOneByAbs = arr => arr.reduce((acc,v)=> (acc===undefined || Math.abs(v)>Math.abs(acc)) ? v : acc, 0) || 0;
  return {
    itemEff:   pickOneByAbs(by("item")),
    statusEff: pickOneByAbs(by("status")),
    circSum:   by("circumstance").reduce((a,b)=>a+b,0)
  };
}

/******************** Presets ********************/
const LOCK_PRESETS = {
  "Poor (level 0)":      { dc: 15, needed: 2 },
  "Simple (level 1)":    { dc: 20, needed: 3 },
  "Average (level 3)":   { dc: 25, needed: 4 },
  "Good (level 9)":      { dc: 30, needed: 5 },
  "Superior (level 17)": { dc: 40, needed: 6 },
  "Eigene Werte":        { dc: 20, needed: 3 }
};

/******************** Actor ********************/
const actor = getSelectedActor();
if (!actor) return ui.notifications.warn("Bitte einen Token auswählen oder ein Charakterblatt öffnen.");
const DEFAULT_SKILL_KEY = "thievery";
const DEFAULT_SKILL_MOD = getSkillMod(actor, DEFAULT_SKILL_KEY);

/******************** Dialog ********************/
const dialogHTML = `
<form>
  <div class="form-group"><label>Charakter</label><div>${actor.name}</div></div>

  <div class="form-group"><label>Skill</label>
    <select name="skill">
      <option value="thievery">Thievery</option>
      <option value="occultism">Occultism</option>
      <option value="arcana">Arcana</option>
      <option value="religion">Religion</option>
      <option value="society">Society</option>
      <option value="crafting">Crafting</option>
      <option value="custom">Benutzerdefiniert</option>
    </select>
  </div>

  <div class="form-group"><label>Skill-Modifikator</label>
    <input type="number" name="skillmod" value="${DEFAULT_SKILL_MOD}" disabled/>
    <small>(automatisch; bei „Benutzerdefiniert“ editierbar)</small>
  </div>

  <fieldset style="border:1px solid #888; padding:.5rem; border-radius:.5rem">
    <legend>Zusätzliche Boni</legend>
    <div id="bonus-list"></div>
    <button type="button" name="addBonus">+ Bonus hinzufügen</button>
    <small>Stacking: Item/Status → bester Einzelwert; Circumstance → Summe.</small>
  </fieldset>

  <div class="form-group"><label>Schlosstyp</label>
    <select name="locktype">
      ${Object.keys(LOCK_PRESETS).map(k=>`<option value="${k}">${k}</option>`).join("")}
    </select>
  </div>

  <div class="form-group"><label>DC</label><input type="number" name="dc" value="${LOCK_PRESETS["Superior (level 17)"].dc}"/></div>
  <div class="form-group"><label>Benötigte Erfolge</label><input type="number" name="needed" value="${LOCK_PRESETS["Superior (level 17)"].needed}"/></div>
  <div class="form-group"><label>Minuten pro Versuch</label><input type="number" name="minutes" value="1" min="0"/></div>
  <div class="form-group"><label>Max. Versuche (0 = Auto)</label><input type="number" name="max" value="0" min="0"/></div>
  <div class="form-group"><label>Kritischer Fehlschlag bricht ab?</label><input type="checkbox" name="stopOnCritFail" checked/></div>
  <div class="form-group"><label>Sneaky Key aktiv?</label><input type="checkbox" name="sneaky"/></div>
  <div class="form-group"><label>Whisper an mich?</label><input type="checkbox" name="whisper"/></div>
  <div class="form-group"><label>Silent-Modus?</label><input type="checkbox" name="silent" checked/></div>
  <hr/>
  <div class="form-group">
    <label><input type="checkbox" name="reqEnable"/> Request-Roll aktivieren</label>
    <div id="reqContainer" style="display:none;margin-top:.25rem">
      <div style="font-size:12px;margin-bottom:.25rem">
        Ziehe einen Inline-Check hier rein (z. B. <code>@Check[type:thievery|dc:40]{Pick a Lock}</code>).
      </div>
      <div id="reqDrop" style="border:1px dashed #888;padding:.5rem;min-height:2.5rem;border-radius:.25rem;background:#f7f7f7"
           contenteditable="true" spellcheck="false"></div>
      <input type="hidden" name="reqPayload" value=""/>
    </div>
  </div>
</form>
`;

const form = await new Promise(resolve => {
  new Dialog({
    title: "Pick a Lock – Hintergrundwürfe",
    content: dialogHTML,
    buttons: {
      ok: { label: "Start", callback: html => {
        const formEl = html[0].querySelector("form");
        const fd = new FormData(formEl);
        const data = Object.fromEntries(fd.entries());
        // Bonuslisten einsammeln
        data.bonusValues = fd.getAll("bonusValue").map(x=>Number(x));
        data.bonusTypes  = fd.getAll("bonusType");
        resolve(data);
      }},
      cancel: { label: "Abbrechen", callback: ()=>resolve(null) }
    },
    default: "ok",
    render: (html) => {
      const $html = html;
      const $skill = $html.find('select[name="skill"]');
      const $skillmod = $html.find('input[name="skillmod"]');
      const $locktype = $html.find('select[name="locktype"]');
      const $dc = $html.find('input[name="dc"]');
      const $need = $html.find('input[name="needed"]');

      // Bonus-UI
      const $bonusList = $html.find('#bonus-list');
      const $addBtn = $html.find('button[name="addBonus"]');
      const makeRow = (value=0, type="item")=>{
        const row = document.createElement("div");
        row.className = "bonus-row";
        row.style.cssText = "display:flex;gap:.5rem;align-items:center;margin-bottom:.25rem";
        row.innerHTML = `
          <input type="number" name="bonusValue" value="${value}" style="width:6rem"/>
          <select name="bonusType" style="flex:1">
            <option value="item"${type==="item"?" selected":""}>Item</option>
            <option value="status"${type==="status"?" selected":""}>Status</option>
            <option value="circumstance"${type==="circumstance"?" selected":""}>Circumstance</option>
          </select>
          <button type="button" class="del-bonus">🗑</button>
        `;
        row.querySelector(".del-bonus").addEventListener("click", ()=>row.remove());
        $bonusList[0].appendChild(row);
      };
      makeRow(0,"item");
      $addBtn.on("click", ()=>makeRow(0,"circumstance"));

      // Preset/Skill Handling
      const applySkill = () => {
        const key = $skill.val();
        if (key === "custom") $skillmod.prop("disabled", false);
        else { $skillmod.val(getSkillMod(actor, key)).prop("disabled", true); }
      };
      const applyPreset = () => {
        const key = $locktype.val();
        const p = LOCK_PRESETS[key] ?? LOCK_PRESETS["Simple (level 1)"];
        if (key !== "Eigene Werte") { $dc.val(p.dc).prop("disabled", true); $need.val(p.needed).prop("disabled", true); }
        else { $dc.prop("disabled", false); $need.prop("disabled", false); }
      };
      applySkill(); applyPreset();
      $skill.on("change", applySkill);
      $locktype.on("change", applyPreset);

      // Request-Roll-UI
      const reqEnable = $html.find('input[name="reqEnable"]')[0];
      const reqContainer = $html.find('#reqContainer')[0];
      const reqDrop = $html.find('#reqDrop')[0];
      const reqPayload = $html.find('input[name="reqPayload"]')[0];

      reqEnable.addEventListener("change", ()=> reqContainer.style.display = reqEnable.checked ? "block" : "none");

      const extractInlineCheck = (htmlText) => {
        const m = (htmlText || "").match(/@Check\[[^\]]+\][^{]*(\{[^}]*\})?/i);
        return m ? m[0] : (htmlText || "").trim();
      };
      reqDrop.addEventListener("drop", ev => {
        ev.preventDefault();
        const htmlData = ev.dataTransfer.getData("text/html");
        const textData = ev.dataTransfer.getData("text/plain");
        const grabbed = extractInlineCheck(htmlData || textData || "");
        reqDrop.innerText = grabbed || "";
        reqPayload.value = grabbed || "";
      });
      reqDrop.addEventListener("paste", ev => {
        const text = (ev.clipboardData || window.clipboardData).getData('text');
        const grabbed = extractInlineCheck(text || "");
        ev.preventDefault();
        reqDrop.innerText = grabbed || "";
        reqPayload.value = grabbed || "";
      });
      reqDrop.addEventListener("input", ()=> { reqPayload.value = reqDrop.innerText.trim(); });
    }
  }).render(true);
});
if (!form) return;

/******************** Parse Grunddaten ********************/
const skillKey = form.skill;
const SKILL_MOD = num(form.skillmod, 0);
const preset  = LOCK_PRESETS[form.locktype] ?? LOCK_PRESETS["Simple (level 1)"];
let DC      = (form.locktype !== "Eigene Werte") ? preset.dc     : num(form.dc, preset.dc);
let NEEDED  = (form.locktype !== "Eigene Werte") ? preset.needed : Math.max(1, num(form.needed, preset.needed));
const MINS    = Math.max(0, num(form.minutes, 1));
const STOPCF  = on(form.stopOnCritFail);
let sneaky    = on(form.sneaky);
const WHISPER = on(form.whisper);
const SILENT  = on(form.silent);

const bonusValues = Array.isArray(form.bonusValues) ? form.bonusValues : [];
const bonusTypes  = Array.isArray(form.bonusTypes)  ? form.bonusTypes  : [];
const { itemEff, statusEff, circSum } = aggregateTyped(bonusValues, bonusTypes);

const MOD = SKILL_MOD + itemEff + statusEff + circSum;
const d20 = () => (SILENT ? rollD20Silent() : rollD20Foundry());

let MAX_TRIES = Math.max(0, num(form.max, 0));
if (!MAX_TRIES) MAX_TRIES = Math.min(300, Math.max(30, NEEDED * 10));
const HARD_CAP = 1000;

// Machbarkeit (inkl. nat20-Shift)
const bestTotal = MOD + 20;
const successPossible = (bestTotal >= DC) || (bestTotal >= DC - 10);
if (!successPossible) {
  return ui.notifications.error(`Mit ${skillKey} ${MOD>=0?"+":""}${MOD} gegen DC ${DC} ist kein Fortschritt möglich (selbst mit nat 20 nur Fehlschlag).`);
}

/******************** Lock-Pick Simulation ********************/
function degree(total, dc, face) {
  let deg;
  if (total >= dc + 10) deg = 3; else if (total >= dc) deg = 2;
  else if (total <= dc - 10) deg = 0; else deg = 1;
  if (face === 20) deg = Math.min(3, deg + 1);
  if (face === 1)  deg = Math.max(0, deg - 1);
  return deg; // 0 CF, 1 F, 2 S, 3 CS
}

let progress=0, tries=0, minutes=0, broken=false;
const log=[];
while (progress < NEEDED && tries < MAX_TRIES && tries < HARD_CAP) {
  tries++;
  const face = d20();
  const total = face + MOD;
  const deg = degree(total, DC, face);
  let step=0, note="";
  if (deg===3){ step=2; note="Kritischer Erfolg (+2)"; }
  else if (deg===2){ step=1; note="Erfolg (+1)"; }
  else if (deg===1){ step=0; note="Fehlschlag"; }
  else { note="Kritischer Fehlschlag – Werkzeuge beschädigt!"; broken=true; if (STOPCF){ minutes+=MINS; log.push({tries, face, total, deg, step, note}); break; } }
  if (sneaky && (deg===2 || deg===3)) { step += 1; note += " | Sneaky Key: +1 Fortschritt"; sneaky=false; }
  progress += step; minutes  += MINS;
  log.push({tries, face, total, deg, step, note});
  if (progress >= NEEDED) break;
}

/******************** Chat Output + Request-Roll Button ********************/
const skillLabelMap = {thievery:"Thievery",occultism:"Occultism",arcana:"Arcana",religion:"Religion",society:"Society",crafting:"Crafting",custom:"Benutzerdefiniert"};
const bonusBreakdown = `<small>Effektiv: Item ${itemEff>=0?"+":""}${itemEff}, Status ${statusEff>=0?"+":""}${statusEff}, Circumstance ${circSum>=0?"+":""}${circSum}</small>`;
const finish =
  (progress >= NEEDED) ? `<b style="color:green">Schloss geöffnet</b>` :
  (broken && STOPCF)    ? `<b style="color:#b00">Abbruch: Kritischer Fehlschlag (Werkzeugbruch)</b>` :
  (tries >= MAX_TRIES)  ? `<b style="color:orange">Abbruch: Versuchs-Limit erreicht</b>` :
                          `<b>Nicht geschafft</b>`;

const rows = log.map(r=>{
  const color = (r.deg===3?"#0a0":r.deg===2?"#060":r.deg===0?"#b00":"#666");
  const grad  = ["Krit-Fehl","Fehl","Erfolg","Krit-Erfolg"][r.deg];
  return `<tr>
    <td style="text-align:right">${r.tries}</td>
    <td style="text-align:center">${r.face}</td>
    <td style="text-align:right">${r.total}</td>
    <td style="color:${color}">${grad}</td>
    <td style="text-align:right">+${r.step}</td>
    <td>${r.note}</td>
  </tr>`;
}).join("");

// Request-Roll
const reqEnabled = on(form.reqEnable);
const reqPayload = (form.reqPayload ?? "").trim();

function parseInlineCheckTag(s) {
  const tag = (/@Check\[(.*?)\]/i).exec(s);
  if (!tag) return null;
  const inside = tag[1];
  const parts = inside.split("|").map(t=>t.trim());
  const out = {};
  for (const p of parts) {
    const [k, v] = p.split(":");
    if (!k || v===undefined) continue;
    out[k.trim().toLowerCase()] = v.trim().toLowerCase();
  }
  const type = out.type || "thievery";
  const dc = Number(out.dc ?? "0");
  return { type, dc, raw: s };
}

let reqSectionHTML = "";
let reqData = null;
if (reqEnabled) {
  reqData = parseInlineCheckTag(reqPayload);
  if (reqData && Number.isFinite(reqData.dc) && reqData.dc>0) {
    const pretty = reqPayload.replace(/</g,"&lt;").replace(/>/g,"&gt;");
    reqSectionHTML = `
      <hr/>
      <div><b>Request-Roll:</b> <code>${pretty}</code></div>
      <button class="pf2e-reqroll-btn" data-msg="__MSGID__" data-type="${reqData.type}" data-dc="${reqData.dc}">Würfeln bis Erfolg/KritErfolg oder KritFehlschlag</button>
      <div class="pf2e-reqroll-note" style="font-size:12px;opacity:.8">Bitte einen Token auswählen; nat20/nat1 Erfolgsgrad-Shift aktiv.</div>
    `;
  } else {
    reqSectionHTML = `
      <hr/>
      <div style="color:#b00"><b>Request-Roll:</b> Ungültiger oder fehlender @Check-Tag.</div>
    `;
  }
}

const message = await ChatMessage.create({
  speaker: ChatMessage.getSpeaker({actor}),
  content: `
    <div class="pf2e chat-card">
      <header class="card-header flexrow">
        <img src="static/icons/equipment/held-items/key-short-gold.webp" width="36" height="36"/>
        <h3>Pick a Lock – Hintergrundwürfe</h3>
      </header>
      <section class="card-content">
        <p><b>Skill:</b> ${skillLabelMap[skillKey] ?? skillKey} | <b>Wurfmod. gesamt:</b> ${MOD>=0?"+":""}${MOD}<br/>${bonusBreakdown}</p>
        <p><b>Schlosstyp:</b> ${form.locktype} | <b>DC:</b> ${DC} | <b>Erfolge:</b> ${NEEDED} | <b>Modus:</b> ${SILENT?"Silent":"Foundry"}</p>
        <p><b>Versuche:</b> ${tries} | <b>Fortschritt:</b> ${progress}/${NEEDED} | <b>Zeit:</b> ${minutes} Min.</p>
        <p>${finish}${broken && STOPCF ? "<br/><i>Werkzeuge beschädigt – Ersatzpicks nötig.</i>" : ""}</p>
        <details><summary>Würfelverlauf</summary>
          <table style="width:100%; border-collapse:collapse;">
            <thead><tr><th>#</th><th>d20</th><th>Gesamt</th><th>Grad</th><th>Fortschr.</th><th>Notiz</th></tr></thead>
            <tbody>${rows || "<tr><td colspan='6'>Keine Versuche</td></tr>"}</tbody>
          </table>
        </details>
        ${reqSectionHTML.replace("__MSGID__", "PENDING")}
      </section>
    </div>
  `,
  whisper: (WHISPER ? [game.user.id] : []),
  flags: { "pf2e-lockpicker": { req: (reqData ? { type: reqData.type, dc: reqData.dc } : null) } }
});

// Button-Handler binden
const mId = message.id;
const html = await message.getHTML();
html.find(".pf2e-reqroll-btn").attr("data-msg", mId);

// Einmaliger Hook: Button klickt → würfeln bis Erfolg/Krit oder Krit-Fehlschlag
Hooks.on("renderChatMessage", function handler(msg, jHtml) {
  if (msg.id !== mId) return;
  const btn = jHtml.find(".pf2e-reqroll-btn");
  if (!btn.length) return;

  btn.off("click").on("click", async ()=>{
    const clickActor = canvas.tokens?.controlled[0]?.actor ?? game.user.character;
    if (!clickActor) return ui.notifications.warn("Bitte einen Token auswählen (für Request-Roll).");

    const type = btn.attr("data-type") || msg.getFlag("pf2e-lockpicker","req")?.type || "thievery";
    const dc   = Number(btn.attr("data-dc") || msg.getFlag("pf2e-lockpicker","req")?.dc || 0);
    if (!Number.isFinite(dc) || dc<=0) return ui.notifications.error("Request-Roll: Ungültiger DC.");

    const mod = getSkillMod(clickActor, type) ?? 0;
    const SIL = true; // Request-Rolls leise
    const d20f = ()=> SIL ? rollD20Silent() : rollD20Foundry();

    function deg(total, dc, face) {
      let g;
      if (total >= dc+10) g=3; else if (total>=dc) g=2; else if (total<=dc-10) g=0; else g=1;
      if (face===20) g=Math.min(3,g+1);
      if (face===1)  g=Math.max(0,g-1);
      return g;
    }

    const maxLoops = 200;
    let i=0; const logs=[];
    let stopReason = "—";
    while (i<maxLoops) {
      i++;
      const face = d20f();
      const total = face + mod;
      const g = deg(total, dc, face);
      logs.push({i, face, total, g});
      if (g===3) { stopReason = "Kritischer Erfolg"; break; }
      if (g===2) { stopReason = "Erfolg"; break; }
      if (g===0) { stopReason = "Kritischer Fehlschlag"; break; }
      // g===1 → weiter
    }

    const rows = logs.map(r=>{
      const color = (r.g===3?"#0a0":r.g===2?"#060":r.g===0?"#b00":"#666");
      const grad  = ["Krit-Fehl","Fehl","Erfolg","Krit-Erfolg"][r.g];
      return `<tr>
        <td style="text-align:right">${r.i}</td>
        <td style="text-align:center">${r.face}</td>
        <td style="text-align:right">${r.total}</td>
        <td style="color:${color}">${grad}</td>
      </tr>`;
    }).join("");

    const out = `
      <div class="pf2e chat-card">
        <header class="card-header flexrow">
          <img src="static/icons/equipment/held-items/key-short-gold.webp" width="36" height="36"/>
          <h3>Request-Roll Ergebnis – ${clickActor.name}</h3>
        </header>
        <section class="card-content">
          <p><b>Check:</b> ${type} vs. DC ${dc} | <b>Mod:</b> ${mod>=0?"+":""}${mod}</p>
          <p><b>Stop:</b> ${stopReason} &nbsp; | &nbsp; <b>Würfe:</b> ${logs.length}</p>
          <details><summary>Verlauf</summary>
            <table style="width:100%; border-collapse:collapse;">
              <thead><tr><th>#</th><th>d20</th><th>Gesamt</th><th>Grad</th></tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </details>
        </section>
      </div>
    `;
    ChatMessage.create({ speaker: ChatMessage.getSpeaker({actor: clickActor}), content: out });
  });

  // nur einmal binden
  Hooks.off("renderChatMessage", handler);
});

/******************** GM-Whisper bei Werkzeugbruch ********************/
if (broken && STOPCF) {
  const gmIds = game.users.filter(u=>u.isGM).map(u=>u.id);
  if (gmIds.length) {
    ChatMessage.create({
      speaker: ChatMessage.getSpeaker({actor}),
      content: `<b>Hinweis:</b> ${actor.name} hat beim Schloss einen kritischen Fehlschlag (Werkzeuge beschädigt).`,
      whisper: gmIds
    });
  }
}
