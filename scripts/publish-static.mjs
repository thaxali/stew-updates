import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const siteDir = path.resolve(__dirname, "..");
const args = parseArgs(process.argv.slice(2));
const repo = args.repo || process.env.STEW_UPDATES_REPO || "thaxali/stew-updates";
const branch = args.branch || process.env.STEW_UPDATES_BRANCH || "main";
const files = normalizeFiles(args.file || ["index.html", "styles.css", "app.js"]);

for (const filePath of files) {
  await upsertFile({
    repo,
    branch,
    filePath,
    absolutePath: path.join(siteDir, filePath),
    message: args.message || `Publish Stew Updates viewer chrome`
  });
}

console.log(JSON.stringify({
  repo,
  branch,
  files,
  status: "published"
}, null, 2));

async function upsertFile({ repo, branch, filePath, absolutePath, message }) {
  const content = await readFile(absolutePath);
  const sha = getExistingSha(repo, filePath, branch);
  const body = {
    message,
    content: content.toString("base64"),
    branch
  };

  if (sha) {
    body.sha = sha;
  }

  runGh([
    "api",
    "-X",
    "PUT",
    `repos/${repo}/contents/${filePath}`,
    "--input",
    "-"
  ], JSON.stringify(body));
}

function getExistingSha(repo, filePath, branch) {
  const result = spawnSync("gh", [
    "api",
    `repos/${repo}/contents/${filePath}?ref=${encodeURIComponent(branch)}`,
    "--jq",
    ".sha"
  ], {
    encoding: "utf8"
  });

  if (result.status === 0) {
    return result.stdout.trim();
  }

  if (result.stderr.includes("Not Found")) {
    return "";
  }

  throw new Error(result.stderr || result.stdout || `gh exited with ${result.status}`);
}

function runGh(args, input) {
  const result = spawnSync("gh", args, {
    input,
    encoding: "utf8"
  });

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `gh exited with ${result.status}`);
  }

  return result.stdout;
}

function normalizeFiles(value) {
  const values = Array.isArray(value) ? value : [value];
  return values.flatMap((item) => String(item).split(",")).map((item) => item.trim()).filter(Boolean);
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
    } else if (parsed[key]) {
      parsed[key] = Array.isArray(parsed[key]) ? [...parsed[key], next] : [parsed[key], next];
      index += 1;
    } else {
      parsed[key] = next;
      index += 1;
    }
  }
  return parsed;
}
