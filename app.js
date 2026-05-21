const statusEl = document.getElementById("status");
const emptyEl = document.getElementById("empty-state");
const dayEl = document.getElementById("day");
const errorEl = document.getElementById("error");
const errorMessageEl = document.getElementById("error-message");
const dateEl = document.getElementById("date");
const summaryEl = document.getElementById("summary");
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
    statusEl.textContent = "Decrypting today's little celebration...";
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
  statusEl.textContent = payload.oneLine || "A private record of the day, unwrapped.";
  emptyEl.hidden = true;
  errorEl.hidden = true;
  dayEl.hidden = false;

  dateEl.textContent = payload.date || day;
  summaryEl.textContent = payload.oneLine || "A day worth remembering.";
  scoreboardEl.innerHTML = "";

  const metrics = [
    ["Calendar", payload.counts?.calendar ?? 0],
    ["Work Made", payload.counts?.work ?? 0],
    ["Artifacts", payload.counts?.artifacts ?? 0],
    ["Public Seeds", payload.counts?.publicSeeds ?? 0]
  ];

  for (const [label, value] of metrics) {
    const card = document.createElement("div");
    card.className = "metric";
    card.innerHTML = `<strong>${escapeHtml(String(value))}</strong><span>${escapeHtml(label)}</span>`;
    scoreboardEl.appendChild(card);
  }

  contentEl.innerHTML = renderMarkdown(payload.markdown || "");
}

function showError(message) {
  emptyEl.hidden = true;
  dayEl.hidden = true;
  errorEl.hidden = false;
  statusEl.textContent = "The link did not open cleanly.";
  errorMessageEl.textContent = message;
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

  const closeList = () => {
    if (inList) {
      html.push("</ul>");
      inList = false;
    }
  };

  for (const line of lines) {
    if (!line.trim()) {
      closeList();
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      closeList();
      html.push(`<h${heading[1].length}>${renderInline(heading[2])}</h${heading[1].length}>`);
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

  closeList();
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
