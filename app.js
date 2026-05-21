const statusEl = document.getElementById("status");
const emptyEl = document.getElementById("empty-state");
const dayEl = document.getElementById("day");
const errorEl = document.getElementById("error");
const errorMessageEl = document.getElementById("error-message");
const eyebrowEl = document.getElementById("eyebrow");
const dayNumberEl = document.getElementById("day-number");
const weekdayEl = document.getElementById("weekday");
const monthEl = document.getElementById("month");
const yearEl = document.getElementById("year");
const scoreboardEl = document.getElementById("scoreboard");
const contentEl = document.getElementById("content");

const params = new URLSearchParams(window.location.search);
const day = params.get("day");
const rev = params.get("v") || params.get("rev") || "";
const key = new URLSearchParams(window.location.hash.slice(1)).get("key");

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

  const dateParts = getDateParts(payload.date || day);
  eyebrowEl.textContent = `Ax's Day / ${dateParts.full}`;
  dayNumberEl.textContent = dateParts.day;
  weekdayEl.textContent = dateParts.weekday;
  monthEl.textContent = dateParts.month;
  yearEl.textContent = dateParts.year;
  statusEl.textContent = payload.oneLine || "A day worth remembering.";
  scoreboardEl.innerHTML = "";

  const metrics = [
    ["Calendar", payload.counts?.calendar ?? 0, "Meetings and commitments captured"],
    ["Work Made", payload.counts?.work ?? 0, "Things moved forward"],
    ["Artifacts", payload.counts?.artifacts ?? 0, "Receipts worth keeping"],
    ["Public Seeds", payload.counts?.publicSeeds ?? 0, "Ideas to revisit"]
  ];

  for (const [label, value, note] of metrics) {
    const card = document.createElement("div");
    card.className = "metric";
    card.innerHTML = `
      <strong>${escapeHtml(String(value))}</strong>
      <span>${escapeHtml(label)}</span>
      <em>${escapeHtml(note)}</em>
    `;
    scoreboardEl.appendChild(card);
  }

  contentEl.innerHTML = renderMarkdown(payload.markdown || "");
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
  const lines = markdown.split(/\r?\n/);
  const html = [];
  let inList = false;
  let sectionOpen = false;

  const closeList = () => {
    if (inList) {
      html.push("</ul>");
      inList = false;
    }
  };

  const closeSection = () => {
    closeList();
    if (sectionOpen) {
      html.push("</section>");
      sectionOpen = false;
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
      html.push(`<section class="section-card"><h${headingLevel}>${renderInline(heading[2])}</h${headingLevel}>`);
      sectionOpen = true;
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
  return html.join("");
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
