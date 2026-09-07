# 3D Printing Lab: AWS Prerequisites Setup Guide

Complete these one-time steps before deploying. Unlike kitty-cam, this page
has no auth layer — it's a public showcase — so there's no OAuth app or
cookie-key setup here.

---

## 1. GitHub Actions OIDC Federation

Deploys run via GitHub Actions using short-lived OIDC credentials, not
long-lived AWS keys.

### 1a. Create the OIDC Identity Provider

```bash
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com \
  --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1
```

> Skip this if you already created it for kitty-cam or the main site — it's shared per-AWS-account.

### 1b. Create the IAM Role

`trust-policy.json`:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::ACCOUNT_ID:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": "repo:chrispivonka/chrispivonka.com:ref:refs/heads/main"
        }
      }
    }
  ]
}
```

```bash
aws iam create-role \
  --role-name 3dprinting-deploy-role \
  --assume-role-policy-document file://trust-policy.json
```

### 1c. Attach the Permissions Policy

`3dprinting-deploy-policy.json`:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "SAMDeploy",
      "Effect": "Allow",
      "Action": [
        "cloudformation:CreateStack",
        "cloudformation:UpdateStack",
        "cloudformation:DeleteStack",
        "cloudformation:DescribeStacks",
        "cloudformation:DescribeStackEvents",
        "cloudformation:DescribeChangeSet",
        "cloudformation:CreateChangeSet",
        "cloudformation:ExecuteChangeSet",
        "cloudformation:DeleteChangeSet",
        "cloudformation:GetTemplateSummary",
        "cloudformation:ListStackResources"
      ],
      "Resource": [
        "arn:aws:cloudformation:us-east-1:*:stack/printing3d/*",
        "arn:aws:cloudformation:us-east-1:*:stack/aws-sam-cli-managed-default/*"
      ]
    },
    {
      "Sid": "SAMArtifacts",
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:ListBucket",
        "s3:DeleteObject",
        "s3:GetBucketLocation",
        "s3:CreateBucket",
        "s3:PutBucketPolicy",
        "s3:PutBucketVersioning",
        "s3:PutBucketPublicAccessBlock",
        "s3:PutEncryptionConfiguration",
        "s3:PutLifecycleConfiguration",
        "s3:PutBucketOwnershipControls",
        "s3:GetBucketAcl",
        "s3:PutBucketAcl"
      ],
      "Resource": [
        "arn:aws:s3:::printing3d-*",
        "arn:aws:s3:::printing3d-*/*",
        "arn:aws:s3:::aws-sam-cli-managed-default-*",
        "arn:aws:s3:::aws-sam-cli-managed-default-*/*"
      ]
    },
    {
      "Sid": "CloudFront",
      "Effect": "Allow",
      "Action": [
        "cloudfront:CreateDistribution",
        "cloudfront:UpdateDistribution",
        "cloudfront:GetDistribution",
        "cloudfront:DeleteDistribution",
        "cloudfront:TagResource",
        "cloudfront:CreateInvalidation",
        "cloudfront:CreateOriginAccessControl",
        "cloudfront:GetOriginAccessControl",
        "cloudfront:UpdateOriginAccessControl",
        "cloudfront:DeleteOriginAccessControl",
        "cloudfront:CreateResponseHeadersPolicy",
        "cloudfront:GetResponseHeadersPolicy",
        "cloudfront:UpdateResponseHeadersPolicy",
        "cloudfront:DeleteResponseHeadersPolicy"
      ],
      "Resource": "*"
    },
    {
      "Sid": "WAF",
      "Effect": "Allow",
      "Action": [
        "wafv2:CreateWebACL",
        "wafv2:UpdateWebACL",
        "wafv2:GetWebACL",
        "wafv2:DeleteWebACL",
        "wafv2:AssociateWebACL",
        "wafv2:DisassociateWebACL",
        "wafv2:ListTagsForResource",
        "wafv2:TagResource"
      ],
      "Resource": "*"
    },
    {
      "Sid": "ACM",
      "Effect": "Allow",
      "Action": [
        "acm:RequestCertificate",
        "acm:DescribeCertificate",
        "acm:DeleteCertificate",
        "acm:AddTagsToCertificate"
      ],
      "Resource": "*"
    },
    {
      "Sid": "Route53",
      "Effect": "Allow",
      "Action": [
        "route53:ChangeResourceRecordSets",
        "route53:GetHostedZone",
        "route53:ListResourceRecordSets"
      ],
      "Resource": "arn:aws:route53:::hostedzone/*"
    },
    {
      "Sid": "Route53GetChange",
      "Effect": "Allow",
      "Action": "route53:GetChange",
      "Resource": "arn:aws:route53:::change/*"
    },
    {
      "Sid": "Lambda",
      "Effect": "Allow",
      "Action": [
        "lambda:CreateFunction",
        "lambda:UpdateFunctionCode",
        "lambda:UpdateFunctionConfiguration",
        "lambda:GetFunction",
        "lambda:GetFunctionConfiguration",
        "lambda:DeleteFunction",
        "lambda:PublishVersion",
        "lambda:CreateAlias",
        "lambda:UpdateAlias",
        "lambda:DeleteAlias",
        "lambda:GetAlias",
        "lambda:ListVersionsByFunction",
        "lambda:AddPermission",
        "lambda:RemovePermission",
        "lambda:GetPolicy",
        "lambda:EnableReplication*",
        "lambda:TagResource",
        "lambda:UntagResource",
        "lambda:ListTags"
      ],
      "Resource": "arn:aws:lambda:us-east-1:*:function:printing3d-*"
    },
    {
      "Sid": "IAMForLambda",
      "Effect": "Allow",
      "Action": [
        "iam:CreateRole",
        "iam:GetRole",
        "iam:DeleteRole",
        "iam:PutRolePolicy",
        "iam:DeleteRolePolicy",
        "iam:GetRolePolicy",
        "iam:AttachRolePolicy",
        "iam:DetachRolePolicy",
        "iam:PassRole",
        "iam:TagRole",
        "iam:UntagRole",
        "iam:ListRoleTags",
        "iam:ListRolePolicies",
        "iam:ListAttachedRolePolicies"
      ],
      "Resource": "arn:aws:iam::*:role/printing3d-*"
    },
    {
      "Sid": "SecretsManager",
      "Effect": "Allow",
      "Action": "secretsmanager:GetSecretValue",
      "Resource": [
        "arn:aws:secretsmanager:us-west-2:*:secret:kittycam/oauth-*",
        "arn:aws:secretsmanager:us-west-2:*:secret:kittycam/allowed-emails-*",
        "arn:aws:secretsmanager:us-west-2:*:secret:3dprinting/*"
      ]
    },
    {
      "Sid": "SNS",
      "Effect": "Allow",
      "Action": [
        "sns:CreateTopic",
        "sns:DeleteTopic",
        "sns:Subscribe",
        "sns:GetTopicAttributes",
        "sns:SetTopicAttributes",
        "sns:TagResource"
      ],
      "Resource": "arn:aws:sns:us-east-1:*:printing3d-*"
    },
    {
      "Sid": "CloudWatch",
      "Effect": "Allow",
      "Action": [
        "cloudwatch:PutMetricAlarm",
        "cloudwatch:DeleteAlarms",
        "cloudwatch:DescribeAlarms"
      ],
      "Resource": "arn:aws:cloudwatch:us-east-1:*:alarm:3dprinting*"
    },
    {
      "Sid": "CloudFormationTransform",
      "Effect": "Allow",
      "Action": "cloudformation:CreateChangeSet",
      "Resource": "arn:aws:cloudformation:us-east-1:aws:transform/Serverless-2016-10-31"
    },
    {
      "Sid": "WAFLogging",
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:PutRetentionPolicy",
        "logs:DeleteLogGroup"
      ],
      "Resource": "arn:aws:logs:us-east-1:*:log-group:aws-waf-logs-*"
    },
    {
      "Sid": "WAFLogResourcePolicy",
      "Effect": "Allow",
      "Action": [
        "logs:PutResourcePolicy",
        "logs:DeleteResourcePolicy",
        "logs:DescribeResourcePolicies",
        "logs:DescribeLogGroups"
      ],
      "Resource": "*"
    },
    {
      "Sid": "WAFLoggingConfig",
      "Effect": "Allow",
      "Action": [
        "wafv2:PutLoggingConfiguration",
        "wafv2:GetLoggingConfiguration",
        "wafv2:DeleteLoggingConfiguration",
        "logs:CreateLogDelivery",
        "logs:DeleteLogDelivery"
      ],
      "Resource": "*"
    }
  ]
}
```

```bash
aws iam put-role-policy \
  --role-name 3dprinting-deploy-role \
  --policy-name 3dprinting-deploy-policy \
  --policy-document file://3dprinting-deploy-policy.json
```

---

## 2. GitHub Repository Secrets

Add these in **Settings > Secrets and variables > Actions**:

| Secret | Value |
|--------|-------|
| `PRINTING_DEPLOY_ROLE_ARN` | `arn:aws:iam::ACCOUNT_ID:role/3dprinting-deploy-role` |
| `PRINTING_HOSTED_ZONE_ID` | Your Route 53 hosted zone ID for chrispivonka.com |
| `PRINTING_ALERT_EMAIL` | Email for CloudWatch alarm notifications (optional) |

---

## 3. DNS Hardening (CAA Record)

```bash
aws route53 change-resource-record-sets \
  --hosted-zone-id YOUR_HOSTED_ZONE_ID \
  --change-batch '{
    "Changes": [{
      "Action": "UPSERT",
      "ResourceRecordSet": {
        "Name": "3dprinting.chrispivonka.com",
        "Type": "CAA",
        "TTL": 3600,
        "ResourceRecords": [
          {"Value": "0 issue \"amazon.com\""},
          {"Value": "0 issuewild \";\""}
        ]
      }
    }]
  }'
```

---

## 4. Google OAuth & Secrets (reusing kitty-cam's login)

This page is gated the same way as kitty-cam: Google OAuth2 + PKCE via
Lambda@Edge. Rather than standing up a second OAuth app, it reuses
kitty-cam's — same login, same allowed-emails list. Only the cookie
encryption key is separate (session cookies are domain-scoped, no reason
to share).

### 4a. Add a second redirect URI to the existing OAuth app

In [Google Cloud Console](https://console.cloud.google.com/) > **APIs &
Services > Credentials**, open the OAuth client already used for
kitty-cam and add:

```
https://3dprinting.chrispivonka.com/oauth2/callback
```

as an additional **Authorized redirect URI** (alongside kitty-cam's
existing one). Save.

### 4b. Create the cookie encryption key secret

`kittycam/oauth` and `kittycam/allowed-emails` live in **us-west-2** (not
us-east-1, despite that being where Lambda@Edge itself deploys — verify
with `aws secretsmanager list-secrets --region us-west-2` if in doubt).
Create the new secret in the same region so `buildspec.mjs` can read all
three with one `SECRETS_REGION` value:

```bash
COOKIE_KEY=$(openssl rand -base64 32)
aws secretsmanager create-secret \
  --name 3dprinting/cookie-key \
  --region us-west-2 \
  --secret-string "{\"encryption_key\":\"$COOKIE_KEY\",\"previous_keys\":[]}"
```

### 4c. Nothing else to create

`kittycam/oauth` and `kittycam/allowed-emails` already exist from
kitty-cam's setup and are reused as-is — the IAM policy in step 1c
already grants this role read access to them. If you ever want a
different email allowlist for this page specifically, split it into its
own `3dprinting/allowed-emails` secret and update `buildspec.mjs`
accordingly — not needed for the default single-user setup.

---

## 5. Deploy the Infrastructure

```bash
# Option A: Push to main (triggers GitHub Actions)
git push origin main

# Option B: Manual trigger
gh workflow run deploy-3dprinting.yml

# Option C: Local deploy (for first-time testing)
cd infra/3dprinting
sam build
sam deploy --parameter-overrides HostedZoneId=YOUR_ZONE_ID
```

---

## 6. IAM User for the Telemetry Publisher

`publish-to-s3.py` runs on a device on your LAN (see step 7) and needs
write access to two S3 prefixes in the private content bucket. It does
**not** get GitHub's OIDC role — that only works for GitHub Actions. Create
a dedicated, narrowly-scoped IAM user instead:

```bash
aws iam create-user --user-name 3dprinting-publisher

BUCKET=$(aws cloudformation describe-stacks \
  --stack-name printing3d \
  --query "Stacks[0].Outputs[?OutputKey=='ContentBucketName'].OutputValue" \
  --output text)

cat > publisher-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject"],
      "Resource": [
        "arn:aws:s3:::${BUCKET}/printer-status.json",
        "arn:aws:s3:::${BUCKET}/live/*",
        "arn:aws:s3:::${BUCKET}/history/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": "cloudformation:DescribeStacks",
      "Resource": "arn:aws:cloudformation:us-east-1:*:stack/printing3d/*"
    }
  ]
}
EOF

aws iam put-user-policy \
  --user-name 3dprinting-publisher \
  --policy-name 3dprinting-publisher-policy \
  --policy-document file://publisher-policy.json

aws iam create-access-key --user-name 3dprinting-publisher
```

Save the resulting `AccessKeyId`/`SecretAccessKey` — you'll put them on the
LAN device in the next step. Rotate these periodically
(`aws iam create-access-key` + `aws iam delete-access-key` for the old one).

---

## 7. Run the Telemetry Publisher on Your LAN

This needs to run continuously on a device that can reach the printer's IP
— a Raspberry Pi, NAS, or an existing always-on desktop, anything on the
same LAN. Pick whichever option matches your hardware:

- **Option A (Docker)** — if you already have an always-on machine
  (e.g. a secondary desktop), this is the easier path: no Python version
  wrangling, restarts on crash/reboot automatically, easy to update.
- **Option B (bare-metal + systemd)** — for a dedicated Raspberry Pi with
  no Docker, or if you'd rather manage it as a native service.

Either way, find the printer's LAN details first: **Settings (gear) >
Network > LAN Only Mode** on the printer's touchscreen for the IP and
access code; the serial number is on the unit and in **Settings > Device**.

### Option A: Docker

```bash
git clone <this repo>
cd chrispivonka.com/subdomains/3dprinting

cp .env.example .env
# edit .env: BAMBU_IP, BAMBU_SERIAL, BAMBU_ACCESS_CODE,
# the AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY from step 6,
# and YOUTUBE_STREAM_KEY / YOUTUBE_VIDEO_ID from step 8 (skip step 8
# for now and leave those blank if you just want telemetry first —
# the camera-relay container will simply retry/fail harmlessly)

docker compose up -d --build
docker compose logs -f
```

`docker compose` starts two containers: `bambu-publisher` (telemetry ->
S3) and `camera-relay` (printer camera -> YouTube Live, see step 8). You
should see `Connected to printer MQTT broker` and periodic `Published:
status=... progress=...%` lines from the former. Check
`https://3dprinting.chrispivonka.com` — the live job card and specs should
update within a few seconds.

Both containers restart automatically (`restart: unless-stopped`) on crash
or host reboot. Print history persists across restarts in the
`bambu-publisher-data` Docker volume — don't `docker compose down -v`
unless you want to wipe it.

To update after pulling new code: `docker compose up -d --build`.

### Option B: Bare-metal + systemd

```bash
git clone <this repo>  # or just copy subdomains/3dprinting/publish-to-s3.py + requirements.txt
cd chrispivonka.com/subdomains/3dprinting
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt

aws configure   # paste the IAM access key/secret from step 6, region us-east-1
```

Test it directly first:

```bash
python3 publish-to-s3.py \
  --host 192.168.1.50 \
  --serial 01P00A000000000 \
  --access-code 12345678
```

You should see the same `Connected` / `Published` log lines as above. Once
confirmed, run it as a systemd service.

`/etc/systemd/system/bambu-publisher.service`:

```ini
[Unit]
Description=Bambu Lab telemetry publisher for 3dprinting.chrispivonka.com
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/chrispivonka.com/subdomains/3dprinting
EnvironmentFile=/home/pi/bambu-publisher.env
ExecStart=/home/pi/chrispivonka.com/subdomains/3dprinting/venv/bin/python3 publish-to-s3.py
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

`/home/pi/bambu-publisher.env` (keep this file `chmod 600` — it holds the
printer's access code and AWS credentials):

```
BAMBU_IP=192.168.1.50
BAMBU_SERIAL=01P00A000000000
BAMBU_ACCESS_CODE=12345678
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-1
YOUTUBE_VIDEO_ID=...
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now bambu-publisher
sudo systemctl status bambu-publisher
journalctl -u bambu-publisher -f
```

Note: the camera relay (step 8) currently only has a Docker setup
(`camera-relay/`). To run it bare-metal instead, install `ffmpeg` and run
`camera-relay/relay.sh` directly with `BAMBU_IP`, `BAMBU_ACCESS_CODE`, and
`YOUTUBE_STREAM_KEY` set — wrap it in its own systemd unit the same way as
above.

---

## 8. Live Video via YouTube Live

Confirmed working for X1, X1C, X1E, X2D, P2S, and H2-series printers —
they expose a real RTSPS camera feed locally. (A1/A1 Mini/P1P/P1S use a
different proprietary protocol and aren't covered by this setup.)

### 8a. Enable the camera feed on the printer

On the touchscreen: **Settings > Network**, toggle on **LAN Mode
Liveview** (separate from LAN Only Mode, which you already enabled in
step 7). This exposes the RTSPS stream at
`rtsps://bblp:<access_code>@<printer-ip>:322/streaming/live/1`.

### 8b. Set up a YouTube Live stream

1. In YouTube Studio, go to **Create > Go Live**.
2. If this is the first time on this channel, live streaming needs to be
   enabled first (channel verification) — this can take up to 24 hours,
   so do this early.
3. Use the **Stream** tab (not the simpler "Webcam" option) to get a
   **persistent stream key** — persistent so the key and video ID never
   change across container restarts. Copy the **Stream key** into
   `YOUTUBE_STREAM_KEY` and the **Video ID** (from the stream's URL,
   `youtube.com/watch?v=<VIDEO_ID>`) into `YOUTUBE_VIDEO_ID`.
4. Set visibility to **Unlisted** — matches this subdomain's existing
   `noindex, nofollow` / private-by-obscurity posture. Public/searchable
   would put your live printer feed in YouTube search results.

### 8c. Run the relay

Already included in `docker compose up -d --build` from step 7 once
`YOUTUBE_STREAM_KEY` is set in `.env` — it's the `camera-relay` service.
Check it directly:

```bash
docker compose logs -f camera-relay
```

You should see ffmpeg's normal stream-copy output with no repeated
"retrying" messages. Confirm the feed shows up at
`youtube.com/watch?v=<VIDEO_ID>` within ~30s, then check
`https://3dprinting.chrispivonka.com` — the page should replace the
"LIVE SNAPSHOT" placeholder with the embedded YouTube feed.

If ffmpeg exits immediately with a codec/negotiation error, YouTube
likely rejected the passthrough stream — edit `camera-relay/relay.sh` and
swap `-c:v copy` for `-c:v libx264 -preset veryfast -tune zerolatency -b:v 2500k`,
then `docker compose up -d --build camera-relay`.

---

## Verification Checklist

- [ ] `https://3dprinting.chrispivonka.com` redirects to Google login
- [ ] After login with an allowed email, the page loads
- [ ] Unauthorized email gets a 403 page with a "try a different account" link
- [ ] Browser dev tools show cookie: `__Host-p3d_session`, `HttpOnly`, `Secure`, `SameSite=Lax`
- [ ] `/oauth2/sign_out` clears the session and redirects to login
- [ ] `curl -I https://3dprinting.chrispivonka.com` shows HSTS, CSP, X-Frame-Options headers
- [ ] Browser console shows no CSP violations (check the import map and Three.js loaded)
- [ ] Direct S3 bucket URL returns 403 (private bucket, CloudFront-OAC-only)
- [ ] Publisher (Docker container or systemd service) is running and printer-status.json updates live while a print runs
- [ ] Starting/finishing a print on the printer updates the live job card and print history within ~5s / on next poll
- [ ] Camera relay is running and the YouTube Live feed is embedded on the page (not the snapshot placeholder)
- [ ] Finishing a print archives that job's real 3MF model — clicking it in print history shows the actual model, not the bundled sample
- [ ] `dig CAA 3dprinting.chrispivonka.com` shows the amazon.com restriction
- [ ] WAF logs appear in CloudWatch under `aws-waf-logs-3dprinting.chrispivonka.com`
