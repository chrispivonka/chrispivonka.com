# Kitty-Cam: AWS Prerequisites Setup Guide

Complete these one-time steps before deploying.

---

## 1. Google OAuth App

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or use existing)
3. Navigate to **APIs & Services > Credentials**
4. Click **Create Credentials > OAuth client ID**
5. Application type: **Web application**
6. Name: `Kitty-Cam`
7. Authorized redirect URIs: `https://kittycam.chrispivonka.com/oauth2/callback`
8. Save the **Client ID** and **Client Secret**

If this is a new project, you'll also need to configure the **OAuth consent screen**:
- User type: **External** (or Internal if using Google Workspace)
- App name: `Kitty-Cam`
- Scopes: `openid`, `email`
- Test users: add your email (required while app is in "Testing" status)

---

## 2. AWS Secrets Manager (us-east-1)

Create four secrets in **us-east-1** (required because Lambda@Edge deploys there):

```bash
# Google OAuth credentials
aws secretsmanager create-secret \
  --name kittycam/oauth \
  --region us-east-1 \
  --secret-string '{"client_id":"YOUR_CLIENT_ID","client_secret":"YOUR_CLIENT_SECRET"}'

# Cookie encryption key (generate a fresh 32-byte key)
# The previous_keys array supports key rotation (see section 7 below)
COOKIE_KEY=$(openssl rand -base64 32)
aws secretsmanager create-secret \
  --name kittycam/cookie-key \
  --region us-east-1 \
  --secret-string "{\"encryption_key\":\"$COOKIE_KEY\",\"previous_keys\":[]}"

# Email allowlist
aws secretsmanager create-secret \
  --name kittycam/allowed-emails \
  --region us-east-1 \
  --secret-string '{"emails":["your-email@gmail.com"]}'

# Stream origins for CSP (controls which domains the page can connect to / embed)
# For YouTube only:
aws secretsmanager create-secret \
  --name kittycam/stream-origins \
  --region us-east-1 \
  --secret-string '{"connect_src":"'\''self'\''","frame_src":"https://www.youtube.com https://www.youtube-nocookie.com"}'

# For HLS stream from a specific server:
# --secret-string '{"connect_src":"'\''self'\'' https://my-hls-server.example.com","frame_src":"https://www.youtube.com https://www.youtube-nocookie.com"}'
#
# For iframe embed (go2rtc, Frigate):
# --secret-string '{"connect_src":"'\''self'\''","frame_src":"https://www.youtube.com https://www.youtube-nocookie.com https://my-go2rtc.example.com"}'
```

---

## 3. GitHub Actions OIDC Federation

This eliminates long-lived AWS access keys. GitHub Actions authenticates
via OIDC and assumes a scoped IAM role.

### 3a. Create the OIDC Identity Provider

```bash
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com \
  --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1
```

> If you already have this provider (for the main site deploy), skip this step.

### 3b. Create the IAM Role

Create `kittycam-deploy-role` with this trust policy (`trust-policy.json`):

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
  --role-name kittycam-deploy-role \
  --assume-role-policy-document file://trust-policy.json
```

### 3c. Attach the Permissions Policy

Create `kittycam-deploy-policy.json`:

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
      "Resource": "arn:aws:cloudformation:us-east-1:*:stack/kittycam/*"
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
        "arn:aws:s3:::kittycam-*",
        "arn:aws:s3:::kittycam-*/*",
        "arn:aws:s3:::aws-sam-cli-managed-default-*",
        "arn:aws:s3:::aws-sam-cli-managed-default-*/*"
      ]
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
        "lambda:EnableReplication*"
      ],
      "Resource": "arn:aws:lambda:us-east-1:*:function:kittycam-*"
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
        "iam:TagRole"
      ],
      "Resource": "arn:aws:iam::*:role/kittycam-*"
    },
    {
      "Sid": "SecretsManager",
      "Effect": "Allow",
      "Action": "secretsmanager:GetSecretValue",
      "Resource": "arn:aws:secretsmanager:us-east-1:*:secret:kittycam/*"
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
      "Resource": "arn:aws:sns:us-east-1:*:kittycam-*"
    },
    {
      "Sid": "CloudWatch",
      "Effect": "Allow",
      "Action": [
        "cloudwatch:PutMetricAlarm",
        "cloudwatch:DeleteAlarms",
        "cloudwatch:DescribeAlarms"
      ],
      "Resource": "arn:aws:cloudwatch:us-east-1:*:alarm:kittycam*"
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
  --role-name kittycam-deploy-role \
  --policy-name kittycam-deploy-policy \
  --policy-document file://kittycam-deploy-policy.json
```

---

## 4. GitHub Repository Secrets

Add these secrets in **Settings > Secrets and variables > Actions**:

| Secret | Value |
|--------|-------|
| `KITTYCAM_DEPLOY_ROLE_ARN` | `arn:aws:iam::ACCOUNT_ID:role/kittycam-deploy-role` |
| `KITTYCAM_HOSTED_ZONE_ID` | Your Route 53 hosted zone ID for chrispivonka.com |
| `KITTYCAM_ALERT_EMAIL` | Email for CloudWatch alarm notifications (optional) |

---

## 5. DNS Hardening

### CAA Record (restrict certificate issuance)

```bash
aws route53 change-resource-record-sets \
  --hosted-zone-id YOUR_HOSTED_ZONE_ID \
  --change-batch '{
    "Changes": [{
      "Action": "UPSERT",
      "ResourceRecordSet": {
        "Name": "kittycam.chrispivonka.com",
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

### DNSSEC (if not already enabled)

```bash
# Enable DNSSEC signing on your hosted zone
aws route53 enable-hosted-zone-dnssec \
  --hosted-zone-id YOUR_HOSTED_ZONE_ID

# Then add the DS record to your domain registrar
# (Route 53 console will show the DS record values)
```

---

## 6. Deploy

Once all prerequisites are in place:

```bash
# Option A: Push to main (triggers GitHub Actions)
git push origin main

# Option B: Manual trigger
gh workflow run deploy-kittycam.yml

# Option C: Local deploy (for first-time testing)
cd infra/kittycam
node buildspec.mjs
sam build
sam deploy --parameter-overrides HostedZoneId=YOUR_ZONE_ID
```

---

## 7. Cookie Key Rotation

When you want to rotate the cookie encryption key (recommended periodically):

```bash
# 1. Generate a new key
NEW_KEY=$(openssl rand -base64 32)

# 2. Read the current key
CURRENT=$(aws secretsmanager get-secret-value \
  --secret-id kittycam/cookie-key \
  --region us-east-1 \
  --query SecretString --output text)

# 3. Move the current key to previous_keys, set the new one as current
# (keeps at most 2 previous keys — covers 8 hours of sessions)
OLD_KEY=$(echo "$CURRENT" | python3 -c "import sys,json; print(json.load(sys.stdin)['encryption_key'])")
PREV=$(echo "$CURRENT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(json.dumps(([d['encryption_key']] + d.get('previous_keys',[]))[:2]))")

aws secretsmanager update-secret \
  --secret-id kittycam/cookie-key \
  --region us-east-1 \
  --secret-string "{\"encryption_key\":\"$NEW_KEY\",\"previous_keys\":$PREV}"

# 4. Redeploy to pick up the new key
gh workflow run deploy-kittycam.yml
```

After redeployment:
- New cookies are encrypted with the new key
- Existing sessions (up to 4h old) still decrypt via previous keys
- After all old sessions expire, the previous keys are unused but harmless

---

## 8. Updating Stream Origins (CSP)

When you change your stream source (e.g., switch from YouTube to HLS):

```bash
# For HLS stream from a specific server:
aws secretsmanager update-secret \
  --secret-id kittycam/stream-origins \
  --region us-east-1 \
  --secret-string '{"connect_src":"'\''self'\'' https://my-hls-server.example.com","frame_src":"https://www.youtube.com https://www.youtube-nocookie.com"}'

# Then redeploy to update the CSP header
gh workflow run deploy-kittycam.yml
```

---

## Verification Checklist

After deployment, verify:

- [ ] `https://kittycam.chrispivonka.com` redirects to Google login
- [ ] After login, the kitty-cam page loads
- [ ] Unauthorized email gets a 403 page
- [ ] `curl -I https://kittycam.chrispivonka.com` shows HSTS, CSP, X-Frame-Options headers
- [ ] CSP `connect-src` and `frame-src` show only your configured origins (not `https:`)
- [ ] Direct S3 bucket URL returns 403
- [ ] `/oauth2/sign_out` clears session and redirects to login
- [ ] Browser dev tools show cookie: `__Host-kc_session`, `HttpOnly`, `Secure`, `SameSite=Lax`
- [ ] [SSL Labs](https://www.ssllabs.com/ssltest/) shows A+ rating
- [ ] `dig CAA kittycam.chrispivonka.com` shows amazon.com restriction
- [ ] WAF logs appear in CloudWatch under `aws-waf-logs-kittycam.chrispivonka.com`
