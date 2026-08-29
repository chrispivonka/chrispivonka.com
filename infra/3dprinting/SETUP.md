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
      "Resource": "arn:aws:cloudformation:us-east-1:*:stack/3dprinting/*"
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
        "s3:PutBucketOwnershipControls"
      ],
      "Resource": [
        "arn:aws:s3:::3dprinting-*",
        "arn:aws:s3:::3dprinting-*/*",
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
      "Resource": "arn:aws:sns:us-east-1:*:3dprinting-*"
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
        "logs:DescribeLogGroups",
        "logs:PutRetentionPolicy",
        "logs:DeleteLogGroup",
        "logs:PutResourcePolicy",
        "logs:DeleteResourcePolicy",
        "logs:DescribeResourcePolicies"
      ],
      "Resource": "arn:aws:logs:us-east-1:*:log-group:aws-waf-logs-*"
    },
    {
      "Sid": "WAFLoggingConfig",
      "Effect": "Allow",
      "Action": [
        "wafv2:PutLoggingConfiguration",
        "wafv2:GetLoggingConfiguration",
        "wafv2:DeleteLoggingConfiguration"
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

## 4. Deploy the Infrastructure

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

## 5. IAM User for the Telemetry Publisher

`publish-to-s3.py` runs on a device on your LAN (see step 6) and needs
write access to two S3 prefixes in the private content bucket. It does
**not** get GitHub's OIDC role — that only works for GitHub Actions. Create
a dedicated, narrowly-scoped IAM user instead:

```bash
aws iam create-user --user-name 3dprinting-publisher

BUCKET=$(aws cloudformation describe-stacks \
  --stack-name 3dprinting \
  --query "Stacks[0].Outputs[?OutputKey=='ContentBucketName'].OutputValue" \
  --output text)

cat > publisher-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "s3:PutObject",
      "Resource": [
        "arn:aws:s3:::${BUCKET}/printer-status.json",
        "arn:aws:s3:::${BUCKET}/live/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": "cloudformation:DescribeStacks",
      "Resource": "arn:aws:cloudformation:us-east-1:*:stack/3dprinting/*"
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

## 6. Run the Telemetry Publisher on Your LAN

On a Raspberry Pi, NAS, or other always-on machine that can reach the
printer's IP:

```bash
git clone <this repo>  # or just copy subdomains/3dprinting/publish-to-s3.py + requirements.txt
cd chrispivonka.com/subdomains/3dprinting
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt

aws configure   # paste the IAM access key/secret from step 5, region us-east-1
```

Find the printer's LAN details: **Settings (gear) > Network > LAN Only
Mode** on the printer's touchscreen for the IP and access code; the serial
number is on the unit and in **Settings > Device**.

Test it directly first:

```bash
python3 publish-to-s3.py \
  --host 192.168.1.50 \
  --serial 01P00A000000000 \
  --access-code 12345678
```

You should see `Connected to printer MQTT broker` and periodic `Published:
status=... progress=...%` lines. Check `https://3dprinting.chrispivonka.com`
— the live job card and specs should update within a few seconds.

### Run it as a systemd service

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
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now bambu-publisher
sudo systemctl status bambu-publisher
journalctl -u bambu-publisher -f
```

---

## Verification Checklist

- [ ] `https://3dprinting.chrispivonka.com` loads over HTTPS with a valid cert
- [ ] `curl -I https://3dprinting.chrispivonka.com` shows HSTS, CSP, X-Frame-Options headers
- [ ] Browser console shows no CSP violations (check the import map and Three.js loaded)
- [ ] Direct S3 bucket URL returns 403 (private bucket, CloudFront-OAC-only)
- [ ] `bambu-publisher` service is active and printer-status.json updates live while a print runs
- [ ] Starting/finishing a print on the printer updates the live job card and print history within ~5s / on next poll
- [ ] `dig CAA 3dprinting.chrispivonka.com` shows the amazon.com restriction
- [ ] WAF logs appear in CloudWatch under `aws-waf-logs-3dprinting.chrispivonka.com`
