# Blog: Notion → chrispivonka.com/blog

Posts are written in a Notion database. Setting a post's **Status** to
**Published** rebuilds and deploys the blog within a couple of minutes.

```
Notion (Status = Published)
  └─ integration webhook ──▶ Lambda Function URL (this stack)
                               ├─ verifies X-Notion-Signature
                               ├─ fetches the page, decides if the public blog changed
                               └─ POST /repos/.../dispatches  (event_type: notion-publish)
                                    └─ .github/workflows/publish-blog.yml
                                         ├─ node scripts/build-blog.mjs   (Notion API → blog/*.html, rss.xml, sitemap.xml, images)
                                         ├─ aws s3 sync blog/ → s3://<site bucket>/blog/
                                         └─ CloudFront invalidation /blog/*
```

What triggers a rebuild:

- any edit to a **published** post (content or properties)
- a **Status** change on any post, so unpublishing (Published → Draft) removes it
- a post in the database being deleted, restored or moved

Edits to drafts are ignored. Bursts of edits collapse into one workflow run.
Notion batches some events, so expect up to a minute or two before the run starts.

## 1. Notion database

Create a full-page database (for example "Blog") with these properties:

| Property | Type | Notes |
|----------|------|-------|
| Name | Title | Post title |
| Status | Status (or Select) | Must have a **Published** option. Anything else is a draft. |
| Date | Date | Publish date shown on the post. Defaults to the page's created date. |
| Tags | Multi-select | Shown as pills and tag filters |
| Summary | Text | Used as the lede, the index excerpt, the meta description and RSS |
| Slug | Text | Optional URL override. Defaults to the title, e.g. `my-post` → `/blog/my-post.html` |

The post body is the page content. Supported blocks: paragraphs, headings
(H1 and H2 go in the table of contents), bulleted, numbered and to-do lists,
quotes, callouts, code (the caption becomes the filename bar), images, dividers,
toggles, tables, bookmarks and embeds (rendered as links), and columns.

The database ID is the 32-character hex string in the database URL:
`notion.so/<workspace>/<DATABASE_ID>?v=...`

## 2. Notion integration

1. Go to <https://www.notion.so/profile/integrations> and create an **internal** integration.
2. Capabilities: **Read content** only.
3. Copy the **Internal Integration Secret** (`ntn_...`).
4. Open the Blog database → `•••` → **Connections** → add the integration.

## 3. GitHub

1. Create a **fine-grained personal access token** with access to only
   `chrispivonka/chrispivonka.com` and the permission **Contents: Read and write**
   (required by the repository_dispatch API). Give it an expiry and a reminder.
2. Add repository secrets (Settings → Secrets and variables → Actions):
   - `NOTION_TOKEN`: the integration secret
   - `NOTION_DATABASE_ID`: the database ID

The workflow reuses the existing `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`,
`AWS_S3_BUCKET` and `AWS_CLOUDFRONT_DISTRIBUTION_ID` secrets.

## 4. Secrets for the relay (SSM Parameter Store)

Run in the region you deploy to (samconfig.toml uses `us-west-2`):

```bash
aws ssm put-parameter --name /blog-webhook/notion-token --type SecureString --value 'ntn_...'
aws ssm put-parameter --name /blog-webhook/github-token --type SecureString --value 'github_pat_...'
# Placeholder until Notion sends the real value in step 6
aws ssm put-parameter --name /blog-webhook/notion-verification-token --type SecureString --value pending
```

## 5. Deploy the relay

```bash
cd infra/blog-webhook
# put the database ID into samconfig.toml (NotionDatabaseId=...)
sam build && sam deploy
```

Copy the `WebhookUrl` output.

## 6. Notion webhook subscription

1. In the integration settings, open **Webhooks** → **Create a subscription**.
2. URL: the `WebhookUrl` from step 5.
3. Events: `page.created`, `page.properties_updated`, `page.content_updated`,
   `page.deleted`, `page.undeleted`, `page.moved`.
4. Notion POSTs a one-time `verification_token`. The function logs it:

   ```bash
   aws logs tail /aws/lambda/<RelayFunction name> --since 10m | grep verification_token
   ```

5. Store it, then click **Verify** in Notion and paste the same value:

   ```bash
   aws ssm put-parameter --name /blog-webhook/notion-verification-token --type SecureString --overwrite --value '<token>'
   ```

The function re-reads SSM if a signature doesn't match, so no redeploy is needed.

## 7. Try it

1. Run **Actions → Publish Blog → Run workflow** once to confirm the build and deploy work.
2. Set a post's Status to **Published** in Notion. A Publish Blog run should start
   within a minute or two; the post is live when it finishes.
3. The relay's decisions are logged as JSON lines in CloudWatch
   (`{"type":"page.properties_updated","rebuild":true,"reason":"status changed to Published"}`).

## Local preview without Notion

```bash
BLOG_FIXTURE=scripts/blog/fixtures/sample.json node scripts/build-blog.mjs
python3 -m http.server 8000   # then open http://localhost:8000/blog/index.html
```

Or against the real database: `NOTION_TOKEN=... NOTION_DATABASE_ID=... node scripts/build-blog.mjs`.

## Notes

- `blog/` is generated and gitignored. The main deploy workflow excludes `blog/*`
  from its `--delete` sync so a site release never removes published posts.
- Notion file URLs expire after about an hour, so the build downloads every image
  into `blog/images/` (content-hashed, cached for a year).
- Posts use `.html` URLs (`/blog/<slug>.html`) like the rest of the site, so no
  CloudFront function is needed for directory indexes.
