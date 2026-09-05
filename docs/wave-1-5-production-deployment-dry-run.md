# MarginLift Wave 1.5 Production Deployment Dry Run

Objective: prove that a fresh production-like environment can deploy MarginLift
from repository state without manual source fixes.

This procedure is for a disposable VM or staging host. Do not run rollback
pointer mutations against the real production model registry.

## 1. Fresh Environment

Start from a clean host with:

- Docker Engine and Docker Compose plugin.
- Git.
- Network access to build images.
- No existing MarginLift containers, volumes, or `.env`.

Clone the repository and select the intended commit:

```bash
git clone <repo-url> marginlift
cd marginlift
git checkout <release-commit>
git status --short
```

Pass criteria: working tree is clean.

## 2. Environment Configuration

Create production configuration from the template:

```bash
cp .env.example .env
chmod 600 .env
```

Set required values:

```bash
SESSION_SECRET=<generated-32-plus-character-secret>
POSTGRES_PASSWORD=<generated-database-password>
ARTIFACT_ENCRYPTION_KEY=<generated-64-hex-character-key>
JWT_SECRET=<generated-32-plus-character-secret>
APP_ORIGIN=https://<staging-or-production-hostname>
SCORER_AUTH_REQUIRED=true
SCORER_INTERNAL_TOKEN=<generated-32-plus-character-service-token>
SCORER_INTERNAL_TOKEN_ID=v1
CADDY_EMAIL=<ops-email>
```

Pass criteria:
- No placeholder secret remains in `.env`.
- `SCORER_AUTH_REQUIRED` is explicitly set.
- `.env` is untracked.

## 3. Docker Build

```bash
docker compose -f docker-compose.production.yml build
```

Pass criteria:
- `app` image builds.
- `shadow-scorer` image builds.
- Build does not require manual edits or ad hoc dependency installs.

## 4. Migration Flow

Start only PostgreSQL first:

```bash
docker compose -f docker-compose.production.yml up -d postgres
docker compose -f docker-compose.production.yml ps postgres
```

Run the operator-controlled migration flow:

```bash
docker compose -f docker-compose.production.yml run --rm app npm run db:migrate
```

Pass criteria:
- Migration snapshot is created.
- Dry run completes.
- Migration applies.
- Validation completes.
- Re-running the same command reports no pending migrations.

## 5. Service Startup

```bash
docker compose -f docker-compose.production.yml up -d shadow-scorer app caddy
docker compose -f docker-compose.production.yml ps
```

Pass criteria:
- PostgreSQL remains healthy.
- Shadow scorer is healthy.
- App is healthy.
- Caddy is running.

## 6. Health Checks

Public liveness:

```bash
curl -fsS "$APP_ORIGIN/api/health"
```

Production smoke:

```bash
MARGINLIFT_BASE_URL="$APP_ORIGIN" npm run production:smoke
```

Scorer public health:

```bash
docker compose -f docker-compose.production.yml exec -T shadow-scorer \
  python -c "import urllib.request; print(urllib.request.urlopen('http://127.0.0.1:8100/health').status)"
```

Scorer protected registry rejects missing token:

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
- Public app liveness returns `ok`.
- Production smoke passes.
- Scorer `/health` stays public.
- Scorer protected endpoints reject missing tokens.

## 7. Backup Verification

```bash
./ops/vm/backup.sh
./ops/vm/verify-backup.sh
```

Inspect backup status:

```bash
cat "${MARGINLIFT_BACKUP_STATUS_PATH:-/opt/marginlift/backups/status.json}"
```

Pass criteria:
- `lastBackupCreatedAt` is present.
- `lastRestoreVerifiedAt` is present.
- `backupStatus` is `ok`.
- `verificationStatus` is `ok`.
- Internal operational health reports backup readiness as `ok`.

## 8. Rollback Readiness

Confirm rollback checkpoint and Wave 1.5 commits:

```bash
git tag --list wave-1-stable-before-w1.5
git log --oneline --decorate -8
```

Confirm deployment rollback command is known:

```bash
git checkout wave-1-stable-before-w1.5
docker compose -f docker-compose.production.yml build
```

Do not run this checkout on a live production host unless rollback has been
approved. For a dry run, discard the fresh environment after this proof.

Pass criteria:
- The Wave 1 rollback tag exists.
- The release commit and rollback commit are identifiable.
- Operators can rebuild from either commit.
- No model registry rollback is performed against production.

## 9. Dry Run Result

Record:

- Host identifier.
- Release commit.
- Rollback checkpoint.
- Build result.
- Migration result.
- Service health result.
- Production smoke result.
- Backup verification result.
- Any manual intervention required.

Wave 2 may start only if this dry run completes without source edits or
undocumented manual fixes.
