import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const htmlFiles = [
  "index.html",
  "archive.html",
  "article.html",
  "entry.html",
  "guestbook.html",
  "tags.html",
  "friends/index.html",
  "admin/comments/index.html",
];

const assetPattern = /((?:href|src)=["'])([^"']*assets\/(?:css|js)\/[^"'?]+\.(?:css|js))(?:\?v=[^"']*)?(["'])/g;

function buildVersion(content) {
  return crypto.createHash("sha1").update(content).digest("hex").slice(0, 10);
}

async function versionHtmlFile(relativeHtmlPath) {
  const absoluteHtmlPath = path.join(rootDir, relativeHtmlPath);
  const htmlDir = path.dirname(absoluteHtmlPath);
  const original = await fs.readFile(absoluteHtmlPath, "utf8");

  let changed = false;
  const next = await replaceAsync(original, assetPattern, async (_match, prefix, assetPath, suffix) => {
    const absoluteAssetPath = path.resolve(htmlDir, assetPath);
    const assetContent = await fs.readFile(absoluteAssetPath);
    const version = buildVersion(assetContent);
    const replacement = `${prefix}${assetPath}?v=${version}${suffix}`;
    if (replacement !== _match) {
      changed = true;
    }
    return replacement;
  });

  if (changed) {
    await fs.writeFile(absoluteHtmlPath, next, "utf8");
  }

  return { file: relativeHtmlPath, changed };
}

async function replaceAsync(input, regex, replacer) {
  const matches = [...input.matchAll(regex)];
  if (!matches.length) {
    return input;
  }

  let output = "";
  let lastIndex = 0;
  for (const match of matches) {
    const [fullMatch] = match;
    const index = match.index ?? 0;
    output += input.slice(lastIndex, index);
    output += await replacer(...match);
    lastIndex = index + fullMatch.length;
  }
  output += input.slice(lastIndex);
  return output;
}

async function main() {
  const results = await Promise.all(htmlFiles.map((file) => versionHtmlFile(file)));
  const changedCount = results.filter((item) => item.changed).length;
  console.log(`Versioned asset URLs in ${changedCount}/${results.length} HTML files.`);
}

main().catch((error) => {
  console.error("Failed to version asset URLs:", error);
  process.exitCode = 1;
});
