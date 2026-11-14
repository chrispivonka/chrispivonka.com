/**
 * @jest-environment node
 */
import { createHmac } from "node:crypto";
import { verifySignature, shouldRebuild, belongsToDatabase } from "../infra/blog-webhook/src/logic.mjs";

const DB = "1a2b3c4d5e6f40718293a4b5c6d7e8f9";
const DB_DASHED = "1a2b3c4d-5e6f-4071-8293-a4b5c6d7e8f9";

function page({ status = "Published", parent = DB_DASHED, archived = false } = {}) {
  return {
    id: "page-1",
    archived,
    parent: { type: "database_id", database_id: parent },
    properties: { Status: { id: "st%3A", type: "status", status: status ? { name: status } : null } }
  };
}

describe("verifySignature", () => {
  const token = "secret_verification_token";
  const body = JSON.stringify({ type: "page.content_updated" });
  const good = `sha256=${createHmac("sha256", token).update(body).digest("hex")}`;

  test("accepts a correct signature", () => {
    expect(verifySignature(body, good, token)).toBe(true);
  });

  test("rejects tampered bodies, wrong tokens and missing headers", () => {
    expect(verifySignature(`${body} `, good, token)).toBe(false);
    expect(verifySignature(body, good, "other")).toBe(false);
    expect(verifySignature(body, undefined, token)).toBe(false);
    expect(verifySignature(body, "sha256=short", token)).toBe(false);
  });
});

describe("belongsToDatabase", () => {
  test("matches ids with or without dashes, and data source parents", () => {
    expect(belongsToDatabase({ id: DB_DASHED, type: "database" }, DB)).toBe(true);
    expect(belongsToDatabase({ type: "data_source", data_source_id: "x", database_id: DB }, DB_DASHED)).toBe(true);
    expect(belongsToDatabase({ id: "other" }, DB)).toBe(false);
  });
});

describe("shouldRebuild", () => {
  const base = { databaseId: DB };

  test("rebuilds when a published post's content changes", () => {
    const r = shouldRebuild({ ...base, event: { type: "page.content_updated", data: {} }, page: page() });
    expect(r.rebuild).toBe(true);
  });

  test("ignores edits to drafts", () => {
    const r = shouldRebuild({ ...base, event: { type: "page.content_updated", data: {} }, page: page({ status: "Draft" }) });
    expect(r.rebuild).toBe(false);
  });

  test("rebuilds when a post is unpublished (Status changed away from Published)", () => {
    const event = { type: "page.properties_updated", data: { updated_properties: ["st%3A"] } };
    const r = shouldRebuild({ ...base, event, page: page({ status: "Draft" }) });
    expect(r).toEqual({ rebuild: true, reason: "status changed to Draft" });
  });

  test("ignores non-status property edits on drafts", () => {
    const event = { type: "page.properties_updated", data: { updated_properties: ["tags"] } };
    expect(shouldRebuild({ ...base, event, page: page({ status: "Draft" }) }).rebuild).toBe(false);
  });

  test("ignores pages from other databases", () => {
    const r = shouldRebuild({ ...base, event: { type: "page.content_updated", data: {} }, page: page({ parent: "ffff" }) });
    expect(r.rebuild).toBe(false);
  });

  test("rebuilds on deletion of a page in the blog database", () => {
    const event = { type: "page.deleted", data: { parent: { id: DB_DASHED, type: "database" } } };
    expect(shouldRebuild({ ...base, event, page: null }).rebuild).toBe(true);
  });

  test("archived pages are treated as unpublished", () => {
    const r = shouldRebuild({ ...base, event: { type: "page.content_updated", data: {} }, page: page({ archived: true }) });
    expect(r.rebuild).toBe(false);
  });

  test("ignores non-page events and missing pages", () => {
    expect(shouldRebuild({ ...base, event: { type: "comment.created" }, page: page() }).rebuild).toBe(false);
    expect(shouldRebuild({ ...base, event: { type: "page.created", data: {} }, page: null }).rebuild).toBe(false);
  });

  test("supports custom status property names and values", () => {
    const p = { ...page(), properties: { Live: { id: "lv", type: "checkbox", checkbox: true } } };
    const r = shouldRebuild({ ...base, statusProperty: "Live", event: { type: "page.created", data: {} }, page: p });
    expect(r.rebuild).toBe(true);
  });
});
