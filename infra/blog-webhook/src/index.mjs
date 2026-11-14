/**
 * Notion → GitHub relay for the blog.
 *
 * Notion integration webhooks POST here (Lambda Function URL). After checking
 * the signature, the function looks at the page and, if the change affects the
 * public blog, fires a repository_dispatch event so the "Publish Blog" GitHub
 * workflow rebuilds and deploys blog/.
 *
 * Secrets live in SSM Parameter Store (SecureString), read once per cold start:
 *   ${PARAM_PREFIX}/notion-verification-token   from Notion's one-time verification request
 *   ${PARAM_PREFIX}/notion-token                Notion integration secret (read content)
 *   ${PARAM_PREFIX}/github-token                fine-grained PAT, Contents: read & write on the repo
 *
 * Uses the AWS SDK v3 bundled with the Node.js Lambda runtime — no build step.
 */

import { SSMClient, GetParametersCommand } from "@aws-sdk/client-ssm";
import { shouldRebuild, verifySignature, normalizeId } from "./logic.mjs";

const PARAM_PREFIX = process.env.PARAM_PREFIX || "/blog-webhook";
const DATABASE_ID = process.env.NOTION_DATABASE_ID;
const GITHUB_REPO = process.env.GITHUB_REPO;
const STATUS_PROPERTY = process.env.STATUS_PROPERTY || "Status";
const PUBLISHED_VALUE = process.env.PUBLISHED_VALUE || "Published";

const ssm = new SSMClient({});
let secretsPromise;

function loadSecrets() {
  secretsPromise ??= ssm.send(new GetParametersCommand({
    Names: ["notion-verification-token", "notion-token", "github-token"].map((n) => `${PARAM_PREFIX}/${n}`),
    WithDecryption: true
  })).then(({ Parameters = [] }) => {
    const byName = Object.fromEntries(Parameters.map((p) => [p.Name.split("/").pop(), p.Value]));
    return byName;
  }).catch((err) => {
    secretsPromise = undefined;
    throw err;
  });
  return secretsPromise;
}

function respond(statusCode, body) {
  return { statusCode, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

async function fetchPage(pageId, notionToken) {
  const res = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
    headers: { Authorization: `Bearer ${notionToken}`, "Notion-Version": "2022-06-28" }
  });
  if (!res.ok) {
    console.warn(`Could not fetch page ${pageId}: ${res.status}`);
    return null;
  }
  return res.json();
}

async function dispatch(githubToken, payload) {
  const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/dispatches`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${githubToken}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "blog-webhook-relay"
    },
    body: JSON.stringify({ event_type: "notion-publish", client_payload: payload })
  });
  if (res.status !== 204) {
    throw new Error(`GitHub dispatch failed: ${res.status} ${(await res.text()).slice(0, 300)}`);
  }
}

export async function handler(event) {
  if (event.requestContext?.http?.method !== "POST") {
    return respond(405, { error: "POST only" });
  }
  const rawBody = event.isBase64Encoded ? Buffer.from(event.body || "", "base64").toString("utf8") : (event.body || "");
  let body;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return respond(400, { error: "invalid JSON" });
  }

  // One-time subscription verification: Notion sends the token we sign with.
  // Copy it from the logs into SSM (see SETUP.md), then click Verify in Notion.
  if (body.verification_token && !body.type) {
    console.log(`Notion verification_token received: ${body.verification_token}`);
    return respond(200, { ok: true });
  }

  let secrets = await loadSecrets();
  const signature = event.headers?.["x-notion-signature"];
  if (!verifySignature(rawBody, signature, secrets["notion-verification-token"])) {
    // The token may have been put in SSM after this container cached it; re-read once.
    secretsPromise = undefined;
    secrets = await loadSecrets();
  }
  if (!verifySignature(rawBody, signature, secrets["notion-verification-token"])) {
    console.warn("Rejected request with a missing or invalid signature");
    return respond(401, { error: "invalid signature" });
  }

  const entity = body.entity;
  const page = entity?.type === "page" && body.type !== "page.deleted"
    ? await fetchPage(entity.id, secrets["notion-token"])
    : null;

  const decision = shouldRebuild({
    event: body,
    page,
    databaseId: DATABASE_ID,
    statusProperty: STATUS_PROPERTY,
    publishedValue: PUBLISHED_VALUE
  });
  console.log(JSON.stringify({ type: body.type, page: entity?.id, ...decision }));

  if (decision.rebuild) {
    await dispatch(secrets["github-token"], {
      notion_event: body.type,
      page_id: normalizeId(entity?.id),
      reason: decision.reason
    });
  }
  // Always 200 for authentic events so Notion doesn't retry ones we chose to skip.
  return respond(200, decision);
}
