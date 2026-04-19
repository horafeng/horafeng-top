import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = path.resolve(SCRIPT_DIR, "..", "..");

const ENV_FILES = [".env", ".env.local", ".env.notion"];

function parseEnvFile(text) {
  const result = {};
  const lines = String(text || "").split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    result[key] = value;
  }

  return result;
}

export function loadLocalEnv() {
  for (const fileName of ENV_FILES) {
    const filePath = path.join(PROJECT_ROOT, fileName);
    if (!existsSync(filePath)) {
      continue;
    }

    const parsed = parseEnvFile(readFileSync(filePath, "utf8"));
    for (const [key, value] of Object.entries(parsed)) {
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  }
}

function hyphenateDatabaseId(value) {
  const compact = value.replace(/-/g, "");
  if (!/^[0-9a-fA-F]{32}$/.test(compact)) {
    return "";
  }

  return [
    compact.slice(0, 8),
    compact.slice(8, 12),
    compact.slice(12, 16),
    compact.slice(16, 20),
    compact.slice(20),
  ].join("-");
}

export function parseDatabaseIdFromUrl(input) {
  const value = String(input || "").trim();
  if (!value) {
    return "";
  }

  const hyphenatedMatch = value.match(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/);
  if (hyphenatedMatch) {
    return hyphenatedMatch[0].toLowerCase();
  }

  const compactMatch = value.match(/[0-9a-fA-F]{32}/);
  if (compactMatch) {
    return hyphenateDatabaseId(compactMatch[0].toLowerCase());
  }

  return "";
}

export function resolveNotionConfig() {
  loadLocalEnv();

  const token = String(process.env.NOTION_TOKEN || "").trim();
  const explicitDatabaseId = String(process.env.NOTION_DATABASE_ID || "").trim();
  const databaseUrl = String(process.env.NOTION_DATABASE_URL || "").trim();
  const sitePageUrl = String(process.env.NOTION_SITE_PAGE_URL || process.env.NOTION_DATABASE_PUBLIC_URL || "").trim();
  const databaseId = parseDatabaseIdFromUrl(explicitDatabaseId) || parseDatabaseIdFromUrl(databaseUrl);

  if (!token) {
    throw new Error("缺少 NOTION_TOKEN。请在本地 .env / .env.local 中配置，或先导出环境变量。");
  }

  if (!databaseId) {
    throw new Error("缺少 NOTION_DATABASE_ID，且无法从 NOTION_DATABASE_URL 解析数据库 ID。");
  }

  return {
    token,
    databaseId,
    databaseUrl,
    sitePageUrl,
  };
}
