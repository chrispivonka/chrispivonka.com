# Deployment Guide

This document describes the automated CI/CD pipeline and how to manage deployments.

## Pipeline Overview

```
Your Commit/PR
    ↓
CI Workflow (Code Quality Checks)
    ↓
Release Workflow (Semantic Versioning)
    ↓
Deploy Workflow (S3 + GitHub Pages)
```

## Stage 1: Continuous Integration (CI)

**Trigger**: Every push to any branch and all pull requests

**Checks performed**:
- **Code Linting**: ESLint validates JavaScript
- **Unit Tests**: Jest runs all test files
- **HTML Validation**: Checks for valid HTML structure
- **Broken Links**: Detects dead internal links
- **Spell Check**: Validates spelling (codespell)
- **Security Scanning**: Trivy scans for vulnerabilities
- **Secret Detection**: Gitleaks prevents credential leaks
- **Lighthouse Audit**: Performance and accessibility metrics
- **Dependency Audit**: Checks for known vulnerabilities

**Status**: Must pass before merging to main

## Stage 2: Release

**Trigger**: Automatic after CI passes on `main` branch (via `workflow_run`)

**What it does**:
- Creates a semantic version (major.minor.patch)
- Generates automated changelog from commit messages
- Creates GitHub release and git tag
- Uses conventional commit format:
  - `feat:` → minor version bump
  - `fix:` → patch version bump
  - `BREAKING CHANGE:` → major version bump

**Manual trigger** (if needed):
```bash
gh workflow run release.yml --ref main
```

## Stage 3: Deployment

**Trigger**: Manual (workflow_run support pending) after Release succeeds

**What it deploys**:
- **Primary**: AWS S3 bucket (chrispivonka.com)
- **Secondary**: GitHub Pages (backup)
- Invalidates CloudFront cache for fresh content

**Manual trigger**:
```bash
gh workflow run deploy.yml --ref main
```

**Required secrets** (must be set in GitHub repo settings):
- `AWS_ACCESS_KEY_ID` - AWS IAM access key
- `AWS_SECRET_ACCESS_KEY` - AWS IAM secret key
- `AWS_S3_BUCKET` - S3 bucket name
- `AWS_CLOUDFRONT_DISTRIBUTION_ID` - CloudFront distribution (optional)

## Lighthouse Thresholds

The CI environment has performance limitations compared to production:

| Metric | Threshold | Why This Value |
|--------|-----------|-----------------|
| Performance | 0.70 | Test runner lacks CDN, compression, caching |
| Accessibility | 0.95 | Near-perfect with semantic HTML |
| Best Practices | 0.89 | Realistic with third-party libraries |
| SEO | 0.95 | Achievable with proper metadata |

**To improve Lighthouse scores**:
1. Optimize images (use WebP, responsive sizes)
2. Minimize CSS/JS (already minified)
3. Defer non-critical scripts (already done)
4. Use lazy loading (already implemented)
5. Deploy to production for true performance metrics

## Local Testing

### Run All Tests
```bash
npm test
```

### Run Lighthouse Locally
```bash
npm install -g @lhci/cli@latest
lhci autorun
```

### Serve Locally
```bash
python3 -m http.server 8000
# Open http://localhost:8000
```

## Troubleshooting

### CI fails on Lighthouse audit
- Lighthouse scores vary in test environment (0.70-0.85 performance range)
- Check `.lighthouseci` folder in workflow artifacts for detailed report
- Adjust thresholds in `lighthouserc.json` if needed

### Deploy workflow doesn't trigger
- Release workflow must succeed first
- Check Release workflow logs for errors
- Manually trigger: `gh workflow run deploy.yml --ref main`

### Secrets not working in Deploy
- Verify secrets are set in GitHub repository settings
- Check that secret names match exactly (case-sensitive)
- Ensure IAM user has S3 and CloudFront permissions

## Best Practices

1. **Commit Messages**: Use conventional commits for auto-versioning
   ```
   feat: Add dark mode toggle
   fix: Correct link validation
   chore: Update dependencies
   ```

2. **Pull Requests**: Create PRs to `dev` first, then `dev` → `main`
   - Allows testing before release
   - Easier to manage multiple features

3. **Releases**: Let release-please handle versioning
   - Don't manually edit version numbers
   - Changelog generated automatically

4. **Testing**: Run `npm test` locally before pushing
   - Catch issues early
   - Faster than waiting for CI

## Monitoring

- **GitHub Actions**: View workflow runs at `/actions`
- **Lighthouse Reports**: Uploaded to Google Cloud Storage (temporary)
- **Releases**: GitHub releases page shows all versions
- **Deployments**: Check website at chrispivonka.com

## Emergency Procedures

### Rollback to Previous Version
```bash
# Find previous git tag
git tag -l

# Checkout previous version
git checkout v1.0.0

# Create deployment from that commit
gh workflow run deploy.yml --ref v1.0.0
```

### Skip Deployment
If release created but deployment not desired:
1. Don't run deploy workflow
2. Website stays at previous version
3. Next successful release will deploy normally

### Fix Failed CI
1. Identify failing check in workflow logs
2. Create fix in new branch
3. Create PR to trigger CI again
4. Merge when passing

---

For more details on security, see [SECURITY.md](./SECURITY.md)
