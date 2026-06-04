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

const privateLink = `${hostUrl}?day=${encodeURIComponent(date)}&v=${encodeURIComponent(encrypted.rev)}#key=${encodeURIComponent(key)}`;
await writeFile(path.join(localDayDir, "index.html"), renderStandaloneHtml(payload, privateLink));
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
  const displayMarkdown = stripSection(stripLeadingMetadataAndTitle(markdownText), "Today In One Line");

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
    markdown: displayMarkdown
  };
}

function stripLeadingMetadataAndTitle(markdownText) {
  return markdownText
    .replace(/^# .+?\n+/i, "")
    .replace(/^```ya?ml\n[\s\S]*?\n```\n+/i, "");
}

function stripSection(markdownText, sectionName) {
  const lines = markdownText.split(/\r?\n/);
  const headingPattern = new RegExp(`^#{2,3}\\s+${escapeRegExp(sectionName)}\\s*$`, "i");
  const nextHeadingPattern = /^#{1,3}\s+/;
  const kept = [];
  let skipping = false;

  for (const line of lines) {
    if (headingPattern.test(line.trim())) {
      skipping = true;
      continue;
    }

    if (skipping && nextHeadingPattern.test(line.trim())) {
      skipping = false;
    }

    if (!skipping) {
      kept.push(line);
    }
  }

  return kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
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
      rev: base64Url(randomBytes(8)),
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

function renderStandaloneHtml(payload, privateLink) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>${escapeHtml(payload.title)} | ${escapeHtml(payload.date)}</title>
  <meta http-equiv="refresh" content="0; url=${escapeHtml(privateLink)}">
  <style>
    :root{color-scheme:light;--bg:#f7f6f3;--ink:#111;--muted:#7a7771;--line:rgba(17,17,17,.12);--orange:#ff5a1f}
    *{box-sizing:border-box}body{margin:0;min-height:100svh;display:grid;place-items:center;background:var(--bg);color:var(--ink);font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;letter-spacing:0}
    main{width:min(100%,520px);padding:28px}p{margin:0;color:var(--muted);font-size:1rem;line-height:1.45}.eyebrow{margin-bottom:14px;font-size:.8rem;font-weight:800;text-transform:uppercase;color:var(--muted)}h1{margin:0 0 18px;font-size:clamp(3rem,18vw,6rem);line-height:.9;letter-spacing:0}a{display:inline-flex;margin-top:22px;padding:10px 14px;border:1px solid var(--line);border-radius:999px;color:var(--ink);text-decoration:none;font-weight:800}a:hover{border-color:var(--orange);color:var(--orange)}
  </style>
  <script>
    window.location.replace(${JSON.stringify(privateLink)});
  </script>
</head>
<body>
  <main>
    <p class="eyebrow">Ax's Day</p>
    <h1>${escapeHtml(payload.date)}</h1>
    <p>Opening the private Stew Updates dashboard.</p>
    <a href="${escapeHtml(privateLink)}">Open dashboard</a>
  </main>
</body>
</html>
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
