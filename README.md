# chrispivonka.com

[![CI](https://github.com/chrispivonka/chrispivonka.com/actions/workflows/ci.yml/badge.svg)](https://github.com/chrispivonka/chrispivonka.com/actions/workflows/ci.yml)
[![Deploy](https://github.com/chrispivonka/chrispivonka.com/actions/workflows/deploy.yml/badge.svg)](https://github.com/chrispivonka/chrispivonka.com/actions/workflows/deploy.yml)

Personal portfolio website for Chris Pivonka - Software Engineer specializing in full-stack web development.

## Features

- **Responsive Design** - Built with Bootstrap 5.2 for mobile-first, accessible layouts
- **Contact Form** - Secure contact form with AWS Lambda backend and SES email integration
- **Security Hardening** - CSRF protection, rate limiting, input validation, and security headers
- **CI/CD Pipeline** - Automated testing, releases, and deployment with GitHub Actions
- **Performance Monitoring** - Lighthouse CI for continuous performance tracking
- **SEO Optimized** - Meta tags, sitemap, robots.txt, and Open Graph support
- **Accessibility** - WCAG compliant with semantic HTML and ARIA labels

## Quick Start

### Prerequisites

- Node.js 24.13.1 LTS or higher
- VS Code with Dev Containers extension (recommended)

### Local Development

```bash
# Install dependencies (optional - for local server)
npm install

# Start dev server
npx live-server

# Or use Python's built-in server
python3 -m http.server 8000
```

Open http://localhost:8000 (or configured port) in your browser.

### Using Dev Container

1. Open the project in VS Code
2. Press `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows/Linux)
3. Select "Dev Containers: Reopen in Container"
4. Dev container will start with all tools configured

## Project Structure

```
.
├── index.html              # Home page
├── contact.html            # Contact form page
├── projects.html           # Portfolio projects
├── resume.html             # Resume/experience
├── css/
│   └── styles.css          # Main stylesheet
├── js/
│   ├── scripts.js          # Common JavaScript
│   └── contact-validation.js # Form validation & submission
├── assets/                 # Images and static files
├── partials/               # Reusable HTML fragments
├── .github/workflows/      # GitHub Actions CI/CD
│   ├── ci.yml              # Continuous Integration
│   ├── release.yml         # Semantic versioning & releases
│   └── deploy.yml          # S3 & GitHub Pages deployment
└── .devcontainer/          # Dev container configuration
```

## Architecture

### Frontend

- **HTML5** - Semantic markup with accessibility considerations
- **CSS3** - Bootstrap 5.2 with custom styles
- **JavaScript** - Vanilla JS with no external dependencies (except Bootstrap)

### Backend

- **AWS Lambda** - Serverless contact form handler
- **AWS SES** - Email delivery for contact submissions
- **AWS DynamoDB** - Rate limiting (5 requests/hour per IP)
- **AWS API Gateway** - REST API endpoint with CORS

### Infrastructure

- **AWS S3** - Static website hosting
- **AWS CloudFront** - CDN with cache invalidation
- **GitHub Pages** - Secondary deployment target

## Security

The project implements comprehensive security measures:

- **CSRF Protection** - HMAC-SHA256 token validation on forms
- **Rate Limiting** - DynamoDB-based per-IP rate limiting (no additional costs)
- **Input Validation** - Client-side and server-side sanitization
- **Security Headers** - X-Frame-Options, HSTS, X-Content-Type-Options
- **Subresource Integrity** - SRI hashes for all CDN resources
- **CORS Configuration** - Properly configured API Gateway CORS
- **Permissions Policy** - Restricts browser feature access

For detailed security information, see [SECURITY.md](./SECURITY.md)

## CI/CD Pipeline

The project uses a three-stage pipeline:

```
Commit/PR → CI Validation → Release (on main) → Deploy to S3
```

### Stage 1: Continuous Integration (CI)

Runs on all pushes and pull requests:

- HTML validation
- Broken link detection
- Spell checking
- Security scanning (Trivy)
- Lighthouse performance audits
- Dependency vulnerability checks

### Stage 2: Release

Triggered after CI passes on `main`:

- Semantic versioning with `release-please`
- Automatic changelog generation
- Git tag creation
- GitHub release creation

### Stage 3: Deployment

Triggered after Release succeeds:

- Deploy to S3 bucket
- CloudFront cache invalidation
- Deploy to GitHub Pages (backup)

## GitHub Secrets

The following secrets are required for deployment:

- `AWS_ACCESS_KEY_ID` - AWS IAM user access key
- `AWS_SECRET_ACCESS_KEY` - AWS IAM user secret key
- `AWS_S3_BUCKET` - S3 bucket name (e.g., `chrispivonka.com`)
- `AWS_CLOUDFRONT_DISTRIBUTION_ID` - CloudFront distribution ID (optional)
- `AUTOMATION_BOT_APP_ID` - GitHub App ID for auto-release (optional)
- `AUTOMATION_BOT_PRIVATE_KEY` - GitHub App private key (optional)

## Development Workflow

1. Create a feature branch: `git checkout -b feature/my-feature`
2. Make your changes
3. Commit with descriptive messages: `git commit -m "Add new feature"`
4. Push to remote: `git push origin feature/my-feature`
5. Create a Pull Request to `dev` branch
6. CI checks will run automatically
7. After approval, merge to `dev`
8. Create a PR from `dev` to `main` to trigger release
9. After release, deployment happens automatically

## Technologies Used

### Runtime Dependencies

- **Bootstrap 5.2.3** - Frontend framework
- **Bootstrap Icons 1.8.1** - Icon library
- **Google Fonts** - Plus Jakarta Sans typeface

### Development Tools

- **GitHub Actions** - CI/CD automation
- **release-please** - Semantic versioning
- **yamllint** - Workflow validation
- **Lighthouse CI** - Performance monitoring
- **Trivy** - Security scanning

### Infrastructure

- **AWS Lambda** - Serverless computing
- **AWS SES** - Email service
- **AWS DynamoDB** - NoSQL database
- **AWS S3** - Object storage
- **AWS CloudFront** - Content delivery network
- **AWS API Gateway** - API management

## Performance

Lighthouse CI targets:

- **Performance**: 90+
- **Accessibility**: 95+
- **Best Practices**: 95+
- **SEO**: 95+

Current status monitored in GitHub Actions.

## Browser Support

- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)
- Mobile browsers (iOS Safari, Chrome Mobile)

## Accessibility

- WCAG 2.1 AA compliant
- Semantic HTML structure
- ARIA labels on interactive elements
- Keyboard navigation support
- Color contrast ratios > 4.5:1

## License

MIT - Feel free to use this as a template for your own portfolio.

## Contact

For questions or inquiries, visit https://chrispivonka.com/contact.html

---

Generated with ❤️ for web development
