const NOTION_API_BASE = "https://api.notion.com/v1";
const NOTION_API_VERSION = "2022-06-28";

function tryParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export class NotionClient {
  constructor({ token }) {
    this.token = token;
  }

  async request(endpoint, { method = "GET", body } = {}) {
    const response = await fetch(`${NOTION_API_BASE}${endpoint}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Notion-Version": NOTION_API_VERSION,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const text = await response.text();
    const data = tryParseJson(text);

    if (!response.ok) {
      const message = data?.message || text || "Unknown Notion API error";
      throw new Error(`Notion API 请求失败 (${response.status})：${message}`);
    }

    return data;
  }

  async queryDatabase(databaseId, payload = {}) {
    return this.request(`/databases/${databaseId}/query`, {
      method: "POST",
      body: payload,
    });
  }

  async listBlockChildren(blockId, payload = {}) {
    const search = new URLSearchParams();
    if (payload.start_cursor) {
      search.set("start_cursor", payload.start_cursor);
    }
    if (payload.page_size) {
      search.set("page_size", String(payload.page_size));
    }

    const suffix = search.size ? `?${search.toString()}` : "";
    return this.request(`/blocks/${blockId}/children${suffix}`);
  }
}

export async function queryDatabasePages(client, databaseId, payload = {}) {
  const results = [];
  let nextCursor = null;

  do {
    const page = await client.queryDatabase(databaseId, {
      page_size: 100,
      ...payload,
      start_cursor: nextCursor || undefined,
    });

    results.push(...(page.results || []));
    nextCursor = page.has_more ? page.next_cursor : null;
  } while (nextCursor);

  return results;
}

export async function listAllBlockChildren(client, blockId) {
  const blocks = [];
  let nextCursor = null;

  do {
    const page = await client.listBlockChildren(blockId, {
      page_size: 100,
      start_cursor: nextCursor || undefined,
    });

    blocks.push(...(page.results || []));
    nextCursor = page.has_more ? page.next_cursor : null;
  } while (nextCursor);

  return blocks;
}
