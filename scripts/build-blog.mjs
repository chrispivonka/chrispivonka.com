#!/usr/bin/env node
/**
 * Build the static blog from a Notion database.
 *
 *   NOTION_TOKEN=... NOTION_DATABASE_ID=... node scripts/build-blog.mjs
 *
 * Writes blog/index.html, blog/<slug>.html, blog/rss.xml, blog/sitemap.xml and
 * blog/images/*. The blog/ folder is generated, so it is gitignored.
 *
 * For local previews without Notion, point BLOG_FIXTURE at a JSON file shaped
 * like scripts/blog/fixtures/sample.json:
 *
 *   BLOG_FIXTURE=scripts/blog/fixtures/sample.json node scripts/build-blog.mjs
 */

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createNotionClient } from "./blog/notion.mjs";
import {
  BLOG_PATH, DEFAULT_SCHEMA, blocksToHtml, isPublished, pageToPost, preparePosts,
  readingMinutes, renderIndex, renderPost, renderRss, renderSitemap
} from "./blog/render.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "blog");
const IMAGE_DIR = path.join(OUT, "images");
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const IMAGE_TYPES = { "image/png": ".png", "image/jpeg": ".jpg", "image/gif": ".gif", "image/webp": ".webp", "image/svg+xml": ".svg", "image/avif": ".avif" };

const schema = {
  ...DEFAULT_SCHEMA,
  ...(process.env.NOTION_STATUS_PROPERTY && { status: process.env.NOTION_STATUS_PROPERTY }),
  ...(process.env.NOTION_PUBLISHED_VALUE && { publishedValue: process.env.NOTION_PUBLISHED_VALUE })
};

function walk(blocks, fn) {
  for (const b of blocks) {
    fn(b);
    if (b.children) {
      walk(b.children, fn);
    }
  }
}

/** Notion file URLs expire after about an hour, so every image is copied into the site. */
async function downloadImages(blocks) {
  const images = [];
  walk(blocks, (b) => {
    if (b.type === "image") {
      images.push(b);
    }
  });
  for (const block of images) {
    const url = block.image?.file?.url ?? block.image?.external?.url;
    if (!url || !/^https:/i.test(url)) {
      continue;
    }
    try {
      const res = await fetch(url);
      const type = (res.headers.get("content-type") || "").split(";")[0].trim();
      const ext = IMAGE_TYPES[type];
      if (!res.ok || !ext) {
        throw new Error(`status ${res.status}, type ${type || "unknown"}`);
      }
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > MAX_IMAGE_BYTES) {
        throw new Error(`image is ${buf.length} bytes, over the ${MAX_IMAGE_BYTES} limit`);
      }
      const name = `${createHash("sha256").update(buf).digest("hex").slice(0, 16)}${ext}`;
      await writeFile(path.join(IMAGE_DIR, name), buf);
      block._localSrc = `${BLOG_PATH}/images/${name}`;
    } catch (err) {
      console.warn(`Skipping image in block ${block.id}: ${err.message}`);
    }
  }
}

async function loadFromNotion() {
  const dbId = process.env.NOTION_DATABASE_ID;
  if (!dbId) {
    throw new Error("NOTION_DATABASE_ID is not set");
  }
  const notion = createNotionClient(process.env.NOTION_TOKEN);
  const pages = (await notion.queryDatabase(dbId)).filter((p) => isPublished(p, schema));
  const entries = [];
  for (const page of pages) {
    entries.push({ page, blocks: await notion.getBlocks(page.id) });
  }
  return entries;
}

async function loadFromFixture(file) {
  const data = JSON.parse(await readFile(path.resolve(ROOT, file), "utf8"));
  return data.pages.filter((e) => isPublished(e.page, schema));
}

async function main() {
  const fixture = process.env.BLOG_FIXTURE;
  const entries = fixture ? await loadFromFixture(fixture) : await loadFromNotion();

  await rm(OUT, { recursive: true, force: true });
  await mkdir(IMAGE_DIR, { recursive: true });

  const posts = [];
  for (const { page, blocks } of entries) {
    if (!fixture) {
      await downloadImages(blocks);
    }
    const { html, headings } = blocksToHtml(blocks);
    posts.push({ ...pageToPost(page, schema), html, headings, minutes: readingMinutes(html) });
  }
  const ordered = preparePosts(posts);

  await writeFile(path.join(OUT, "index.html"), renderIndex(ordered));
  for (let i = 0; i < ordered.length; i++) {
    const post = ordered[i];
    const html = renderPost(post, { newer: ordered[i - 1] ?? null, older: ordered[i + 1] ?? null });
    await writeFile(path.join(OUT, `${post.slug}.html`), html);
  }
  await writeFile(path.join(OUT, "rss.xml"), renderRss(ordered));
  await writeFile(path.join(OUT, "sitemap.xml"), renderSitemap(ordered));

  console.warn(`Built ${ordered.length} post(s) into ${path.relative(ROOT, OUT)}/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
