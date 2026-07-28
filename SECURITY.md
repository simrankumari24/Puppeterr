# Puppeterr Security Policy

Puppeterr is an automation and agent‑orchestration framework designed for high‑performance workflows.  
To keep the project safe for all users, this document outlines the security practices, reporting process, and remediation guidelines.

---

## 🔐 Supported Versions

Security updates are applied to the following branches:

| Branch | Status | Notes |
|--------|--------|-------|
| MAIN   | Active | Receives all security patches |
| Master | Legacy | Receives critical fixes only |
| Other feature branches | Unmaintained | Merge into MAIN for patches |

---

## 🛡 Reporting a Vulnerability

If you discover a vulnerability in Puppeterr:

- **Do not open a public GitHub issue**
- **Do not disclose the vulnerability publicly**
- Contact the maintainer privately:
  
**GitHub:** @simrankumari24

Please include:

- Description of the issue  
- Steps to reproduce  
- Impact assessment  
- Suggested fix (optional)

We will acknowledge your report within **72 hours**.

---

## 🔑 Secret Handling & Key Management

Puppeterr follows strict secret‑management rules:

- API keys **must never** be committed to the repository  
- `.env` files **must be ignored** via `.gitignore`  
- All leaked keys must be **revoked immediately**  
- Secrets must be stored in:
  - Environment variables  
  - GitHub Actions encrypted secrets  
  - Cloudflare Workers secrets  
  - Vault or secure key stores

Recent audits detected leaked keys.  
All exposed keys have been revoked and replaced.

---

## 🧪 CodeQL & Static Analysis

Puppeterr uses **GitHub CodeQL** for continuous security scanning.

### High‑priority issues include:

- Inefficient regular expressions  
- CORS misconfiguration  
- Resource exhaustion  
- Incomplete escaping/encoding  
- Incomplete URL scheme validation  

All findings are tracked under **Security → Code Scanning Alerts**.

Fixes follow this workflow:

1. Reproduce the alert  
2. Patch the vulnerable code  
3. Add tests if applicable  
4. Submit a PR referencing the alert ID  
5. CodeQL re‑scan must pass before merge

---

## 📦 Dependency Security

Puppeterr uses npm packages and Cloudflare Workers modules.

Security rules:

- `npm audit` must pass with **no critical vulnerabilities**  
- Dependabot PRs must be reviewed and merged promptly  
- Outdated packages should be upgraded monthly  
- Vulnerable packages must be patched or replaced

---

## 🔒 Branch Protection Rules

To maintain repository integrity:

- MAIN branch requires:
  - Signed commits  
  - Passing CI  
  - CodeQL scan success  
  - No leaked secrets  
  - No failing tests  

Feature branches should be merged only after security review.

---

## 🚨 Incident Response

If a security incident occurs:

1. Revoke all exposed secrets  
2. Patch affected code  
3. Notify impacted users (if applicable)  
4. Document the incident  
5. Perform a full CodeQL + secret scan  
6. Release a security patch version

---

## 🤝 Responsible Disclosure

We appreciate responsible security research.  
If you follow the guidelines above, we will:

- Credit you in the release notes  
- Add you to the Hall of Fame (coming soon)  
- Provide early access to new security features

---

## 🧩 Additional Notes

- Puppeterr is under active development  
- Security patches are prioritized over feature updates  
- Automated agents may introduce new attack surfaces  
- All contributions must follow secure coding practices




---

### OuO

# **Thank ***you*** for helping keep Puppeterr safe.**  
## -{(@simrankumari24)}-