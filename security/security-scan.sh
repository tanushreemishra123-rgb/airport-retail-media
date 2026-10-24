#!/usr/bin/env bash
# Run the full security scan stack locally. Reports land in security/reports/.
#   ./security/security-scan.sh
set -uo pipefail
cd "$(dirname "$0")/.."
mkdir -p security/reports

echo "==> npm audit (production dependency CVEs)"
npm audit --omit=dev --json > security/reports/npm-audit-prod.json 2>/dev/null || true
npm audit --omit=dev --audit-level=high || echo "   (non-zero exit if any prod HIGH/CRITICAL)"

echo "==> npm audit (all, incl. dev/build tooling)"
npm audit --json > security/reports/npm-audit-all.json 2>/dev/null || true

echo "==> Semgrep SAST"
if command -v semgrep >/dev/null 2>&1; then
  # Local rules offline; add registry packs when semgrep.dev is reachable.
  semgrep scan --config security/semgrep-rules.yml --error \
    --json --output security/reports/semgrep.json . || true
  echo "   report: security/reports/semgrep.json"
else
  echo "   semgrep not installed (pip install semgrep); skipping"
fi

echo "==> Trivy (vuln / misconfig / secret / license)"
if command -v trivy >/dev/null 2>&1; then
  trivy fs --config trivy.yaml --format table .
  trivy fs --config trivy.yaml --format json --output security/reports/trivy.json .
  trivy fs --scanners vuln,misconfig,secret,license --severity HIGH,CRITICAL --exit-code 1 . \
    || echo "   Trivy found HIGH/CRITICAL"
else
  echo "   trivy not installed — see https://trivy.dev (CI runs it via trivy-action)"
fi

echo "==> Done. Reports in security/reports/"
