/**
 * Print request API — Lambda Function URL behind CloudFront, reached only
 * through /api/* on the same distribution as the rest of the site.
 * Authentication happens upstream in the Lambda@Edge auth function, which
 * sets X-Authenticated-Email on every request that reaches here; a request
 * that arrives without it did not go through CloudFront + a valid session.
 *
 * Routes:
 *   POST   /api/requests            create a request, returns a presigned upload URL
 *   GET    /api/requests            admin only — list all requests
 *   PATCH  /api/requests/{id}       admin only — update status
 *   GET    /api/requests/{id}/download   admin only — redirect to a presigned download URL
 *
 * Uses the AWS SDK v3 packages bundled with the Node.js 20.x Lambda
 * runtime — no npm install/build step needed for this function.
 */

import { randomUUID } from "node:crypto";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient, PutCommand, ScanCommand, UpdateCommand, GetCommand,
} from "@aws-sdk/lib-dynamodb";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const TABLE_NAME = process.env.TABLE_NAME;
const BUCKET_NAME = process.env.BUCKET_NAME;
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "")
  .split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3 = new S3Client({});

const ALLOWED_EXTENSIONS = [".3mf", ".stl"];
const ALLOWED_STATUSES = ["pending", "completed", "rejected"];
const ALLOWED_PRIORITIES = ["low", "normal", "high"];
const UPLOAD_URL_TTL_SEC = 900;
const DOWNLOAD_URL_TTL_SEC = 300;

function json(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

function sanitizeFilename(name) {
  const base = String(name || "").split(/[\\/]/).pop().trim();
  return base.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200) || "model";
}

function extensionOf(filename) {
  const match = /\.[^.]+$/.exec(filename);
  return match ? match[0].toLowerCase() : "";
}

async function createRequest(email, payload) {
  const filename = sanitizeFilename(payload.filename);
  const ext = extensionOf(filename);
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return json(400, { error: `filename must end in ${ALLOWED_EXTENSIONS.join(" or ")}` });
  }

  const quantity = Math.min(100, Math.max(1, parseInt(payload.quantity, 10) || 1));
  const priority = ALLOWED_PRIORITIES.includes(payload.priority) ? payload.priority : "normal";
  const material = String(payload.material || "").slice(0, 100);
  const color = String(payload.color || "").slice(0, 100);
  const notes = String(payload.notes || "").slice(0, 2000);

  if (!material) {
    return json(400, { error: "material is required" });
  }

  const id = randomUUID();
  const fileKey = `requests/${id}/${filename}`;
  const now = new Date().toISOString();

  await ddb.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: {
      id, requesterEmail: email, material, color, quantity, priority, notes,
      fileKey, fileName: filename, status: "pending",
      submittedAt: now, updatedAt: now,
    },
  }));

  const uploadUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: BUCKET_NAME, Key: fileKey, ContentType: payload.contentType || "application/octet-stream" }),
    { expiresIn: UPLOAD_URL_TTL_SEC },
  );

  return json(201, { id, uploadUrl });
}

async function listRequests() {
  const resp = await ddb.send(new ScanCommand({ TableName: TABLE_NAME }));
  const items = (resp.Items || []).sort((a, b) => (b.submittedAt || "").localeCompare(a.submittedAt || ""));
  return json(200, { requests: items });
}

async function updateRequestStatus(id, payload) {
  if (!ALLOWED_STATUSES.includes(payload.status)) {
    return json(400, { error: `status must be one of: ${ALLOWED_STATUSES.join(", ")}` });
  }
  try {
    await ddb.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { id },
      ConditionExpression: "attribute_exists(id)",
      UpdateExpression: "SET #status = :status, updatedAt = :now",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: { ":status": payload.status, ":now": new Date().toISOString() },
    }));
  } catch (e) {
    if (e.name === "ConditionalCheckFailedException") return json(404, { error: "not found" });
    throw e;
  }
  return json(200, { ok: true });
}

async function getDownloadUrl(id) {
  const resp = await ddb.send(new GetCommand({ TableName: TABLE_NAME, Key: { id } }));
  if (!resp.Item) return json(404, { error: "not found" });

  const url = await getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: resp.Item.fileKey,
      ResponseContentDisposition: `attachment; filename="${resp.Item.fileName}"`,
    }),
    { expiresIn: DOWNLOAD_URL_TTL_SEC },
  );
  return { statusCode: 302, headers: { Location: url }, body: "" };
}

export async function handler(event) {
  const method = event.requestContext?.http?.method;
  const path = event.rawPath || "";
  const email = (event.headers?.["x-authenticated-email"] || "").toLowerCase();

  if (!email) return json(401, { error: "unauthenticated" });
  const isAdmin = ADMIN_EMAILS.includes(email);

  let payload = {};
  if (event.body) {
    try {
      payload = JSON.parse(event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf-8") : event.body);
    } catch {
      return json(400, { error: "invalid JSON body" });
    }
  }

  try {
    if (method === "POST" && path === "/api/requests") {
      return await createRequest(email, payload);
    }

    // Everything below this point is admin-only.
    if (!isAdmin) return json(403, { error: "forbidden" });

    if (method === "GET" && path === "/api/requests") {
      return await listRequests();
    }
    const idMatch = /^\/api\/requests\/([^/]+)(\/download)?$/.exec(path);
    if (idMatch && method === "PATCH" && !idMatch[2]) {
      return await updateRequestStatus(idMatch[1], payload);
    }
    if (idMatch && method === "GET" && idMatch[2]) {
      return await getDownloadUrl(idMatch[1]);
    }

    return json(404, { error: "not found" });
  } catch (err) {
    console.error(err);
    return json(500, { error: "internal error" });
  }
}
