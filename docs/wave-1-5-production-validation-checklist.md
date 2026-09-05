# MarginLift Wave 1.5 Production Validation Checklist

Use this checklist after Wave 1.5 changes and before any Wave 2 work. Every
step must produce pass/fail evidence in the deployment notes.

## Preconditions

- Run from a production-like host with Docker Compose available.
- Use a fresh checkout of the intended commit.
- Create `.env` from `.env.example`; do not commit `.env`.
- Set production secrets with generated values:
  - `SESSION_SECRET`
  - `POSTGRES_PASSWORD`
  - `ARTIFACT_ENCRYPTION_KEY`
  - `JWT_SECRET`
  - `SCORER_AUTH_REQUIRED=true`
  - `SCORER_INTERNAL_TOKEN`
  - `APP_ORIGIN`
- Confirm no source files are edited on the host:

```bash
git status --short
```

## Gate 1: Build

```bash
docker compose -f docker-compose.production.yml build
```

Pass criteria:
- App image builds.
- Shadow scorer image builds.
- No dependency installation is performed manually outside the build.

## Gate 2: Operator-Controlled Migration

```bash
docker compose -f docker-compose.production.yml up -d postgres
docker compose -f docker-compose.production.yml run --rm app npm run db:migrate
```

Pass criteria:
- Migration snapshot is created before migration execution.
- Dry run completes before migration execution.
- Migration execution completes.
- Validation completes.
- A subsequent app startup does not apply migrations implicitly.

## Gate 3: Service Startup

```bash
docker compose -f docker-compose.production.yml up -d shadow-scorer app caddy
docker compose -f docker-compose.production.yml ps
```

Pass criteria:
- PostgreSQL is healthy.
- Shadow scorer is healthy.
- App is healthy through public liveness.
- Caddy starts without exposing app or PostgreSQL ports directly.

## Gate 4: Scorer Authentication

```bash
docker compose -f docker-compose.production.yml exec -T shadow-scorer \
  python -c "import urllib.request; print(urllib.request.urlopen('http://127.0.0.1:8100/health').status)"
```

```bash
docker compose -f docker-compose.production.yml exec -T shadow-scorer \
  python - <<'PY'
import urllib.error
import urllib.request

try:
    urllib.request.urlopen('http://127.0.0.1:8100/internal/registry')
    raise SystemExit('internal registry accepted a missing token')
except urllib.error.HTTPError as exc:
    raise SystemExit(0 if exc.code == 401 else f'unexpected status {exc.code}')
PY
```

Pass criteria:
- `/health` is reachable without a token.
- `/internal/registry` rejects missing or invalid tokens.
- App calls to scorer succeed with `SCORER_INTERNAL_TOKEN`.

## Gate 5: Public And Internal Health

```bash
curl -fsS "$APP_ORIGIN/api/health"
```

```bash
npm run production:smoke
```

Pass criteria:
- Public health returns liveness only.
- Internal health requires authenticated owner/admin access.
- Internal health reports database, artifacts, queue, backup, and scorer state.
- Internal health output contains no secrets or raw tokens.

## Gate 6: Backup Lifecycle

```bash
./ops/vm/backup.sh
./ops/vm/verify-backup.sh
```

Pass criteria:
- Backup status preserves `lastBackupCreatedAt`.
- Restore verification sets `lastRestoreVerifiedAt`.
- `backupStatus` is `ok`.
- `verificationStatus` is `ok`.
- Internal health reports backup readiness as `ok` after verification.

## Gate 7: Structured Logs

Exercise at least one successful authenticated request and one rejected request,
then inspect container logs:

```bash
docker compose -f docker-compose.production.yml logs --tail=100 app
```

Pass criteria:
- Request logs are JSON.
- Each request log includes `timestamp`, `level`, `requestId`, `method`,
  `route`, `status`, `durationMs`, `organizationId`, `userId`, and `role`.
- Logs do not include cookies, bearer tokens, scorer tokens, passwords, or CSV
  row payloads.

## Gate 8: Rollback Readiness

```bash
git tag --list wave-1-stable-before-w1.5
git log --oneline -6
```

Pass criteria:
- The Wave 1 rollback checkpoint exists.
- Each Wave 1.5 change is in an isolated commit.
- The operator has the exact commit hash to redeploy or revert from.

## Gate Result

Wave 2 may start only when all gates pass. If any gate fails, stop Wave 1.5,
record the failing command, and create a focused fix before continuing.
