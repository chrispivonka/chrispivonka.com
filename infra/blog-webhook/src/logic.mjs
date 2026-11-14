/**
 * Pure decision logic for the Notion → GitHub blog webhook relay.
 * Kept free of AWS SDK imports so it can be unit tested directly.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export const PAGE_EVENTS = new Set([
  "page.created",
  "page.properties_updated",
  "page.content_updated",
  "page.deleted",
  "page.undeleted",
  "page.moved"
]);

export function normalizeId(id) {
  return String(id ?? "").replace(/-/g, "").toLowerCase();
}

/** Verify Notion's X-Notion-Signature header: "sha256=" + HMAC-SHA256(rawBody, verificationToken). */
export function verifySignature(rawBody, header, verificationToken) {
  if (!header || !verificationToken) {
    return false;
  }
  const expected = `sha256=${createHmac("sha256", verificationToken).update(rawBody).digest("hex")}`;
  const a = Buffer.from(expected);
  const b = Buffer.from(String(header));
  return a.length === b.length && timingSafeEqual(a, b);
}

/** The ids an event or page says it belongs to (database and data source). */
function parentIds(parent) {
  if (!parent) {
    return [];
  }
  return [parent.id, parent.database_id, parent.data_source_id].filter(Boolean).map(normalizeId);
}

export function belongsToDatabase(parent, databaseId) {
  return parentIds(parent).includes(normalizeId(databaseId));
}

function statusValue(prop) {
  if (!prop) {
    return null;
  }
  if (prop.type === "status") {
    return prop.status?.name ?? null;
  }
  if (prop.type === "select") {
    return prop.select?.name ?? null;
  }
  if (prop.type === "checkbox") {
    return prop.checkbox ? true : null;
  }
  return null;
}

/**
 * Decide whether an event should trigger a blog rebuild.
 *
 * event  — the Notion webhook payload
 * page   — the page fetched from the Notion API (null for deletions or if the fetch failed)
 *
 * Rebuild when:
 *  - a page in the blog database is deleted, restored or moved (it may have been published)
 *  - a published page changes in any way (content or properties)
 *  - the Status property of any page changes (covers unpublishing back to Draft)
 * Edits to drafts are ignored.
 *
 * Returns { rebuild: boolean, reason: string }.
 */
export function shouldRebuild({ event, page, databaseId, statusProperty = "Status", publishedValue = "Published" }) {
  if (!event || !PAGE_EVENTS.has(event.type)) {
    return { rebuild: false, reason: `ignored event type ${event?.type}` };
  }

  if (event.type === "page.deleted" || event.type === "page.moved") {
    const inDb = belongsToDatabase(event.data?.parent, databaseId) || (page && belongsToDatabase(page.parent, databaseId));
    return inDb
      ? { rebuild: true, reason: `${event.type} in blog database` }
      : { rebuild: false, reason: "page is not in the blog database" };
  }

  if (!page) {
    return { rebuild: false, reason: "page could not be fetched" };
  }
  if (!belongsToDatabase(page.parent, databaseId)) {
    return { rebuild: false, reason: "page is not in the blog database" };
  }

  const status = page.properties?.[statusProperty];
  const value = statusValue(status);
  const published = !page.archived && !page.in_trash && (value === true || value === publishedValue);
  if (published) {
    return { rebuild: true, reason: `${event.type} on a published page` };
  }

  const updated = (event.data?.updated_properties ?? []).map((p) => decodeURIComponent(String(p)));
  if (status?.id && updated.includes(decodeURIComponent(status.id))) {
    return { rebuild: true, reason: `status changed to ${value ?? "empty"}` };
  }
  if (event.type === "page.undeleted") {
    return { rebuild: false, reason: "restored page is not published" };
  }
  return { rebuild: false, reason: "edit to an unpublished page" };
}
