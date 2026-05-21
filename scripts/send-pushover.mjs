import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const siteDir = path.resolve(__dirname, "..");
const stewartDir = path.resolve(siteDir, "..");
const args = parseArgs(process.argv.slice(2));
const date = args.date || todayInNewYork();
await loadDotenv(path.join(siteDir, ".env"));
const token = process.env.PUSHOVER_APP_TOKEN || process.env.PUSHOVER_TOKEN;
const user = process.env.PUSHOVER_USER_KEY || process.env.PUSHOVER_USER;

if (!token || !user) {
  console.error("Missing PUSHOVER_APP_TOKEN and PUSHOVER_USER_KEY.");
  process.exit(2);
}

const messagePath = path.join(stewartDir, "ax-day", date, "sms.txt");
const message = args.message || await readFile(messagePath, "utf8");
const link = args.url || firstUrl(message);

const body = new URLSearchParams({
  token,
  user,
  title: args.title || "Stew Updates",
  message,
  url: link || "",
  url_title: args["url-title"] || "Open Ax's Day"
});

const response = await fetch("https://api.pushover.net/1/messages.json", {
  method: "POST",
  headers: {
    "Content-Type": "application/x-www-form-urlencoded"
  },
  body
});

const result = await response.json().catch(() => ({}));
if (!response.ok) {
  console.error(JSON.stringify(result, null, 2));
  process.exit(1);
}

console.log(JSON.stringify(result, null, 2));

function firstUrl(value) {
  const match = value.match(/https?:\/\/\S+/);
  return match ? match[0] : "";
}

async function loadDotenv(filePath) {
  let text = "";
  try {
    text = await readFile(filePath, "utf8");
  } catch {
    return;
  }

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    const value = rawValue.replace(/^['"]|['"]$/g, "");
    if (key && !process.env[key]) {
      process.env[key] = value;
    }
  }
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
