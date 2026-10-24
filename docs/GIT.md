# Putting the project on Git & running the scans

The submission is a ready-to-push Git repository (initialised with history and a
`.gitignore` that excludes `node_modules`, `dist`, `.env`, and local
`*.sqlite`). The CI workflow runs the full scan stack on push.

## 1. Verify the local repo

```bash
cd airport-retail-media
git log --oneline | head        # existing commits
git status                      # clean tree
```
(If Git reports "dubious ownership" after unzipping: `git config --global --add safe.directory "$(pwd)"`.)

## 2. Create the remote and push

**GitHub (CLI):**
```bash
gh repo create skyreach-airport-retail-media --private --source=. --remote=origin
git push -u origin main
# optional: a feature branch + PR (triggers the scan workflow)
git checkout -b feature/review && git push -u origin feature/review && gh pr create --fill
```

**GitHub (web) / GitLab / Bitbucket:** create an empty repo, then:
```bash
git remote add origin <REMOTE_URL>
git branch -M main
git push -u origin main
```

## 3. Scans run automatically

Pushing triggers `.github/workflows/security-scan.yml`:
- **Trivy** fs scan — `vuln, misconfig, secret, license` (table + JSON artifact), gated on HIGH/CRITICAL.
- **Semgrep** — `p/javascript`, `p/typescript`, `p/nodejs` + the local rules.
- **npm audit** — production dependency CVEs (`--audit-level=high`).

Reports upload as build artifacts (`trivy-report`, `sast-reports`).

## 4. Run the scans locally

```bash
./security/security-scan.sh                 # everything
npm audit --omit=dev --audit-level=high      # production CVEs
semgrep scan --config security/semgrep-rules.yml .   # SAST (pip install semgrep)
trivy fs --config trivy.yaml .               # Trivy (install from https://trivy.dev)
```

See `docs/SECURITY_SCAN.md` for current results and the scorecard mapping.

## 5. Build / test gates

```bash
npm ci && npm run build && npm test          # 6/6 tests
docker compose up                            # one-command run on :8080
```
