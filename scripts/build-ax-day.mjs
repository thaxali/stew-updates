import { createCipheriv, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const siteDir = path.resolve(__dirname, "..");
const stewartDir = path.resolve(siteDir, "..");
const hqRoot = path.resolve(stewartDir, "../..");

const args = parseArgs(process.argv.slice(2));
const date = args.date || todayInNewYork();
const source = path.resolve(siteDir, args.source || path.join("..", "daily-digests", `${date}.md`));
const hostUrl = normalizeHostUrl(args["host-url"] || process.env.STEW_UPDATES_URL || "https://thaxali.github.io/stew-updates/");
const label = args.label ? ` (${args.label})` : "";

const markdown = await readFile(source, "utf8");
const payload = buildPayload(markdown, date);
const { encrypted, key } = encryptPayload(payload);

const daysDir = path.join(siteDir, "days");
await mkdir(daysDir, { recursive: true });
await writeFile(path.join(daysDir, `${date}.json.enc`), `${JSON.stringify(encrypted, null, 2)}\n`);

const localDayDir = path.join(stewartDir, "ax-day", date);
await mkdir(localDayDir, { recursive: true });
await writeFile(path.join(localDayDir, "index.html"), renderStandaloneHtml(payload));

const privateLink = `${hostUrl}?day=${encodeURIComponent(date)}#key=${encodeURIComponent(key)}`;
const message = [
  `Your Ax's Day${label} is ready:`,
  privateLink,
  "",
  "Private link. Treat it like a diary page."
].join("\n");

await writeFile(path.join(localDayDir, "link.txt"), `${privateLink}\n`);
await writeFile(path.join(localDayDir, "sms.txt"), `${message}\n`);

console.log(JSON.stringify({
  date,
  source: relativeFromHq(source),
  encryptedPayload: relativeFromHq(path.join(daysDir, `${date}.json.enc`)),
  localPage: relativeFromHq(path.join(localDayDir, "index.html")),
  privateLink,
  pushoverMessage: relativeFromHq(path.join(localDayDir, "sms.txt"))
}, null, 2));

function buildPayload(markdownText, day) {
  const oneLine = extractSectionFirstText(markdownText, "Today In One Line") || "A day worth remembering.";

  return {
    version: 1,
    title: "Ax's Day",
    date: day,
    oneLine,
    generatedAt: new Date().toISOString(),
    counts: {
      calendar: countBullets(markdownText, "Calendar Moments"),
      work: countBullets(markdownText, "Work Made"),
      artifacts: countBullets(markdownText, "Artifacts"),
      publicSeeds: countBullets(markdownText, "Public-Candidate Seeds")
    },
    markdown: markdownText
  };
}

function encryptPayload(payload) {
  const key = randomBytes(32);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final()
  ]);
  const tag = cipher.getAuthTag();

  return {
    key: base64Url(key),
    encrypted: {
      v: 1,
      alg: "AES-256-GCM",
      iv: base64Url(iv),
      data: base64Url(Buffer.concat([ciphertext, tag])),
      generatedAt: new Date().toISOString()
    }
  };
}

function extractSectionFirstText(markdownText, sectionName) {
  const lines = extractSectionLines(markdownText, sectionName);
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("- ")) {
      return trimmed;
    }
  }
  return "";
}

function countBullets(markdownText, sectionName) {
  return extractSectionLines(markdownText, sectionName).filter((line) => /^[-*]\s+/.test(line.trim())).length;
}

function extractSectionLines(markdownText, sectionName) {
  const lines = markdownText.split(/\r?\n/);
  const headingPattern = new RegExp(`^#{2,3}\\s+${escapeRegExp(sectionName)}\\s*$`, "i");
  const nextHeadingPattern = /^#{1,3}\s+/;
  const section = [];
  let collecting = false;

  for (const line of lines) {
    if (headingPattern.test(line.trim())) {
      collecting = true;
      continue;
    }

    if (collecting && nextHeadingPattern.test(line.trim())) {
      break;
    }

    if (collecting) {
      section.push(line);
    }
  }

  return section;
}

function renderStandaloneHtml(payload) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>${escapeHtml(payload.title)} | ${escapeHtml(payload.date)}</title>
  <style>${standaloneCss()}</style>
</head>
<body>
  <main>
    <section class="hero">
      <p class="eyebrow">Ax's Day</p>
      <h1>${escapeHtml(payload.date)}</h1>
      <p>${escapeHtml(payload.oneLine)}</p>
    </section>
    <section class="metrics">
      ${metric("Calendar", payload.counts.calendar)}
      ${metric("Work Made", payload.counts.work)}
      ${metric("Artifacts", payload.counts.artifacts)}
      ${metric("Public Seeds", payload.counts.publicSeeds)}
    </section>
    <article>${renderMarkdown(payload.markdown)}</article>
  </main>
</body>
</html>
`;
}

function metric(label, value) {
  return `<div><strong>${escapeHtml(String(value))}</strong><span>${escapeHtml(label)}</span></div>`;
}

function renderMarkdown(markdownText) {
  const lines = markdownText.split(/\r?\n/);
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
      const level = heading[1].length;
      html.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
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
  return html.join("\n");
}

function standaloneCss() {
  return `
:root{color-scheme:dark;--bg:#0b0a09;--ink:#fffaf2;--muted:#bdb5a8;--line:rgba(255,250,242,.16);--panel:rgba(255,250,242,.08);--red:#ff4a2d;--gold:#ffd36a;--mint:#8ff0c3;--blue:#6fd5ff}
*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 12% 0%,rgba(255,74,45,.22),transparent 28rem),linear-gradient(180deg,#17110e,var(--bg));color:var(--ink);font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;letter-spacing:0}main{width:min(100%,720px);margin:0 auto;padding:28px 18px 42px}.hero{min-height:44svh;display:flex;flex-direction:column;justify-content:flex-end}.eyebrow{width:fit-content;margin:0 0 14px;padding:7px 10px;border:1px solid var(--line);border-radius:999px;color:var(--mint);font-size:.78rem;font-weight:800;text-transform:uppercase}h1{margin:0;font-size:clamp(3.2rem,18vw,6.5rem);line-height:.9;letter-spacing:0}.hero p:last-child{color:var(--muted);font-size:1.2rem;line-height:1.4}.metrics{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:22px 0}.metrics div{min-height:82px;padding:14px;border:1px solid var(--line);border-radius:8px;background:var(--panel)}.metrics strong{display:block;font-size:2rem;line-height:1}.metrics span{display:block;margin-top:8px;color:var(--muted);font-size:.78rem;font-weight:800;text-transform:uppercase}article{padding:20px;border:1px solid var(--line);border-radius:8px;background:var(--panel);line-height:1.58}article h1,article h2,article h3{line-height:1.08;letter-spacing:0}article h2{margin-top:30px;color:var(--gold)}article h3{color:var(--mint)}a{color:var(--blue)}code{padding:2px 5px;border-radius:5px;background:rgba(255,250,242,.12);color:var(--gold)}
`;
}

function parseArgs(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith("--")) {
      continue;
    }
    const key = value.slice(2);
    const next = values[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = true;
    } else {
      parsed[key] = next;
      index += 1;
    }
  }
  return parsed;
}

function todayInNewYork() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function normalizeHostUrl(value) {
  return value.endsWith("/") ? value : `${value}/`;
}

function base64Url(buffer) {
  return Buffer.from(buffer)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function renderInline(value) {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function relativeFromHq(value) {
  return path.relative(hqRoot, value);
}

