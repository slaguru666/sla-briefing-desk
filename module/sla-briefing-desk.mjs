const MODULE_ID = "sla-briefing-desk";
const DRAFT_KEY = "briefingDraft";

let TABLES = null;

function getHtmlRoot(html) {
  return html instanceof HTMLElement ? html : html?.[0] ?? null;
}

async function loadTables() {
  if (TABLES) return TABLES;
  const response = await fetch("modules/sla-briefing-desk/data/briefing-tables.json");
  TABLES = await response.json();
  return TABLES;
}

function pick(array) {
  return Array.isArray(array) && array.length ? array[Math.floor(Math.random() * array.length)] : "";
}

function defaultBriefing() {
  return {
    jobName: "SLA Brief",
    missionType: "",
    sector: "",
    target: "",
    contact: "",
    payoff: "",
    complication: "",
    twist: "",
    notes: ""
  };
}

function getDraft() {
  return foundry.utils.mergeObject(defaultBriefing(), game.settings.get(MODULE_ID, DRAFT_KEY) ?? {});
}

async function setDraft(draft) {
  await game.settings.set(MODULE_ID, DRAFT_KEY, foundry.utils.mergeObject(defaultBriefing(), draft ?? {}));
}

function renderBriefingHtml(briefing) {
  return `
    <section class="sla-briefing-output">
      <h2>${foundry.utils.escapeHTML(briefing.jobName || "SLA Brief")}</h2>
      <p><strong>Mission Type:</strong> ${foundry.utils.escapeHTML(briefing.missionType)}</p>
      <p><strong>Sector:</strong> ${foundry.utils.escapeHTML(briefing.sector)}</p>
      <p><strong>Target:</strong> ${foundry.utils.escapeHTML(briefing.target)}</p>
      <p><strong>Contact:</strong> ${foundry.utils.escapeHTML(briefing.contact)}</p>
      <p><strong>Payoff:</strong> ${foundry.utils.escapeHTML(briefing.payoff)}</p>
      <p><strong>Complication:</strong> ${foundry.utils.escapeHTML(briefing.complication)}</p>
      <p><strong>Twist:</strong> ${foundry.utils.escapeHTML(briefing.twist)}</p>
      ${briefing.notes ? `<p><strong>Operational Notes:</strong> ${foundry.utils.escapeHTML(briefing.notes)}</p>` : ""}
    </section>
  `;
}

async function randomBriefing() {
  const tables = await loadTables();
  const missionType = pick(tables.missionTypes);
  const sector = pick(tables.sectors);
  const target = pick(tables.targets);
  return {
    jobName: `${missionType} - ${sector}`,
    missionType,
    sector,
    target,
    contact: pick(tables.contacts),
    payoff: pick(tables.payoffs),
    complication: pick(tables.complications),
    twist: pick(tables.twists),
    notes: ""
  };
}

class SlaBriefingDeskApp extends FormApplication {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "sla-briefing-desk-app",
      title: "SLA Briefing Desk",
      template: "modules/sla-briefing-desk/templates/briefing-desk.hbs",
      classes: ["sla-briefing-desk"],
      width: 640,
      height: "auto",
      closeOnSubmit: false,
      submitOnChange: false,
      resizable: true
    });
  }

  async getData() {
    return { briefing: getDraft() };
  }

  activateListeners(html) {
    super.activateListeners(html);
    html.find("[data-action='randomize']").on("click", async () => {
      await setDraft(await randomBriefing());
      this.render(false);
    });
    html.find("[data-action='chat']").on("click", async () => {
      const draft = await this._collectDraft();
      await setDraft(draft);
      await ChatMessage.create({
        user: game.user.id,
        speaker: { alias: "SLA Briefing Desk" },
        content: renderBriefingHtml(draft)
      });
    });
    html.find("[data-action='journal']").on("click", async () => {
      const draft = await this._collectDraft();
      await setDraft(draft);
      const journal = await JournalEntry.create({
        name: draft.jobName || "SLA Brief",
        ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE },
        pages: [
          {
            name: "Briefing",
            type: "text",
            text: { content: renderBriefingHtml(draft) }
          }
        ]
      });
      ui.notifications.info(`Created briefing journal: ${journal.name}`);
    });
  }

  async _collectDraft() {
    const fd = new foundry.applications.ux.FormDataExtended(this.form);
    return foundry.utils.mergeObject(getDraft(), fd.object);
  }

  async _updateObject(_event, formData) {
    await setDraft(formData);
    ui.notifications.info("SLA briefing draft saved.");
  }

  static open() {
    return new SlaBriefingDeskApp().render(true);
  }
}

function installJournalButton(app, html) {
  if (!game.user?.isGM) return;
  const root = getHtmlRoot(html);
  const header = root?.querySelector(".directory-header .header-actions, .directory-header .action-buttons");
  if (!header || header.querySelector(".sla-briefing-desk-open")) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "sla-briefing-desk-open";
  button.innerHTML = `<i class="fas fa-file-lines"></i> Briefing Desk`;
  button.addEventListener("click", () => SlaBriefingDeskApp.open());
  header.appendChild(button);
}

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, DRAFT_KEY, {
    scope: "world",
    config: false,
    type: Object,
    default: defaultBriefing()
  });

  game.settings.registerMenu(MODULE_ID, "briefingDeskMenu", {
    name: "SLA Briefing Desk",
    label: "Open Briefing Desk",
    hint: "Draft or randomize an SLA mission briefing.",
    icon: "fas fa-file-lines",
    type: SlaBriefingDeskApp,
    restricted: true
  });
});

Hooks.on("renderJournalDirectory", installJournalButton);
