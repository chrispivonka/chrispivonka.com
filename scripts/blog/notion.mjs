/**
 * Minimal Notion REST client for the blog build. Uses global fetch (Node 24),
 * so the build needs no npm dependencies.
 */

const API = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";
const MAX_RETRIES = 4;

export function createNotionClient(token, { fetchImpl = fetch } = {}) {
  if (!token) {
    throw new Error("NOTION_TOKEN is not set");
  }

  async function request(path, { method = "GET", body } = {}) {
    for (let attempt = 0; ; attempt++) {
      const res = await fetchImpl(`${API}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          "Notion-Version": NOTION_VERSION,
          "Content-Type": "application/json"
        },
        body: body ? JSON.stringify(body) : undefined
      });
      if (res.ok) {
        return res.json();
      }
      // Rate limited or transient: back off and retry.
      if ((res.status === 429 || res.status >= 500) && attempt < MAX_RETRIES) {
        const retryAfter = Number(res.headers.get("retry-after")) || 2 ** attempt;
        await new Promise((r) => setTimeout(r, retryAfter * 1000));
        continue;
      }
      const text = await res.text();
      throw new Error(`Notion ${method} ${path} failed: ${res.status} ${text.slice(0, 300)}`);
    }
  }

  /** Every page in the database (filtering happens in JS so property types don't matter). */
  async function queryDatabase(databaseId) {
    const pages = [];
    let cursor;
    do {
      const data = await request(`/databases/${databaseId}/query`, {
        method: "POST",
        body: { page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) }
      });
      pages.push(...data.results);
      cursor = data.has_more ? data.next_cursor : undefined;
    } while (cursor);
    return pages;
  }

  /** All blocks of a page, recursively, with children attached as `block.children`. */
  async function getBlocks(blockId, depth = 0) {
    const blocks = [];
    let cursor;
    do {
      const qs = new URLSearchParams({ page_size: "100", ...(cursor ? { start_cursor: cursor } : {}) });
      const data = await request(`/blocks/${blockId}/children?${qs}`);
      blocks.push(...data.results);
      cursor = data.has_more ? data.next_cursor : undefined;
    } while (cursor);
    if (depth < 5) {
      for (const block of blocks) {
        // child pages/databases are separate documents, not part of the post
        if (block.has_children && block.type !== "child_page" && block.type !== "child_database") {
          block.children = await getBlocks(block.id, depth + 1);
        }
      }
    }
    return blocks;
  }

  return { request, queryDatabase, getBlocks };
}
