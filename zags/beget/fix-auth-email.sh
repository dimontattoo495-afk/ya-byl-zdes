#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR=/root/supabase-project
SITE=https://yabylzdes.ru/zags
CONFIRMATION_URL="$SITE/email-templates/confirmation.html"
MAGIC_LINK_URL="$SITE/email-templates/magic-link.html"

if [[ "$(id -u)" -ne 0 ]]; then echo "ERROR: run this script from the root SSH shell."; exit 1; fi
cd "$PROJECT_DIR"
[[ -f .env && -f docker-compose.yml ]] || { echo "ERROR: expected .env and docker-compose.yml in $PROJECT_DIR"; exit 1; }
command -v docker >/dev/null || { echo "ERROR: docker is unavailable."; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "ERROR: Docker Compose is unavailable."; exit 1; }
command -v python3 >/dev/null || { echo "ERROR: python3 is unavailable."; exit 1; }
command -v curl >/dev/null || { echo "ERROR: curl is unavailable."; exit 1; }

# Abort before changing anything unless both public templates are already deployed.
for item in "$CONFIRMATION_URL" "$MAGIC_LINK_URL"; do
  body="$(curl -fsSL --max-time 20 "$item")" || { echo "ERROR: live ZAGS email template is not reachable: $item"; exit 1; }
  grep -Fq '{{ .Token }}' <<<"$body" || { echo "ERROR: template has no OTP token: $item"; exit 1; }
  grep -Fq '{{ .ConfirmationURL }}' <<<"$body" || { echo "ERROR: template has no confirmation URL: $item"; exit 1; }
done

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
ENV_BACKUP=".env.before-zags-auth-$STAMP"
COMPOSE_BACKUP="docker-compose.yml.before-zags-auth-$STAMP"
cp -a .env "$ENV_BACKUP"
cp -a docker-compose.yml "$COMPOSE_BACKUP"

rollback() {
  cp -a "$ENV_BACKUP" .env
  cp -a "$COMPOSE_BACKUP" docker-compose.yml
  docker compose up -d --no-deps auth >/dev/null 2>&1 || true
}
on_error() {
  code=$?
  trap - ERR
  rollback
  echo "ERROR: update did not complete; previous Auth config was restored. Backups: $ENV_BACKUP and $COMPOSE_BACKUP"
  exit "$code"
}
trap on_error ERR

python3 - <<'PY'
from pathlib import Path
import json
import re

env_path = Path(".env")
compose_path = Path("docker-compose.yml")
env_text = env_path.read_text()
compose_text = compose_path.read_text()

def read_env_value(key):
    matches = re.findall(r"(?m)^" + re.escape(key) + r"=(.*)$", env_text)
    if len(matches) > 1:
        raise SystemExit(f"ERROR: duplicate {key} entries; no files changed.")
    if not matches:
        return ""
    value = matches[0].strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
        value = value[1:-1]
    return value

redirects = [x.strip() for x in read_env_value("ADDITIONAL_REDIRECT_URLS").split(",") if x.strip()]
zags_redirect = "https://yabylzdes.ru/zags/**"
if zags_redirect not in redirects:
    redirects.append(zags_redirect)

values = {
    "ADDITIONAL_REDIRECT_URLS": ",".join(redirects),
    "MAILER_TEMPLATES_CONFIRMATION": "https://yabylzdes.ru/zags/email-templates/confirmation.html",
    "MAILER_SUBJECTS_CONFIRMATION": "Подтвердите почту",
    "MAILER_TEMPLATES_MAGIC_LINK": "https://yabylzdes.ru/zags/email-templates/magic-link.html",
    "MAILER_SUBJECTS_MAGIC_LINK": "Код для входа",
}

lines = env_text.splitlines()
for key, value in values.items():
    matches = [i for i, line in enumerate(lines) if re.match(r"^" + re.escape(key) + r"=", line)]
    if len(matches) > 1:
        raise SystemExit(f"ERROR: duplicate {key} entries; no files changed.")
    rendered = key + "=" + json.dumps(value, ensure_ascii=False)
    if matches: lines[matches[0]] = rendered
    else: lines.append(rendered)
new_env = "\n".join(lines) + ("\n" if env_text.endswith("\n") else "")

template_line = "      GOTRUE_MAILER_TEMPLATES_MAGIC_LINK: ${MAILER_TEMPLATES_MAGIC_LINK}"
subject_line = "      GOTRUE_MAILER_SUBJECTS_MAGIC_LINK: ${MAILER_SUBJECTS_MAGIC_LINK}"
has_template, has_subject = template_line in compose_text, subject_line in compose_text
if has_template != has_subject:
    raise SystemExit("ERROR: only one magic-link Compose mapping exists; no files changed.")
if not has_template:
    anchor = "      GOTRUE_MAILER_SUBJECTS_CONFIRMATION: ${MAILER_SUBJECTS_CONFIRMATION}"
    if compose_text.count(anchor) != 1:
        raise SystemExit("ERROR: cannot uniquely locate Auth mail settings in docker-compose.yml; no files changed.")
    compose_text = compose_text.replace(anchor, anchor + "\n" + template_line + "\n" + subject_line, 1)

env_path.write_text(new_env)
compose_path.write_text(compose_text)
PY

docker compose config --quiet
docker compose up -d --no-deps auth

healthy=false
for attempt in $(seq 1 30); do
  state="$(docker inspect --format '{{.State.Health.Status}}' supabase-auth 2>/dev/null || true)"
  if [[ "$state" == "healthy" ]]; then healthy=true; break; fi
  sleep 2
done
[[ "$healthy" == true ]] || { echo "ERROR: Auth did not become healthy."; false; }

docker exec supabase-auth sh -c '
  case "$GOTRUE_URI_ALLOW_LIST" in *"https://yabylzdes.ru/zags/**"*) ;; *) exit 1 ;; esac
  test "$GOTRUE_MAILER_TEMPLATES_CONFIRMATION" = "https://yabylzdes.ru/zags/email-templates/confirmation.html"
  test "$GOTRUE_MAILER_SUBJECTS_CONFIRMATION" = "Подтвердите почту"
  test "$GOTRUE_MAILER_TEMPLATES_MAGIC_LINK" = "https://yabylzdes.ru/zags/email-templates/magic-link.html"
  test "$GOTRUE_MAILER_SUBJECTS_MAGIC_LINK" = "Код для входа"
'

trap - ERR
echo "PASS: Auth is healthy and ZAGS email templates, subjects, and redirect are loaded."
echo "Backup files: $ENV_BACKUP and $COMPOSE_BACKUP"
