const statusEl = document.getElementById("status");
const emptyEl = document.getElementById("empty-state");
const dayEl = document.getElementById("day");
const errorEl = document.getElementById("error");
const errorMessageEl = document.getElementById("error-message");
const eyebrowEl = document.getElementById("eyebrow");
const newYorkTimeEl = document.getElementById("ny-time");
const dayNumberEl = document.getElementById("day-number");
const weekdayEl = document.getElementById("weekday");
const monthEl = document.getElementById("month");
const yearEl = document.getElementById("year");
const scoreboardEl = document.getElementById("scoreboard");
const metricDetailEl = document.getElementById("metric-detail-panel");
const contentEl = document.getElementById("content");
const todayContentEl = document.getElementById("today-content");
const dayTabEls = Array.from(document.querySelectorAll("[data-tab]"));
const dayPanelEls = Array.from(document.querySelectorAll("[data-panel]"));

const params = new URLSearchParams(window.location.search);
const day = params.get("day");
const rev = params.get("v") || params.get("rev") || "";
const requestedTab = params.get("tab") || "";
const todayPayloadDay = params.get("today") || todayInNewYork();
const key = new URLSearchParams(window.location.hash.slice(1)).get("key");
let newYorkClockTimer = null;

startNewYorkClock();

if (day && key) {
  openDay(day, key);
}

async function openDay(dayValue, keyValue) {
  try {
    if (statusEl) {
      statusEl.textContent = "Opening today's private recap.";
    }
    const cacheBuster = rev ? `?v=${encodeURIComponent(rev)}` : "";
    const response = await fetch(`./days/${encodeURIComponent(dayValue)}.json.enc${cacheBuster}`, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`No hosted payload found for ${dayValue}.`);
    }

    const encrypted = await response.json();
    const payload = await decryptPayload(encrypted, keyValue);
    renderPayload(payload);
  } catch (error) {
    showError(error instanceof Error ? error.message : "Unknown error.");
  }
}

async function decryptPayload(encrypted, keyValue) {
  const cryptoKey = await window.crypto.subtle.importKey(
    "raw",
    base64UrlToBytes(keyValue),
    "AES-GCM",
    false,
    ["decrypt"]
  );

  const decrypted = await window.crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64UrlToBytes(encrypted.iv) },
    cryptoKey,
    base64UrlToBytes(encrypted.data)
  );

  const text = new TextDecoder().decode(decrypted);
  return JSON.parse(text);
}

function renderPayload(payload) {
  document.title = `${payload.title || "Ax's Day"} | Stew Updates`;
  emptyEl.hidden = true;
  errorEl.hidden = true;
  dayEl.hidden = false;

  const dateParts = getDateParts(todayInNewYork());
  eyebrowEl.textContent = "Ax's Day";
  dayNumberEl.textContent = dateParts.day;
  weekdayEl.textContent = dateParts.weekday;
  monthEl.textContent = dateParts.month;
  yearEl.textContent = dateParts.year;
  statusEl.textContent = payload.oneLine || "A day worth remembering.";
  scoreboardEl.innerHTML = "";
  metricDetailEl.innerHTML = "";
  metricDetailEl.hidden = true;

  const markdownSections = parseMarkdownSections(payload.markdown || "");
  const todaySectionKey = "gentle-carry-forward";
  const metricSectionMap = {
    Calendar: "Calendar Moments",
    "Work Made": "Work Made",
    Artifacts: "Artifacts",
    "Public Seeds": "Public-Candidate Seeds"
  };
  const sectionsByHeading = new Map(markdownSections.map((section) => [normalizeHeading(section.heading), section.html]));
  const metricSectionKeys = new Set(Object.values(metricSectionMap).map((heading) => normalizeHeading(heading)));
  const dashboardHiddenSectionKeys = new Set([
    "not-public-sensitive",
    "patterns-and-signals"
  ]);

  const metrics = [
    ["Calendar", payload.counts?.calendar ?? 0, "Meetings and commitments captured"],
    ["Work Made", payload.counts?.work ?? 0, "Things moved forward"],
    ["Artifacts", payload.counts?.artifacts ?? 0, "Receipts worth keeping"],
    ["Public Seeds", payload.counts?.publicSeeds ?? 0, "Ideas to revisit"]
  ];

  for (const [label, value, note] of metrics) {
    const card = document.createElement("article");
    card.className = "metric";
    card.setAttribute("role", "button");
    card.setAttribute("tabindex", "0");
    card.setAttribute("aria-expanded", "false");
    card.dataset.metric = label;
    const sectionHtml = sectionsByHeading.get(normalizeHeading(metricSectionMap[label])) || "";
    const summaryHtml = `
      <div class="metric-summary">
        <strong>${escapeHtml(String(value))}</strong>
        <span>${escapeHtml(label)}</span>
        <em>${escapeHtml(note)}</em>
      </div>
    `;
    card.dataset.summaryHtml = summaryHtml;
    card.dataset.detailHtml = renderMetricDetail(label, sectionHtml);
    card.innerHTML = summaryHtml;
    card.addEventListener("click", (event) => {
      if (event.target instanceof Element && event.target.closest("a")) {
        return;
      }
      toggleMetric(card);
    });
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        toggleMetric(card);
      }
    });
    scoreboardEl.appendChild(card);
  }

  contentEl.innerHTML = markdownSections
    .filter((section) => {
      const key = normalizeHeading(section.heading);
      return !metricSectionKeys.has(key) && !dashboardHiddenSectionKeys.has(key) && key !== todaySectionKey;
    })
    .map((section) => {
      if (normalizeHeading(section.heading) === "wins-worth-celebrating") {
        return renderWinCarousel(section);
      }
      return section.html;
    })
    .join("");
  todayContentEl.innerHTML = renderTodayDashboard(payload, markdownSections, todaySectionKey);
  setupWinCarousels(contentEl);
  setupPhaseCards(todayContentEl);
  setupDayTabs();
  setActiveDayTab(requestedTab === "today" ? "today" : "yesterday");
  loadTodayPayload(payload, markdownSections, todaySectionKey, todayPayloadDay);
}

async function loadTodayPayload(payload, markdownSections, todaySectionKey, todayDate) {
  if (!todayContentEl || !todayDate) {
    return;
  }

  try {
    const todayCacheBuster = rev ? `?v=${encodeURIComponent(rev)}` : `?v=${Date.now()}`;
    const response = await fetch(`./today/${encodeURIComponent(todayDate)}.json${todayCacheBuster}`, { cache: "no-store" });
    if (!response.ok) {
      return;
    }

    const today = await response.json();
    todayContentEl.innerHTML = renderTodayDashboard({ ...payload, today }, markdownSections, todaySectionKey);
    setupPhaseCards(todayContentEl);
  } catch {
    // The Today payload is optional. Keep the carry-forward fallback if it is absent or malformed.
  }
}

function setupDayTabs() {
  for (const tab of dayTabEls) {
    if (tab.dataset.tabReady === "true") {
      continue;
    }
    tab.dataset.tabReady = "true";
    tab.addEventListener("click", () => setActiveDayTab(tab.dataset.tab || "yesterday"));
    tab.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") {
        return;
      }
      event.preventDefault();
      const currentIndex = dayTabEls.indexOf(tab);
      const offset = event.key === "ArrowRight" ? 1 : -1;
      const nextTab = dayTabEls[(currentIndex + offset + dayTabEls.length) % dayTabEls.length];
      nextTab.focus();
      setActiveDayTab(nextTab.dataset.tab || "yesterday");
    });
  }
}

function setActiveDayTab(tabName) {
  for (const tab of dayTabEls) {
    const isActive = tab.dataset.tab === tabName;
    tab.classList.toggle("is-active", isActive);
    tab.setAttribute("aria-selected", String(isActive));
    tab.setAttribute("tabindex", isActive ? "0" : "-1");
  }

  for (const panel of dayPanelEls) {
    const isActive = panel.dataset.panel === tabName;
    panel.classList.toggle("is-active", isActive);
    panel.hidden = !isActive;
  }
}

function renderEmptyTodayPanel() {
  return `
    <section class="section-card section-pick-up-today">
      <h3>Today</h3>
      <p class="section-kicker">No carry-forward threads were captured for this day.</p>
    </section>
  `;
}

function renderTodayDashboard(payload, markdownSections, todaySectionKey) {
  const todaySection = markdownSections.find((section) => normalizeHeading(section.heading) === todaySectionKey);
  const carryItems = todaySection ? extractListItems(todaySection.html) : [];
  const actualToday = payload.today && typeof payload.today === "object" ? payload.today : null;
  const periods = Array.isArray(actualToday?.periods) && actualToday.periods.length
    ? actualToday.periods.map(normalizeTodayPeriod).filter(Boolean)
    : buildDayPeriods(carryItems);
  const currentPeriod = actualToday?.defaultPhaseId || getCurrentDayPeriod(new Date());
  const activeIndex = periods.findIndex((period) => period.id === currentPeriod);
  const safeActiveIndex = activeIndex >= 0 ? activeIndex : 0;
  const sourceDateParts = getDateParts(payload.date || todayInNewYork());
  const todayBrief = actualToday?.brief || buildTodayBrief(periods, safeActiveIndex);
  const pulses = Array.isArray(actualToday?.pulses) ? actualToday.pulses.map(normalizeTodayPulse).filter(Boolean) : [];
  const sources = Array.isArray(actualToday?.sources) && actualToday.sources.length
    ? actualToday.sources
    : [
        { label: "Sources", text: "Calendar, Gmail, Slack, HQ checkpoints, GitHub, Linear, Vercel, Seena product pulse, weather, transit, local events, sports." },
        { label: "Source day", text: `${sourceDateParts.full} recap payload until the automation writes a first-class Today payload.` }
      ];

  return `
    <section class="today-game-plan" aria-label="Today game plan">
      ${renderTodayPulseStrip(pulses)}

      <div class="today-game-hero">
        <p class="today-kicker">Today's game plan</p>
        <p class="today-brief">${escapeHtml(todayBrief)}</p>
      </div>

      <section class="phase-stack" aria-label="Day phases">
        ${periods.map((period, index) => renderPhaseCard(period, index, safeActiveIndex)).join("")}
      </section>

      ${renderTodaySources(sources)}
    </section>
  `;
}

function normalizeTodayPeriod(period) {
  if (!period || typeof period !== "object") {
    return null;
  }

  return {
    id: String(period.id || "").trim(),
    label: String(period.label || "").trim(),
    title: String(period.title || period.heading || "").trim(),
    time: String(period.time || "").trim(),
    intention: String(period.intention || "").trim(),
    reset: String(period.reset || "").trim(),
    items: Array.isArray(period.items) ? period.items.map(normalizeTodayItem).filter(Boolean) : []
  };
}

function normalizeTodayPulse(pulse) {
  if (!pulse || typeof pulse !== "object") {
    return null;
  }

  const title = String(pulse.title || "").trim();
  const value = String(pulse.value || "").trim();
  if (!title && !value) {
    return null;
  }

  return {
    type: String(pulse.type || "note").trim(),
    eyebrow: String(pulse.eyebrow || "").trim(),
    title,
    value,
    detail: String(pulse.detail || "").trim(),
    source: String(pulse.source || "").trim(),
    url: String(pulse.url || "").trim(),
    logos: Array.isArray(pulse.logos) ? pulse.logos.map(normalizePulseLogo).filter(Boolean) : []
  };
}

function normalizePulseLogo(logo) {
  if (!logo || typeof logo !== "object") {
    return null;
  }
  const src = String(logo.src || "").trim();
  if (!src) {
    return null;
  }
  return {
    src,
    alt: String(logo.alt || "").trim()
  };
}

function renderTodayPulseStrip(pulses) {
  if (!pulses.length) {
    return "";
  }

  return `
    <section class="today-pulse-strip" aria-label="Today pulse">
      ${pulses.map(renderTodayPulseCard).join("")}
    </section>
  `;
}

function renderTodayPulseCard(pulse) {
  const tagName = pulse.url ? "a" : "article";
  const href = pulse.url ? ` href="${escapeHtml(pulse.url)}" target="_blank" rel="noreferrer"` : "";
  const hasLogosClass = pulse.logos.length ? " has-logos" : "";
  return `
    <${tagName} class="today-pulse-card today-pulse-${normalizeHeading(pulse.type)}${hasLogosClass}"${href}>
      ${pulse.logos.length ? renderPulseLogos(pulse.logos) : `<span class="today-pulse-icon" aria-hidden="true">${renderPulseIcon(pulse.type)}</span>`}
      <span class="today-pulse-copy">
        ${pulse.eyebrow ? `<em>${escapeHtml(pulse.eyebrow)}</em>` : ""}
        <strong>${escapeHtml(pulse.value || pulse.title)}</strong>
        ${pulse.value && pulse.title ? `<span>${escapeHtml(pulse.title)}</span>` : ""}
        ${pulse.detail ? `<small>${escapeHtml(pulse.detail)}</small>` : ""}
        ${pulse.source ? `<b>${escapeHtml(pulse.source)}</b>` : ""}
      </span>
    </${tagName}>
  `;
}

function renderPulseLogos(logos) {
  return `
    <span class="today-pulse-logos" aria-hidden="true">
      ${logos.map((logo) => `<img src="${escapeHtml(logo.src)}" alt="">`).join("")}
    </span>
  `;
}

function renderPulseIcon(type) {
  const iconType = normalizeHeading(type);
  if (iconType === "weather") {
    return `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="4"></circle>
        <path d="M12 2v2"></path>
        <path d="M12 20v2"></path>
        <path d="m4.93 4.93 1.41 1.41"></path>
        <path d="m17.66 17.66 1.41 1.41"></path>
        <path d="M2 12h2"></path>
        <path d="M20 12h2"></path>
        <path d="m6.34 17.66-1.41 1.41"></path>
        <path d="m19.07 4.93-1.41 1.41"></path>
      </svg>
    `;
  }
  if (iconType === "tennis") {
    return `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="9"></circle>
        <path d="M7 5.4c2.1 2.2 3.2 4.4 3.2 6.6S9.1 16.4 7 18.6"></path>
        <path d="M17 5.4c-2.1 2.2-3.2 4.4-3.2 6.6s1.1 4.4 3.2 6.6"></path>
      </svg>
    `;
  }
  return `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M6 9H4.5A2.5 2.5 0 0 1 2 6.5V5a1 1 0 0 1 1-1h3"></path>
      <path d="M18 9h1.5A2.5 2.5 0 0 0 22 6.5V5a1 1 0 0 0-1-1h-3"></path>
      <path d="M6 4h12v5a6 6 0 0 1-12 0V4Z"></path>
      <path d="M12 15v4"></path>
      <path d="M8 21h8"></path>
    </svg>
  `;
}

function normalizeTodayItem(item) {
  if (typeof item === "string") {
    return { html: escapeHtml(item), text: item };
  }
  if (!item || typeof item !== "object") {
    return null;
  }
  const text = String(item.text || "").trim();
  const html = String(item.html || "").trim();
  if (!text && !html) {
    return null;
  }
  return {
    html: html || escapeHtml(text),
    text: text || html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
    kind: normalizeTodayItemKind(item.kind || item.type || item.bucket)
  };
}

function normalizeTodayItemKind(value) {
  const kind = String(value || "").trim().toLowerCase();
  if (["suggestion", "suggested", "optional", "candidate", "nudge"].includes(kind)) {
    return "suggested";
  }
  return "committed";
}

function renderTodaySources(sources) {
  return `
    <footer class="today-source-footnote" aria-label="Today signal inputs">
      ${sources.map((source) => `
        <p><span>${escapeHtml(source.label || "Source")}</span> ${escapeHtml(source.text || "")}</p>
      `).join("")}
    </footer>
  `;
}

function buildTodayBrief(periods, activeIndex) {
  const activePeriod = periods[activeIndex] || periods[0];
  const activeLabel = activePeriod?.label || "the current quarter";
  const activeIntention = activePeriod?.intention || "move the day forward with intention";

  return `Today has one spine: warm up, four quarters, then cool down. You are in ${activeLabel} now. ${activeIntention} At 3 PM, take halftime seriously; tonight, land the receipts.`;
}

function extractListItems(sectionHtml) {
  const parser = new DOMParser();
  const documentFragment = parser.parseFromString(sectionHtml, "text/html");
  return Array.from(documentFragment.querySelectorAll("li"))
    .map((item) => ({
      html: item.innerHTML.trim(),
      text: item.textContent.trim()
    }))
    .filter((item) => item.html);
}

function buildDayPeriods(carryItems) {
  const buckets = splitCarryItems(carryItems);
  return [
    {
      id: "warmup",
      label: "Warm-up",
      time: "Wake-9 AM",
      intention: "Get situated without letting the internet choose the day.",
      items: buckets.warmup.length ? buckets.warmup : [
        { html: "Check calendar shape, weather, and the one thing that would make today feel handled." },
        { html: "Skim overnight agent checkpoints before opening new work." }
      ]
    },
    {
      id: "q1",
      label: "Q1",
      time: "9 AM-Noon",
      intention: "Move the highest-leverage project before meetings and messages fragment attention.",
      items: buckets.q1.length ? buckets.q1 : [
        { html: "Close or continue the strongest open thread from yesterday." }
      ]
    },
    {
      id: "q2",
      label: "Q2",
      time: "Noon-3 PM",
      intention: "Turn morning motion into proof: a shipped change, a decision, a checkpoint, or a captured artifact.",
      reset: "Halftime at 3 PM: walk, meditate, or step away before the second half starts.",
      items: buckets.q2.length ? buckets.q2 : [
        { html: "Push one visible artifact far enough that Stewart can preserve the receipt." }
      ]
    },
    {
      id: "q3",
      label: "Q3",
      time: "3-6 PM",
      intention: "Recover, unblock, and make the messy middle explicit.",
      reset: "Start with the halftime question: what is still worth winning today, and what should be parked?",
      items: buckets.q3.length ? buckets.q3 : [
        { html: "Use the afternoon for product recovery, polish, or agent handoffs." }
      ]
    },
    {
      id: "q4",
      label: "Q4",
      time: "6-9 PM",
      intention: "Choose the evening lane: light follow-through, public voice, or deliberately off.",
      items: buckets.q4.length ? buckets.q4 : [
        { html: "Review public-candidate ideas only after sensitive material is filtered out." }
      ]
    },
    {
      id: "cooldown",
      label: "Cool down",
      time: "9 PM-Sleep",
      intention: "Land the plane: receipts, screenshots, and enough continuity for tomorrow.",
      items: buckets.cooldown.length ? buckets.cooldown : [
        { html: "Capture screenshots for visible work and update the matching artifact bundle." },
        { html: "Leave one clean handoff note for Cal, Curie, or Ada." }
      ]
    }
  ];
}

function splitCarryItems(carryItems) {
  const buckets = {
    warmup: [],
    q1: [],
    q2: [],
    q3: [],
    q4: [],
    cooldown: []
  };

  const periodOrder = ["q1", "q2", "q3", "q4", "cooldown"];
  carryItems.forEach((item, index) => {
    const period = getCarryItemPeriod(item.text, periodOrder[index % periodOrder.length]);
    buckets[period].push(item);
  });

  return buckets;
}

function getCarryItemPeriod(text, fallback) {
  const value = text.toLowerCase();
  if (value.includes("screenshot") || value.includes("capture") || value.includes("checkpoint") || value.includes("artifact")) {
    return "cooldown";
  }
  if (value.includes("growth") || value.includes("linkedin") || value.includes("outreach") || value.includes("approval tray")) {
    return "q4";
  }
  if (value.includes("smoke") || value.includes("recover") || value.includes("repo") || value.includes("worktree")) {
    return "q3";
  }
  if (value.includes("walkthrough") || value.includes("testflight") || value.includes("first-run") || value.includes("setup")) {
    return "q2";
  }
  if (value.includes("brainspace") || value.includes("seena") || value.includes("launch")) {
    return "q1";
  }
  return fallback;
}

function renderPhaseCard(period, index, activeIndex) {
  const isExpanded = index === activeIndex;
  const isCurrent = index === activeIndex;
  const isPast = index < activeIndex;
  const phaseMarker = getPhaseMarker(period, index);
  const phaseMarkerClass = isCompactPhaseMarker(phaseMarker) ? " phase-number-compact" : "";
  const hidePhaseTitle = shouldHidePhaseTitle(period);
  const phaseTitle = getPhaseTitle(period);
  const accessiblePhaseLabel = phaseTitle && phaseTitle !== period.label
    ? `${period.label}: ${phaseTitle}`
    : period.label;

  return `
    <article
      class="phase-card${isExpanded ? " is-expanded" : ""}${isCurrent ? " is-current" : ""}${isPast ? " is-past" : ""}"
      data-phase-label="${escapeHtml(accessiblePhaseLabel)}"
      ${isCurrent ? 'aria-current="time"' : ""}
    >
      <span class="phase-number${phaseMarkerClass}" aria-hidden="true">${escapeHtml(phaseMarker)}</span>
      <div class="phase-copy">
        <div class="phase-card-header">
          <p class="phase-time">${escapeHtml(period.time)}</p>
          <div class="phase-title-row${hidePhaseTitle ? " is-title-hidden" : ""}">
            ${hidePhaseTitle ? "" : `<h3>${escapeHtml(phaseTitle)}</h3>`}
            <span class="phase-title-actions">
              ${isCurrent ? '<span class="phase-live">Now</span>' : ""}
              <button class="phase-toggle" type="button" aria-expanded="${String(isExpanded)}" aria-label="${escapeHtml(isExpanded ? `Collapse ${accessiblePhaseLabel}` : `Expand ${accessiblePhaseLabel}`)}">
                <span aria-hidden="true">${isExpanded ? "−" : "+"}</span>
              </button>
            </span>
          </div>
        </div>
        <p class="phase-overview">${escapeHtml(period.intention)}</p>
        ${renderPhaseDetail(period)}
      </div>
    </article>
  `;
}

function getPhaseTitle(period) {
  return String(period.title || period.label || "").trim();
}

function isCompactPhaseMarker(marker) {
  return /^(WU|Q[1-4]|CD)$/i.test(String(marker || "").trim());
}

function shouldHidePhaseTitle(period) {
  return String(period.id || "").trim().toLowerCase() === "warmup";
}

function getPhaseMarker(period, index) {
  const explicitMarker = String(period.marker || "").trim();
  if (explicitMarker) {
    return explicitMarker;
  }
  const label = String(period.label || "").trim();
  if (/^Q[1-4]$/i.test(label)) {
    return label.toUpperCase();
  }
  return String(index + 1).padStart(2, "0");
}

function renderPhaseDetail(period) {
  const reset = period.reset
    ? `<p class="phase-reset">${escapeHtml(period.reset)}</p>`
    : "";
  const committedItems = period.items.filter((item) => item.kind !== "suggested");
  const suggestedItems = period.items.filter((item) => item.kind === "suggested");
  return `
    <div class="phase-detail">
      ${reset}
      ${renderPhaseItemList(committedItems, "phase-items-committed", "Scheduled and chosen work")}
      ${renderPhaseItemList(suggestedItems, "phase-items-suggested", "Optional suggestions")}
    </div>
  `;
}

function renderPhaseItemList(items, className, ariaLabel) {
  if (!items.length) {
    return "";
  }
  return `
    <ul class="phase-items ${className}" aria-label="${escapeHtml(ariaLabel)}">
      ${items.map((item) => `<li>${item.html}</li>`).join("")}
    </ul>
  `;
}

function setupPhaseCards(root) {
  const cards = Array.from(root.querySelectorAll(".phase-card"));

  for (const card of cards) {
    const button = card.querySelector(".phase-toggle");
    button?.addEventListener("click", () => {
      expandPhaseCard(cards, card);
    });
  }
}

function expandPhaseCard(cards, targetCard) {
  for (const card of cards) {
    const isExpanded = card === targetCard;
    card.classList.toggle("is-expanded", isExpanded);
    const button = card.querySelector(".phase-toggle");
    if (button) {
      button.setAttribute("aria-expanded", String(isExpanded));
      const title = card.dataset.phaseLabel || card.querySelector(".phase-title-row h3")?.textContent?.trim() || "phase";
      button.setAttribute("aria-label", `${isExpanded ? "Collapse" : "Expand"} ${title}`);
      const symbol = button.querySelector("span");
      if (symbol) {
        symbol.textContent = isExpanded ? "−" : "+";
      }
    }
  }
}

function getCurrentDayPeriod(value) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23"
  }).formatToParts(value);
  const hour = Number(parts.find((part) => part.type === "hour")?.value || 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value || 0);
  const decimalHour = hour + minute / 60;

  if (decimalHour < 9) {
    return "warmup";
  }
  if (decimalHour < 12) {
    return "q1";
  }
  if (decimalHour < 15) {
    return "q2";
  }
  if (decimalHour < 18) {
    return "q3";
  }
  if (decimalHour < 21) {
    return "q4";
  }
  return "cooldown";
}

function toggleMetric(targetCard) {
  const isActive = targetCard.classList.contains("is-active");
  const cards = Array.from(scoreboardEl.querySelectorAll(".metric"));

  scoreboardEl.classList.toggle("is-expanded", !isActive);
  metricDetailEl.hidden = true;
  metricDetailEl.innerHTML = "";

  for (const card of cards) {
    const shouldActivate = !isActive && card === targetCard;
    card.classList.toggle("is-active", shouldActivate);
    card.classList.toggle("is-hidden", !isActive && card !== targetCard);
    card.setAttribute("aria-expanded", String(shouldActivate));
    card.innerHTML = shouldActivate
      ? card.dataset.detailHtml || card.dataset.summaryHtml || ""
      : card.dataset.summaryHtml || "";
    if (shouldActivate) {
      setupWorkCarousels(card);
      setupArtifactCarousels(card);
    }
  }
}

function showError(message) {
  emptyEl.hidden = true;
  dayEl.hidden = true;
  errorEl.hidden = false;
  if (statusEl) {
    statusEl.textContent = "The link did not open cleanly.";
  }
  errorMessageEl.textContent = message;
}

function getDateParts(value) {
  const [year, month, dayOfMonth] = String(value).split("-").map((part) => Number(part));
  const parsed = new Date(Date.UTC(year, month - 1, dayOfMonth, 12));
  return {
    day: String(dayOfMonth).padStart(2, "0"),
    month: parsed.toLocaleDateString("en-US", { month: "long", timeZone: "UTC" }),
    year: String(year),
    weekday: parsed.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" }),
    full: parsed.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC"
    })
  };
}

function todayInNewYork() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function startNewYorkClock() {
  updateNewYorkTime();
  if (newYorkClockTimer) {
    window.clearInterval(newYorkClockTimer);
  }
  newYorkClockTimer = window.setInterval(updateNewYorkTime, 60000);
}

function updateNewYorkTime() {
  if (!newYorkTimeEl) {
    return;
  }
  newYorkTimeEl.textContent = `New York ${formatNewYorkTime(new Date())}`;
}

function formatNewYorkTime(value) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit"
  }).format(value);
}

function base64UrlToBytes(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function renderMarkdown(markdown) {
  return parseMarkdownSections(markdown).map((section) => section.html).join("");
}

function parseMarkdownSections(markdown) {
  const lines = markdown.split(/\r?\n/);
  const sections = [];
  let html = [];
  let inList = false;
  let currentHeading = "";

  const closeList = () => {
    if (inList) {
      html.push("</ul>");
      inList = false;
    }
  };

  const closeSection = () => {
    closeList();
    if (currentHeading) {
      html.push("</section>");
      sections.push({
        heading: currentHeading,
        html: html.join("")
      });
      html = [];
      currentHeading = "";
    }
  };

  for (const line of lines) {
    if (!line.trim()) {
      closeList();
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      closeSection();
      const headingLevel = Math.min(3, heading[1].length + 1);
      currentHeading = heading[2];
      const displayedHeading = getDisplayHeading(heading[2]);
      html.push(`<section class="section-card section-${normalizeHeading(displayedHeading)}"><h${headingLevel}>${renderInline(displayedHeading)}</h${headingLevel}>`);
      if (normalizeHeading(heading[2]) === "gentle-carry-forward") {
        html.push('<p class="section-kicker">Threads from yesterday to close, continue, or deliberately park before new work takes over.</p>');
      }
      continue;
    }

    const bullet = line.match(/^[-*]\s+(.+)$/);
    if (bullet) {
      if (!inList) {
        html.push("<ul>");
        inList = true;
      }
      html.push(`<li>${renderInline(bullet[1])}</li>`);
      continue;
    }

    closeList();
    html.push(`<p>${renderInline(line)}</p>`);
  }

  closeSection();
  return sections;
}

function normalizeHeading(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function getDisplayHeading(value) {
  if (normalizeHeading(value) === "gentle-carry-forward") {
    return "Pick Up Today";
  }
  return value;
}

function renderMetricDetail(label, sectionHtml) {
  if (!sectionHtml) {
    return `
      <div class="metric-expanded-content">
        <h3>${escapeHtml(label)}</h3>
        <p>No details captured for this section.</p>
      </div>
    `;
  }

  const parser = new DOMParser();
  const documentFragment = parser.parseFromString(sectionHtml, "text/html");
  const section = documentFragment.querySelector("section") || documentFragment.body;
  const heading = section.querySelector("h1, h2, h3, h4");
  const title = heading?.innerHTML || escapeHtml(label);
  if (heading) {
    heading.remove();
  }

  if (label === "Work Made") {
    return renderWorkMadeCarousel(title, section);
  }

  if (label === "Artifacts") {
    return renderArtifactGroups(title, section);
  }

  return `
    <div class="metric-expanded-content">
      <h3>${title}</h3>
      ${section.innerHTML}
    </div>
  `;
}

function renderWorkMadeCarousel(title, section) {
  const items = Array.from(section.querySelectorAll("li"))
    .map((item) => ({
      html: item.innerHTML.trim(),
      text: item.textContent.trim()
    }))
    .filter((item) => item.html);
  const groups = groupWorkItems(items);

  if (groups.length < 2) {
    return `
      <div class="metric-expanded-content">
        <h3>${title}</h3>
        ${section.innerHTML}
      </div>
    `;
  }

  const cards = groups
    .map((group, index) => `
      <article class="work-card">
        <div class="work-card-header">
          <span>${String(index + 1).padStart(2, "0")}</span>
          <div>
            <h4>${escapeHtml(group.title)}</h4>
            <em>${group.items.length} ${group.items.length === 1 ? "thread" : "threads"}</em>
          </div>
        </div>
        <ul>
          ${group.items.map((item) => `<li>${item.html}</li>`).join("")}
        </ul>
      </article>
    `)
    .join("");
  const dots = groups
    .map((group, index) => `<button class="carousel-dot${index === 0 ? " is-active" : ""}" type="button" aria-label="Show ${escapeHtml(group.title)}" data-index="${index}"></button>`)
    .join("");

  return `
    <div class="metric-expanded-content work-made-content" data-work-carousel>
      <div class="work-carousel-top">
        <h3>${title}</h3>
        <div class="carousel-actions" aria-label="Work carousel controls">
          <button class="carousel-button carousel-button-on-dark" type="button" data-direction="previous" aria-label="Previous work group"><span aria-hidden="true">&lsaquo;</span></button>
          <button class="carousel-button carousel-button-on-dark" type="button" data-direction="next" aria-label="Next work group"><span aria-hidden="true">&rsaquo;</span></button>
        </div>
      </div>
      <div class="work-track" tabindex="0" aria-label="Work made by initiative">
        ${cards}
      </div>
      <div class="carousel-dots carousel-dots-on-dark" aria-label="Work group position">${dots}</div>
    </div>
  `;
}

function groupWorkItems(items) {
  const groups = [];
  const groupMap = new Map();

  for (const item of items) {
    const groupTitle = getWorkGroupTitle(item.text);
    if (groupTitle === "Evidence Notes") {
      continue;
    }
    if (!groupMap.has(groupTitle)) {
      const group = { title: groupTitle, items: [] };
      groups.push(group);
      groupMap.set(groupTitle, group);
    }
    groupMap.get(groupTitle).items.push(item);
  }

  return groups;
}

function getWorkGroupTitle(text) {
  const value = text.toLowerCase();
  if (value.includes("brainspace")) {
    return "BrainSpace";
  }
  if (
    value.includes("launch-readiness") ||
    value.includes("launch-control") ||
    value.includes("launch-blocker") ||
    value.includes("broader launch claim") ||
    value.includes("do not blast invites") ||
    value.includes("dirty production worktree") ||
    value.includes("repo state")
  ) {
    return "Seena Launch Control";
  }
  if (
    value.includes("growth") ||
    value.includes("approval tray") ||
    value.includes("content engine") ||
    value.includes("linkedin") ||
    value.includes("outreach") ||
    value.includes("sales dashboard")
  ) {
    return "Seena Growth Engine";
  }
  if (
    value.includes("seena") ||
    value.includes("first-run") ||
    value.includes("onboarding") ||
    value.includes("signup") ||
    value.includes("launch") ||
    value.includes("smoke") ||
    value.includes("first site") ||
    value.includes("credit-reservation") ||
    value.includes("production") ||
    value.includes("sn-1164")
  ) {
    return "Seena Product / Activation";
  }
  if (value.includes("stewart") || value.includes("ax's day") || value.includes("digest")) {
    return "Stewart";
  }
  if (value.includes("axali.me") || value.includes("no durable") || value.includes("repo state")) {
    return "Evidence Notes";
  }
  return "Other Work";
}

function renderArtifactGroups(title, section) {
  const items = Array.from(section.querySelectorAll("li"))
    .map(parseArtifactItem)
    .filter((item) => item.name || item.target);
  const groups = groupArtifactItems(items);

  if (!groups.length) {
    return `
      <div class="metric-expanded-content">
        <h3>${title}</h3>
        ${section.innerHTML}
      </div>
    `;
  }

  const dots = groups
    .map((group, index) => `<button class="carousel-dot${index === 0 ? " is-active" : ""}" type="button" aria-label="Show ${escapeHtml(group.title)} artifacts" data-index="${index}"></button>`)
    .join("");

  return `
    <div class="metric-expanded-content artifact-groups-content" data-artifact-carousel>
      <div class="artifact-carousel-top">
        <h3>${title}</h3>
        <div class="carousel-actions" aria-label="Artifact carousel controls">
          <button class="carousel-button carousel-button-on-dark" type="button" data-direction="previous" aria-label="Previous artifact group"><span aria-hidden="true">&lsaquo;</span></button>
          <button class="carousel-button carousel-button-on-dark" type="button" data-direction="next" aria-label="Next artifact group"><span aria-hidden="true">&rsaquo;</span></button>
        </div>
      </div>
      <div class="artifact-track" tabindex="0" aria-label="Artifacts by initiative">
        ${groups.map(renderArtifactGroup).join("")}
      </div>
      <div class="carousel-dots carousel-dots-on-dark" aria-label="Artifact group position">${dots}</div>
    </div>
  `;
}

function parseArtifactItem(item) {
  const text = item.textContent.trim();
  const colonIndex = text.indexOf(":");
  const name = colonIndex >= 0 ? text.slice(0, colonIndex).trim() : text;
  const target = colonIndex >= 0 ? text.slice(colonIndex + 1).trim() : "";
  return {
    name,
    target,
    text
  };
}

function groupArtifactItems(items) {
  const groups = [];
  const groupMap = new Map();

  for (const item of items) {
    const groupTitle = getArtifactGroupTitle(item.text);
    if (!groupMap.has(groupTitle)) {
      const group = { title: groupTitle, items: [] };
      groups.push(group);
      groupMap.set(groupTitle, group);
    }
    groupMap.get(groupTitle).items.push(item);
  }

  return groups;
}

function getArtifactGroupTitle(text) {
  const value = text.toLowerCase();
  if (value.includes("brainspace")) {
    return "BrainSpace";
  }
  if (value.includes("growth")) {
    return "Seena Growth Engine";
  }
  if (value.includes("onboarding") || value.includes("activation")) {
    return "Seena Product / Activation";
  }
  if (value.includes("seena") || value.includes("launch-readiness") || value.includes("launch control") || value.includes("launch-control")) {
    return "Seena Launch Control";
  }
  if (value.includes("generated") || value.includes("digest") || value.includes("text message") || value.includes("encrypted") || value.includes("stew-updates")) {
    return "Ax's Day Digest";
  }
  return "Other Artifacts";
}

function renderArtifactGroup(group, index) {
  return `
    <section class="artifact-group">
      <div class="artifact-group-header">
        <span>${String(index + 1).padStart(2, "0")}</span>
        <div>
          <h4>${escapeHtml(group.title)}</h4>
          <em>${group.items.length} ${group.items.length === 1 ? "artifact" : "artifacts"}</em>
        </div>
      </div>
      <ul class="artifact-list">
        ${group.items.map(renderArtifactItem).join("")}
      </ul>
    </section>
  `;
}

function renderArtifactItem(item) {
  const link = buildArtifactLink(item.target);
  const pathText = item.target || item.text;
  if (!link.href) {
    return `
      <li>
        <span class="artifact-link artifact-link-static">
          <span class="artifact-name">${escapeHtml(item.name || pathText)}</span>
          <span class="artifact-path">${escapeHtml(pathText)}</span>
        </span>
      </li>
    `;
  }

  return `
    <li>
      <a class="artifact-link" href="${escapeHtml(link.href)}" target="_blank" rel="noreferrer" title="${escapeHtml(link.title)}">
        <span class="artifact-link-top">
          <span class="artifact-name">${escapeHtml(item.name || pathText)}</span>
          <span class="artifact-kind">${escapeHtml(link.kind)}</span>
        </span>
        <span class="artifact-path">${escapeHtml(link.displayPath)}</span>
      </a>
    </li>
  `;
}

function buildArtifactLink(target) {
  const cleanTarget = String(target || "").trim();
  if (!cleanTarget) {
    return { href: "", kind: "", displayPath: "", title: "" };
  }

  if (/^https?:\/\//i.test(cleanTarget)) {
    return {
      href: cleanTarget,
      kind: "Web",
      displayPath: cleanTarget.replace(/^https?:\/\//i, ""),
      title: cleanTarget
    };
  }

  const absolutePath = cleanTarget.startsWith("/")
    ? cleanTarget
    : `${getHqRootPath()}/${cleanTarget.replace(/^\.?\//, "")}`;
  const isHqPath = absolutePath.startsWith(getHqRootPath());
  const isDirectory = cleanTarget.endsWith("/");

  return {
    href: toFileUrl(absolutePath),
    kind: isHqPath ? "HQ iCloud" : isDirectory ? "Folder" : "Local",
    displayPath: cleanTarget,
    title: absolutePath
  };
}

function getHqRootPath() {
  return "/Users/ax/Library/Mobile Documents/com~apple~CloudDocs/HQ";
}

function toFileUrl(path) {
  const encoded = path.split("/").map((part) => encodeURIComponent(part)).join("/");
  return `file://${encoded}`;
}

function renderWinCarousel(section) {
  const parser = new DOMParser();
  const documentFragment = parser.parseFromString(section.html, "text/html");
  const wins = Array.from(documentFragment.querySelectorAll("li"))
    .map((item) => item.innerHTML.trim())
    .filter(Boolean);

  if (!wins.length) {
    return section.html;
  }

  const dots = wins
    .map((_, index) => `<button class="carousel-dot${index === 0 ? " is-active" : ""}" type="button" aria-label="Show win ${index + 1}" data-index="${index}"></button>`)
    .join("");
  const cards = wins
    .map((win, index) => `
      <article class="win-card" id="win-${index + 1}">
        <span class="win-count">${String(index + 1).padStart(2, "0")}</span>
        <p>${win}</p>
      </article>
    `)
    .join("");

  return `
    <section class="win-carousel-section section-wins-worth-celebrating" data-win-carousel>
      <div class="carousel-header">
        <h2 class="section-heading">${renderInline(getDisplayHeading(section.heading))}</h2>
        <div class="carousel-actions" aria-label="Win carousel controls">
          <button class="carousel-button" type="button" data-direction="previous" aria-label="Previous win"><span aria-hidden="true">&lsaquo;</span></button>
          <button class="carousel-button" type="button" data-direction="next" aria-label="Next win"><span aria-hidden="true">&rsaquo;</span></button>
        </div>
      </div>
      <div class="win-carousel-frame">
        <div class="win-track" tabindex="0" aria-label="Wins worth celebrating">
          ${cards}
        </div>
        <div class="carousel-dots" aria-label="Win position">${dots}</div>
      </div>
    </section>
  `;
}

function setupWinCarousels(root) {
  const carousels = Array.from(root.querySelectorAll("[data-win-carousel]"));
  for (const carousel of carousels) {
    const track = carousel.querySelector(".win-track");
    const cards = Array.from(carousel.querySelectorAll(".win-card"));
    const dots = Array.from(carousel.querySelectorAll(".carousel-dot"));
    const controls = Array.from(carousel.querySelectorAll(".carousel-button"));
    if (!track || !cards.length) {
      continue;
    }

    const setActive = (index) => {
      dots.forEach((dot, dotIndex) => {
        dot.classList.toggle("is-active", dotIndex === index);
        dot.setAttribute("aria-current", dotIndex === index ? "true" : "false");
      });
    };

    const scrollToCard = (index) => {
      const safeIndex = Math.max(0, Math.min(cards.length - 1, index));
      track.scrollTo({
        left: cards[safeIndex].offsetLeft - track.offsetLeft,
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"
      });
      setActive(safeIndex);
    };

    const getActiveIndex = () => {
      const trackLeft = track.scrollLeft;
      let activeIndex = 0;
      let activeDistance = Number.POSITIVE_INFINITY;
      cards.forEach((card, index) => {
        const distance = Math.abs(card.offsetLeft - track.offsetLeft - trackLeft);
        if (distance < activeDistance) {
          activeDistance = distance;
          activeIndex = index;
        }
      });
      return activeIndex;
    };

    dots.forEach((dot, index) => {
      dot.addEventListener("click", () => scrollToCard(index));
    });

    controls.forEach((control) => {
      control.addEventListener("click", () => {
        const direction = control.dataset.direction === "previous" ? -1 : 1;
        scrollToCard(getActiveIndex() + direction);
      });
    });

    track.addEventListener("scroll", () => {
      window.requestAnimationFrame(() => setActive(getActiveIndex()));
    }, { passive: true });

    setActive(0);
  }
}

function setupWorkCarousels(root) {
  const carousels = Array.from(root.querySelectorAll("[data-work-carousel]"));
  for (const carousel of carousels) {
    const track = carousel.querySelector(".work-track");
    const cards = Array.from(carousel.querySelectorAll(".work-card"));
    const dots = Array.from(carousel.querySelectorAll(".carousel-dot"));
    const controls = Array.from(carousel.querySelectorAll(".carousel-button"));
    if (!track || !cards.length || carousel.dataset.carouselReady === "true") {
      continue;
    }
    carousel.dataset.carouselReady = "true";

    const setActive = (index) => {
      dots.forEach((dot, dotIndex) => {
        dot.classList.toggle("is-active", dotIndex === index);
        dot.setAttribute("aria-current", dotIndex === index ? "true" : "false");
      });
    };

    const scrollToCard = (index) => {
      const safeIndex = Math.max(0, Math.min(cards.length - 1, index));
      track.scrollTo({
        left: cards[safeIndex].offsetLeft - track.offsetLeft,
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"
      });
      setActive(safeIndex);
    };

    const getActiveIndex = () => {
      const trackLeft = track.scrollLeft;
      let activeIndex = 0;
      let activeDistance = Number.POSITIVE_INFINITY;
      cards.forEach((card, index) => {
        const distance = Math.abs(card.offsetLeft - track.offsetLeft - trackLeft);
        if (distance < activeDistance) {
          activeDistance = distance;
          activeIndex = index;
        }
      });
      return activeIndex;
    };

    dots.forEach((dot, index) => {
      dot.addEventListener("click", (event) => {
        event.stopPropagation();
        scrollToCard(index);
      });
    });

    controls.forEach((control) => {
      control.addEventListener("click", (event) => {
        event.stopPropagation();
        const direction = control.dataset.direction === "previous" ? -1 : 1;
        scrollToCard(getActiveIndex() + direction);
      });
    });

    track.addEventListener("click", (event) => event.stopPropagation());
    track.addEventListener("keydown", (event) => event.stopPropagation());
    track.addEventListener("scroll", () => {
      window.requestAnimationFrame(() => setActive(getActiveIndex()));
    }, { passive: true });

    setActive(0);
  }
}

function setupArtifactCarousels(root) {
  const carousels = Array.from(root.querySelectorAll("[data-artifact-carousel]"));
  for (const carousel of carousels) {
    const track = carousel.querySelector(".artifact-track");
    const cards = Array.from(carousel.querySelectorAll(".artifact-group"));
    const dots = Array.from(carousel.querySelectorAll(".carousel-dot"));
    const controls = Array.from(carousel.querySelectorAll(".carousel-button"));
    if (!track || !cards.length || carousel.dataset.carouselReady === "true") {
      continue;
    }
    carousel.dataset.carouselReady = "true";

    const setActive = (index) => {
      dots.forEach((dot, dotIndex) => {
        dot.classList.toggle("is-active", dotIndex === index);
        dot.setAttribute("aria-current", dotIndex === index ? "true" : "false");
      });
    };

    const scrollToCard = (index) => {
      const safeIndex = Math.max(0, Math.min(cards.length - 1, index));
      track.scrollTo({
        left: cards[safeIndex].offsetLeft - track.offsetLeft,
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"
      });
      setActive(safeIndex);
    };

    const getActiveIndex = () => {
      const trackLeft = track.scrollLeft;
      let activeIndex = 0;
      let activeDistance = Number.POSITIVE_INFINITY;
      cards.forEach((card, index) => {
        const distance = Math.abs(card.offsetLeft - track.offsetLeft - trackLeft);
        if (distance < activeDistance) {
          activeDistance = distance;
          activeIndex = index;
        }
      });
      return activeIndex;
    };

    dots.forEach((dot, index) => {
      dot.addEventListener("click", (event) => {
        event.stopPropagation();
        scrollToCard(index);
      });
    });

    controls.forEach((control) => {
      control.addEventListener("click", (event) => {
        event.stopPropagation();
        const direction = control.dataset.direction === "previous" ? -1 : 1;
        scrollToCard(getActiveIndex() + direction);
      });
    });

    track.addEventListener("click", (event) => event.stopPropagation());
    track.addEventListener("keydown", (event) => event.stopPropagation());
    track.addEventListener("scroll", () => {
      window.requestAnimationFrame(() => setActive(getActiveIndex()));
    }, { passive: true });

    setActive(0);
  }
}

function renderInline(value) {
  const escaped = escapeHtml(value);
  return escaped
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
}

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
