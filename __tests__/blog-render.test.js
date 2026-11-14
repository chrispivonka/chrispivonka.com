/**
 * @jest-environment node
 */
import { readFileSync } from "node:fs";
import {
  escapeHtml, slugify, safeHref, richTextToHtml, blocksToHtml, pageToPost, isPublished,
  preparePosts, readingMinutes, renderIndex, renderPost, renderRss, renderSitemap, propertyValue
} from "../scripts/blog/render.mjs";

const fixture = JSON.parse(readFileSync(new URL("../scripts/blog/fixtures/sample.json", import.meta.url), "utf8"));

const rt = (text, annotations = {}, href = null) => ({
  plain_text: text, href, annotations: { bold: false, italic: false, strikethrough: false, underline: false, code: false, ...annotations }
});

describe("blog helpers", () => {
  test("escapeHtml escapes markup and quotes", () => {
    expect(escapeHtml("<a href=\"x\">'&'</a>")).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
  });

  test("slugify makes URL-safe slugs", () => {
    expect(slugify("Putting a cat camera behind Lambda@Edge auth!")).toBe("putting-a-cat-camera-behind-lambda-edge-auth");
    expect(slugify("Café déjà vu")).toBe("cafe-deja-vu");
    expect(slugify("   ")).toBe("");
  });

  test("safeHref blocks script URLs", () => {
    expect(safeHref("javascript:alert(1)")).toBeNull();
    expect(safeHref("data:text/html,hi")).toBeNull();
    expect(safeHref("https://example.com")).toBe("https://example.com");
    expect(safeHref("/projects.html")).toBe("/projects.html");
  });
});

describe("richTextToHtml", () => {
  test("applies annotations and escapes text", () => {
    const html = richTextToHtml([rt("<b>"), rt("bold", { bold: true }), rt("x()", { code: true })]);
    expect(html).toBe("&lt;b&gt;<strong>bold</strong><code>x()</code>");
  });

  test("renders safe links and drops unsafe ones", () => {
    expect(richTextToHtml([rt("site", {}, "https://example.com")])).toContain("href=\"https://example.com\"");
    expect(richTextToHtml([rt("site", {}, "https://example.com")])).toContain("rel=\"noopener noreferrer\"");
    expect(richTextToHtml([rt("bad", {}, "javascript:alert(1)")])).toBe("bad");
  });
});

describe("blocksToHtml", () => {
  test("groups list items and collects headings for the TOC", () => {
    const blocks = [
      { type: "heading_2", heading_2: { rich_text: [rt("Intro")] } },
      { type: "bulleted_list_item", bulleted_list_item: { rich_text: [rt("one")] } },
      { type: "bulleted_list_item", bulleted_list_item: { rich_text: [rt("two")] } },
      { type: "paragraph", paragraph: { rich_text: [rt("after")] } },
      { type: "heading_2", heading_2: { rich_text: [rt("Intro")] } }
    ];
    const { html, headings } = blocksToHtml(blocks);
    expect(html).toContain("<ul><li>one</li><li>two</li></ul>");
    expect(headings).toEqual([{ id: "intro", text: "Intro" }, { id: "intro-2", text: "Intro" }]);
  });

  test("escapes code blocks and skips images that were not downloaded", () => {
    const { html } = blocksToHtml([
      { type: "code", code: { language: "javascript", caption: [], rich_text: [rt("if (a < b) {}")] } },
      { type: "image", image: { type: "external", external: { url: "https://x/y.png" }, caption: [] } }
    ]);
    expect(html).toContain("if (a &lt; b) {}");
    expect(html).not.toContain("<img");
  });

  test("renders downloaded images with their caption as alt text", () => {
    const { html } = blocksToHtml([{ type: "image", _localSrc: "/blog/images/abc.png", image: { caption: [rt("Diagram")] } }]);
    expect(html).toContain("<img src=\"/blog/images/abc.png\" alt=\"Diagram\"");
  });

  test("ignores unsupported blocks", () => {
    expect(blocksToHtml([{ type: "child_database", child_database: {} }]).html).toBe("");
  });
});

describe("posts", () => {
  const entries = fixture.pages;

  test("only Published pages count", () => {
    const published = entries.filter((e) => isPublished(e.page));
    expect(published).toHaveLength(5);
    expect(isPublished({ ...entries[0].page, archived: true })).toBe(false);
  });

  test("pageToPost reads properties and falls back to a title slug", () => {
    const post = pageToPost(entries[0].page);
    expect(post).toMatchObject({
      title: "Putting a cat camera behind Lambda@Edge auth",
      slug: "putting-a-cat-camera-behind-lambda-edge-auth",
      date: "2026-11-12",
      shortId: "a3f9c21",
      tags: ["aws", "lambda-edge", "homelab"]
    });
  });

  test("preparePosts sorts newest first and de-duplicates slugs", () => {
    const a = { title: "Same", slug: "same", date: "2026-01-01", shortId: "aaaaaaa" };
    const b = { title: "Same", slug: "same", date: "2026-02-01", shortId: "bbbbbbb" };
    const [first, second] = preparePosts([a, b]);
    expect(first.slug).toBe("same");
    expect(second.slug).toBe("same-aaaaaaa");
  });

  test("propertyValue handles select and checkbox", () => {
    expect(propertyValue({ type: "select", select: { name: "Published" } })).toBe("Published");
    expect(propertyValue({ type: "checkbox", checkbox: true })).toBe(true);
  });

  test("readingMinutes is at least one", () => {
    expect(readingMinutes("<p>short</p>")).toBe(1);
    expect(readingMinutes(`<p>${"word ".repeat(1150)}</p>`)).toBe(5);
  });
});

describe("templates", () => {
  const posts = preparePosts(fixture.pages.filter((e) => isPublished(e.page)).map(({ page, blocks }) => {
    const { html, headings } = blocksToHtml(blocks);
    return { ...pageToPost(page), html, headings, minutes: readingMinutes(html) };
  }));

  test("index lists every post and the tag filter", () => {
    const html = renderIndex(posts);
    posts.forEach((p) => expect(html).toContain(`/blog/${p.slug}.html`));
    expect(html).toContain("data-tag=\"homelab\"");
    expect(html).toContain("5 POSTS PUBLISHED");
    expect(html).not.toContain("Draft: notes");
  });

  test("index has an empty state", () => {
    expect(renderIndex([])).toContain("No posts published yet");
  });

  test("post page has TOC, canonical URL, JSON-LD and prev/next", () => {
    const html = renderPost(posts[0], { older: posts[1] });
    expect(html).toContain("<link rel=\"canonical\" href=\"https://chrispivonka.com/blog/putting-a-cat-camera-behind-lambda-edge-auth.html\">");
    expect(html).toContain("href=\"#why-check-auth-at-the-edge\"");
    expect(html).toContain("\"@type\":\"BlogPosting\"");
    expect(html).toContain(posts[1].title);
    expect(html).toContain("script-src 'self'");
  });

  test("JSON-LD cannot break out of its script tag", () => {
    const evil = { ...posts[0], title: "</script><script>alert(1)</script>" };
    const html = renderPost(evil);
    const ld = html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1];
    expect(ld).not.toContain("<");
  });

  test("RSS and sitemap include every post", () => {
    const rss = renderRss(posts);
    const sitemap = renderSitemap(posts);
    expect((rss.match(/<item>/g) || []).length).toBe(posts.length);
    expect((sitemap.match(/<url>/g) || []).length).toBe(posts.length + 1);
  });
});
