/**
 * Pure rendering helpers for the Notion-backed blog.
 *
 * Nothing in here talks to the network or the filesystem, so every function
 * can be unit tested with plain Notion API JSON. build-blog.mjs does the I/O.
 */

export const SITE_URL = "https://chrispivonka.com";
export const BLOG_PATH = "/blog";
const WORDS_PER_MINUTE = 230;

// ─────────────────────────────────────────────
// Small utilities
// ─────────────────────────────────────────────

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function slugify(text) {
  return String(text ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/** Notion ids come with or without dashes; compare them without. */
export function normalizeId(id) {
  return String(id ?? "").replace(/-/g, "").toLowerCase();
}

/** Only allow link targets that can't run script. */
export function safeHref(url) {
  const value = String(url ?? "").trim();
  if (/^(https?:|mailto:)/i.test(value) || value.startsWith("/") || value.startsWith("#")) {
    return value;
  }
  return null;
}

export function formatDate(isoDate, style = "long") {
  if (!isoDate) {
    return "";
  }
  const d = new Date(`${isoDate.slice(0, 10)}T12:00:00Z`);
  const opts = style === "short"
    ? { month: "short", day: "2-digit", timeZone: "UTC" }
    : { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" };
  return d.toLocaleDateString("en-US", opts);
}

// ─────────────────────────────────────────────
// Rich text and blocks → HTML
// ─────────────────────────────────────────────

export function plainText(richText = []) {
  return richText.map((t) => t.plain_text ?? "").join("");
}

export function richTextToHtml(richText = []) {
  return richText.map((t) => {
    let html = escapeHtml(t.plain_text ?? "").replace(/\n/g, "<br>");
    const a = t.annotations ?? {};
    if (a.code) {
      html = `<code>${html}</code>`;
    }
    if (a.bold) {
      html = `<strong>${html}</strong>`;
    }
    if (a.italic) {
      html = `<em>${html}</em>`;
    }
    if (a.strikethrough) {
      html = `<s>${html}</s>`;
    }
    if (a.underline) {
      html = `<u>${html}</u>`;
    }
    const href = safeHref(t.href ?? t.text?.link?.url);
    if (href) {
      const external = /^https?:/i.test(href) && !href.startsWith(SITE_URL);
      html = `<a href="${escapeHtml(href)}"${external ? " target=\"_blank\" rel=\"noopener noreferrer\"" : ""}>${html}</a>`;
    }
    return html;
  }).join("");
}

const LIST_TYPES = { bulleted_list_item: "ul", numbered_list_item: "ol", to_do: "ul" };

/**
 * Render a list of Notion blocks (with `children` already fetched) to HTML.
 * Returns { html, headings } where headings feed the table of contents.
 */
export function blocksToHtml(blocks = [], ctx = { headings: [], usedIds: new Set() }) {
  const out = [];
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const listTag = LIST_TYPES[block.type];
    if (listTag) {
      // group consecutive items of the same list type
      const items = [];
      while (i < blocks.length && blocks[i].type === block.type) {
        items.push(blocks[i]);
        i++;
      }
      i--;
      const cls = block.type === "to_do" ? " class=\"todo\"" : "";
      out.push(`<${listTag}${cls}>${items.map((item) => renderListItem(item, ctx)).join("")}</${listTag}>`);
      continue;
    }
    out.push(renderBlock(block, ctx));
  }
  return { html: out.filter(Boolean).join("\n"), headings: ctx.headings };
}

function childrenHtml(block, ctx) {
  return block.children?.length ? blocksToHtml(block.children, ctx).html : "";
}

function renderListItem(block, ctx) {
  const data = block[block.type];
  const text = richTextToHtml(data.rich_text);
  if (block.type === "to_do") {
    const mark = data.checked ? "[x]" : "[ ]";
    return `<li><span class="todo-mark">${mark}</span> ${text}${childrenHtml(block, ctx)}</li>`;
  }
  return `<li>${text}${childrenHtml(block, ctx)}</li>`;
}

function headingId(text, ctx) {
  const base = slugify(text) || "section";
  let id = base;
  let n = 2;
  while (ctx.usedIds.has(id)) {
    id = `${base}-${n++}`;
  }
  ctx.usedIds.add(id);
  return id;
}

export function renderBlock(block, ctx = { headings: [], usedIds: new Set() }) {
  const data = block[block.type] ?? {};
  switch (block.type) {
  case "paragraph": {
    const text = richTextToHtml(data.rich_text);
    return text ? `<p>${text}</p>${childrenHtml(block, ctx)}` : "";
  }
  case "heading_1":
  case "heading_2": {
    const text = plainText(data.rich_text);
    const id = headingId(text, ctx);
    ctx.headings.push({ id, text });
    return `<h2 id="${id}">${richTextToHtml(data.rich_text)}</h2>`;
  }
  case "heading_3": {
    const id = headingId(plainText(data.rich_text), ctx);
    return `<h3 id="${id}">${richTextToHtml(data.rich_text)}</h3>`;
  }
  case "quote":
    return `<blockquote>${richTextToHtml(data.rich_text)}${childrenHtml(block, ctx)}</blockquote>`;
  case "callout": {
    const icon = data.icon?.type === "emoji" ? data.icon.emoji : "";
    const label = icon ? `<b>${escapeHtml(icon)}</b>` : "";
    return `<div class="callout">${label}${richTextToHtml(data.rich_text)}${childrenHtml(block, ctx)}</div>`;
  }
  case "code": {
    const lang = data.language && data.language !== "plain text" ? data.language : "";
    const caption = plainText(data.caption) || lang || "code";
    return [
      "<div class=\"codeblock\">",
      `<div class="codeblock-bar"><span>${escapeHtml(caption)}</span><button class="btn-ghost copy-btn" type="button">copy</button></div>`,
      `<pre class="project-code"><code${lang ? ` class="language-${escapeHtml(slugify(lang))}"` : ""}>${escapeHtml(plainText(data.rich_text))}</code></pre>`,
      "</div>"
    ].join("");
  }
  case "image": {
    if (!block._localSrc) {
      return "";
    }
    const caption = plainText(data.caption);
    const cap = caption ? `<figcaption>${richTextToHtml(data.caption)}</figcaption>` : "";
    return `<figure><img src="${escapeHtml(block._localSrc)}" alt="${escapeHtml(caption)}" loading="lazy" decoding="async">${cap}</figure>`;
  }
  case "divider":
    return "<hr>";
  case "toggle":
    return `<details><summary>${richTextToHtml(data.rich_text)}</summary>${childrenHtml(block, ctx)}</details>`;
  case "bookmark":
  case "embed":
  case "video":
  case "link_preview": {
    const href = safeHref(data.url ?? data.external?.url);
    if (!href) {
      return "";
    }
    const label = plainText(data.caption) || href;
    return `<p class="embed-link"><a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)} ↗</a></p>`;
  }
  case "table": {
    const rows = block.children ?? [];
    const body = rows.map((row, idx) => {
      const tag = data.has_column_header && idx === 0 ? "th" : "td";
      const cells = (row.table_row?.cells ?? []).map((cell) => `<${tag}>${richTextToHtml(cell)}</${tag}>`).join("");
      return `<tr>${cells}</tr>`;
    }).join("");
    return `<div class="table-wrap"><table>${body}</table></div>`;
  }
  case "column_list":
  case "column":
  case "synced_block":
    return childrenHtml(block, ctx);
  default:
    return "";
  }
}

// ─────────────────────────────────────────────
// Notion page → post model
// ─────────────────────────────────────────────

export const DEFAULT_SCHEMA = {
  status: "Status",
  publishedValue: "Published",
  slug: "Slug",
  date: "Date",
  tags: "Tags",
  summary: "Summary"
};

export function propertyValue(prop) {
  if (!prop) {
    return null;
  }
  switch (prop.type) {
  case "title":
  case "rich_text":
    return plainText(prop[prop.type]);
  case "status":
  case "select":
    return prop[prop.type]?.name ?? null;
  case "multi_select":
    return (prop.multi_select ?? []).map((o) => o.name);
  case "date":
    return prop.date?.start ?? null;
  case "checkbox":
    return Boolean(prop.checkbox);
  default:
    return null;
  }
}

export function isPublished(page, schema = DEFAULT_SCHEMA) {
  if (page.archived || page.in_trash) {
    return false;
  }
  const value = propertyValue(page.properties?.[schema.status]);
  return value === true || value === schema.publishedValue;
}

export function pageToPost(page, schema = DEFAULT_SCHEMA) {
  const props = page.properties ?? {};
  const titleProp = Object.values(props).find((p) => p.type === "title");
  const title = propertyValue(titleProp) || "Untitled";
  const shortId = normalizeId(page.id).slice(0, 7);
  const tags = (propertyValue(props[schema.tags]) || []).map((t) => slugify(t)).filter(Boolean);
  return {
    id: page.id,
    shortId,
    title,
    slug: slugify(propertyValue(props[schema.slug]) || title) || shortId,
    date: (propertyValue(props[schema.date]) || page.created_time || "").slice(0, 10),
    updated: (page.last_edited_time || "").slice(0, 10),
    tags,
    summary: propertyValue(props[schema.summary]) || ""
  };
}

/** Newest first, with unique slugs. */
export function preparePosts(posts) {
  const sorted = [...posts].sort((a, b) => (b.date || "").localeCompare(a.date || "") || a.title.localeCompare(b.title));
  const seen = new Set();
  for (const post of sorted) {
    if (seen.has(post.slug)) {
      post.slug = `${post.slug}-${post.shortId}`;
    }
    seen.add(post.slug);
  }
  return sorted;
}

export function countWords(html) {
  const text = String(html).replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, " ");
  return text.split(/\s+/).filter(Boolean).length;
}

export function readingMinutes(html) {
  return Math.max(1, Math.round(countWords(html) / WORDS_PER_MINUTE));
}

// ─────────────────────────────────────────────
// Page templates
// ─────────────────────────────────────────────

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data:",
  "connect-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "upgrade-insecure-requests"
].join("; ");

export function postUrl(post) {
  return `${BLOG_PATH}/${post.slug}.html`;
}

function head({ title, description, url, type = "website", extra = "" }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="${CSP}">
  <meta name="referrer" content="strict-origin-when-cross-origin">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="author" content="Chris Pivonka">
  <link rel="canonical" href="${escapeHtml(SITE_URL + url)}">
  <meta property="og:type" content="${type}">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${escapeHtml(SITE_URL + url)}">
  <link rel="alternate" type="application/rss+xml" title="Chris Pivonka — Blog" href="${BLOG_PATH}/rss.xml">
  <link rel="icon" href="/assets/favicon.ico">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500;600;700&family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/css/styles.css">
  <link rel="stylesheet" href="/css/blog.css">${extra}
</head>`;
}

function statusBar(centerText) {
  return `<header class="status-bar">
    <div class="status-bar-inner">
      <nav class="status-left blog-nav" aria-label="Site">
        <span class="status-dot"></span>
        <a href="/index.html">chrispivonka.com</a>
        <span class="status-separator">│</span>
        <a href="/index.html">home</a>
        <a href="/projects.html">projects</a>
        <a href="${BLOG_PATH}/index.html" class="on" aria-current="page">blog</a>
        <a href="/resume.html">resume</a>
      </nav>
      <div class="status-center">● ${escapeHtml(centerText)}</div>
      <div class="status-right"><span>Denver, CO</span></div>
    </div>
  </header>`;
}

function footer() {
  return `<footer class="blog-foot"><div><span><span class="status-dot"></span> All systems operational</span><span>&copy; ${new Date().getUTCFullYear()} Chris Pivonka · <a href="${BLOG_PATH}/rss.xml">rss</a></span></div></footer>
<script src="/js/blog.js" defer></script>
</body>
</html>
`;
}

function pills(tags) {
  return tags.map((t) => `<span class="tech-pill">${escapeHtml(t)}</span>`).join("");
}

export function renderIndex(posts) {
  const allTags = [...new Set(posts.flatMap((p) => p.tags))].sort();
  const [latest, ...rest] = posts;
  const filter = allTags.length
    ? `<div class="tag-filter" role="group" aria-label="Filter posts by tag">
        <button class="tech-pill on" type="button" data-tag="">all</button>
        ${allTags.map((t) => `<button class="tech-pill" type="button" data-tag="${escapeHtml(t)}">${escapeHtml(t)}</button>`).join("\n        ")}
      </div>`
    : "<div></div>";

  const featured = latest
    ? `<article class="project-card featured post-item" data-tags="${escapeHtml(latest.tags.join(" "))}">
        <div class="featured-head">
          <span class="project-status"><span class="status-dot"></span> LATEST</span>
          <span class="meta">${formatDate(latest.date)} · ${latest.minutes} min read</span>
        </div>
        <h2><a href="${postUrl(latest)}">${escapeHtml(latest.title)}</a></h2>
        ${latest.summary ? `<p>${escapeHtml(latest.summary)}</p>` : ""}
        <div class="pills">${pills(latest.tags)}</div>
        <a class="project-link" href="${postUrl(latest)}">read() →</a>
      </article>`
    : `<div class="project-card empty-log">
        <p class="meta">fatal: your current branch 'blog' does not have any commits yet</p>
        <p>No posts published yet. Check back soon, or subscribe to the RSS feed.</p>
      </div>`;

  const rows = rest.map((p) => `<a class="post-row post-item" href="${postUrl(p)}" data-tags="${escapeHtml(p.tags.join(" "))}">
        <span class="post-hash">${p.shortId}</span>
        <span class="post-title">${escapeHtml(p.title)}</span>
        <span class="post-date">${formatDate(p.date, "short")}</span>
        ${p.summary ? `<span class="post-excerpt">${escapeHtml(p.summary)}</span>` : ""}
        ${p.tags.length ? `<span class="post-tags">${pills(p.tags)}</span>` : ""}
      </a>`).join("\n      ");

  const description = "Writing by Chris Pivonka on distributed systems, cloud infrastructure, CI/CD and engineering leadership.";
  return `${head({ title: "Blog — Chris Pivonka", description, url: `${BLOG_PATH}/index.html` })}
<body class="blog">
  ${statusBar(`${posts.length} POST${posts.length === 1 ? "" : "S"} PUBLISHED`)}
  <main class="section blog-main" id="main-content">
    <div class="section-label">// blog.ts</div>
    <h1 class="section-title">$ git log --oneline ~/blog</h1>
    <p class="section-sub">Notes from building high-scale backend systems, running side projects on AWS, and leading engineering teams.</p>
    <div class="blog-toolbar">
      ${filter}
      <a class="rss" href="${BLOG_PATH}/rss.xml">rss.xml ↗</a>
    </div>
    ${featured}
    ${rest.length ? `<div class="log">
      ${rows}
      <div class="log-foot">(END) · ${posts.length} post${posts.length === 1 ? "" : "s"}</div>
    </div>` : ""}
    <div class="subscribe">
      <span><span class="c-green">$</span> subscribe --via <span class="c-cyan">rss</span> <span class="c-dim">or</span> <span class="c-cyan">linkedin</span></span>
      <span class="subscribe-links"><a class="btn-ghost" href="${BLOG_PATH}/rss.xml">RSS feed</a><a class="btn-ghost" href="https://www.linkedin.com/in/chrispivonka" target="_blank" rel="noopener noreferrer">Follow on LinkedIn</a></span>
    </div>
  </main>
  ${footer()}`;
}

function jsonLd(post) {
  const data = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.summary || undefined,
    datePublished: post.date,
    dateModified: post.updated || post.date,
    author: { "@type": "Person", name: "Chris Pivonka", url: SITE_URL },
    url: SITE_URL + postUrl(post),
    keywords: post.tags.join(", ") || undefined
  };
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export function renderPost(post, { older = null, newer = null } = {}) {
  const toc = post.headings.length
    ? `<aside class="toc" aria-label="On this page">
      <div class="toc-title">// on this page</div>
      <ol>${post.headings.map((h) => `<li><a href="#${h.id}">${escapeHtml(h.text)}</a></li>`).join("")}</ol>
      <div class="toc-meta">
        <span>published ${escapeHtml(post.date)}</span>
        ${post.updated && post.updated !== post.date ? `<span>edited ${escapeHtml(post.updated)}</span>` : ""}
      </div>
    </aside>`
    : "";
  const prev = older
    ? `<a href="${postUrl(older)}"><span>← older</span>${escapeHtml(older.title)}</a>`
    : `<a href="${BLOG_PATH}/index.html"><span>← all posts</span>git log --oneline ~/blog</a>`;
  const next = newer
    ? `<a href="${postUrl(newer)}"><span>newer →</span>${escapeHtml(newer.title)}</a>`
    : `<a href="${BLOG_PATH}/index.html"><span>all posts →</span>git log --oneline ~/blog</a>`;
  const shareUrl = encodeURIComponent(SITE_URL + postUrl(post));

  return `${head({
    title: `${post.title} — Chris Pivonka`,
    description: post.summary || post.title,
    url: postUrl(post),
    type: "article",
    extra: `\n  <meta property="article:published_time" content="${escapeHtml(post.date)}">\n  <script type="application/ld+json">${jsonLd(post)}</script>`
  })}
<body class="blog">
  ${statusBar(`READING · ${post.minutes} MIN`)}
  <div class="post-wrap${toc ? "" : " no-toc"}">
    <article id="main-content">
      <div class="crumb"><a href="${BLOG_PATH}/index.html">~/blog</a> / ${escapeHtml(post.slug)}.md</div>
      <header class="post-head">
        ${post.tags.length ? `<div class="pills">${pills(post.tags)}</div>` : ""}
        <h1>${escapeHtml(post.title)}</h1>
        ${post.summary ? `<p class="lede">${escapeHtml(post.summary)}</p>` : ""}
        <div class="byline">
          <span class="avatar" aria-hidden="true">CP</span>
          <span class="byline-name">Chris Pivonka</span>
          <time class="meta" datetime="${escapeHtml(post.date)}">${formatDate(post.date)}</time>
          <span class="meta">${post.minutes} min read</span>
          <span class="meta c-green">id ${post.shortId}</span>
        </div>
      </header>
      <div class="prose">
${post.html}
      </div>
      <footer class="post-foot">
        <div class="share"><span>share:</span><a class="btn-ghost" href="https://www.linkedin.com/sharing/share-offsite/?url=${shareUrl}" target="_blank" rel="noopener noreferrer">LinkedIn</a><button class="btn-ghost copy-link" type="button">copy link</button><a class="btn-ghost" href="${BLOG_PATH}/rss.xml">rss</a></div>
        <nav class="prevnext" aria-label="More posts">${prev}${next}</nav>
      </footer>
    </article>
    ${toc}
  </div>
  ${footer()}`;
}

function xmlEscape(value) {
  return escapeHtml(value);
}

export function renderRss(posts) {
  const items = posts.map((p) => `    <item>
      <title>${xmlEscape(p.title)}</title>
      <link>${SITE_URL}${postUrl(p)}</link>
      <guid isPermaLink="false">${xmlEscape(p.id)}</guid>
      <pubDate>${new Date(`${p.date}T12:00:00Z`).toUTCString()}</pubDate>
      ${p.summary ? `<description>${xmlEscape(p.summary)}</description>` : ""}
      ${p.tags.map((t) => `<category>${xmlEscape(t)}</category>`).join("")}
    </item>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Chris Pivonka — Blog</title>
    <link>${SITE_URL}${BLOG_PATH}/index.html</link>
    <description>Writing on distributed systems, cloud infrastructure and engineering leadership.</description>
    <language>en-us</language>
    <atom:link href="${SITE_URL}${BLOG_PATH}/rss.xml" rel="self" type="application/rss+xml"/>
${items}
  </channel>
</rss>
`;
}

export function renderSitemap(posts) {
  const urls = [
    { loc: `${SITE_URL}${BLOG_PATH}/index.html`, lastmod: posts[0]?.updated || posts[0]?.date },
    ...posts.map((p) => ({ loc: SITE_URL + postUrl(p), lastmod: p.updated || p.date }))
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${xmlEscape(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ""}</url>`).join("\n")}
</urlset>
`;
}
