#!/usr/bin/env bash
set -Eeuo pipefail

ENV_FILE="${ENV_FILE:-.env}"
COMMAND="${1:-menu}"
ASSUME_YES="${ASSUME_YES:-false}"
MIGRATION_SQLITE_PATH=""
MIGRATION_ALLOW_NON_EMPTY="false"

for argument in "${@:2}"; do
  case "$argument" in
    --yes)
      ASSUME_YES="true"
      ;;
    --merge|--allow-non-empty)
      MIGRATION_ALLOW_NON_EMPTY="true"
      ;;
    *)
      if [[ "$COMMAND" == "migrate" && -z "$MIGRATION_SQLITE_PATH" ]]; then
        MIGRATION_SQLITE_PATH="$argument"
      fi
      ;;
  esac
done

if [[ "${1:-}" == "--yes" ]]; then
  ASSUME_YES="true"
  COMMAND="up"
fi

if [[ "${2:-}" == "--yes" ]]; then
  ASSUME_YES="true"
fi

if [[ "$COMMAND" == "migrate" && "${2:-}" == "--yes" && -n "${3:-}" ]]; then
  MIGRATION_SQLITE_PATH="$3"
fi

if [[ "$COMMAND" == "migrate" && -z "$MIGRATION_SQLITE_PATH" ]]; then
  for argument in "${@:2}"; do
    if [[ "$argument" != "--yes" && "$argument" != "--merge" && "$argument" != "--allow-non-empty" ]]; then
      MIGRATION_SQLITE_PATH="$argument"
      break
    fi
  done
fi

print_usage() {
  printf '%s\n' "Uso: ./rebuild.sh [init|config|up|update|reboot|status|logs|down|migrate] [caminho-sqlite] [--merge] [--yes]"
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf 'Comando obrigatório não encontrado: %s\n' "$1" >&2
    exit 1
  fi
}

generate_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
    return
  fi

  od -An -N32 -tx1 /dev/urandom | tr -d ' \n'
}

env_value() {
  local key="$1"

  if [[ ! -f "$ENV_FILE" ]]; then
    return 0
  fi

  awk -F '=' -v key="$key" '
    $1 == key {
      value = substr($0, index($0, "=") + 1)
      gsub(/^"/, "", value)
      gsub(/"$/, "", value)
      print value
      exit
    }
  ' "$ENV_FILE"
}

env_quote() {
  local value="$1"

  if [[ "$value" =~ [[:space:]#\"\'\<\>] ]]; then
    value="${value//\\/\\\\}"
    value="${value//\"/\\\"}"
    printf '"%s"' "$value"
    return
  fi

  printf '%s' "$value"
}

set_env_value() {
  local key="$1"
  local value="$2"
  local encoded
  local temp_file

  encoded="$(env_quote "$value")"
  touch "$ENV_FILE"
  temp_file="$(mktemp "${ENV_FILE}.XXXXXX")"

  awk -v key="$key" -v line="${key}=${encoded}" '
    BEGIN { found = 0 }
    $0 ~ "^" key "=" {
      print line
      found = 1
      next
    }
    { print }
    END {
      if (found == 0) {
        print line
      }
    }
  ' "$ENV_FILE" > "$temp_file"

  mv "$temp_file" "$ENV_FILE"
}

prompt_value() {
  local key="$1"
  local label="$2"
  local default_value="$3"
  local current_value
  local answer

  current_value="$(env_value "$key")"

  if [[ -n "$current_value" && "$ASSUME_YES" == "true" ]]; then
    return
  fi

  if [[ -n "$current_value" ]]; then
    default_value="$current_value"
  fi

  if [[ "$ASSUME_YES" == "true" ]]; then
    set_env_value "$key" "$default_value"
    return
  fi

  read -r -p "${label} [${default_value}]: " answer
  set_env_value "$key" "${answer:-$default_value}"
}

ensure_secret() {
  local key="$1"
  local existing_value

  existing_value="$(env_value "$key")"

  if [[ -n "$existing_value" ]]; then
    return
  fi

  set_env_value "$key" "$(generate_secret)"
}

ensure_db_password_alignment() {
  local postgres_password
  local db_password

  postgres_password="$(env_value POSTGRES_PASSWORD)"
  db_password="$(env_value DB_PASSWORD)"

  if [[ -z "$db_password" && -n "$postgres_password" ]]; then
    set_env_value DB_PASSWORD "$postgres_password"
  fi
}

has_required_config() {
  local key

  for key in POSTGRES_DB POSTGRES_USER APP_HTTP_PORT APP_HTTPS_PORT DB_DIALECT DB_HOST DB_PORT DB_NAME DB_USER DB_PASSWORD SQLITE_DB_PATH EMAIL_PROVIDER; do
    if [[ -z "$(env_value "$key")" ]]; then
      return 1
    fi
  done

  return 0
}

init_config() {
  local force_prompts="${1:-false}"
  local previous_assume_yes="$ASSUME_YES"

  touch "$ENV_FILE"
  ensure_secret SESSION_SECRET
  ensure_secret POSTGRES_PASSWORD
  ensure_db_password_alignment

  if [[ "$force_prompts" == "false" && "$COMMAND" != "init" ]] && has_required_config; then
    return
  fi

  if [[ "$force_prompts" == "false" ]]; then
    ASSUME_YES="true"
  fi

  prompt_value POSTGRES_DB "Nome do banco PostgreSQL" "zerocert"
  prompt_value POSTGRES_USER "Usuário PostgreSQL" "zerocert"
  prompt_value APP_HTTP_PORT "Porta HTTP da aplicação" "3000"
  prompt_value APP_HTTPS_PORT "Porta HTTPS da aplicação" "3443"
  prompt_value DB_DIALECT "Dialeto do banco para execução fora do Compose" "postgres"
  prompt_value DB_HOST "Host do banco para execução fora do Compose" "localhost"
  prompt_value DB_PORT "Porta do banco para execução fora do Compose" "5432"
  prompt_value DB_NAME "Nome do banco para execução fora do Compose" "$(env_value POSTGRES_DB || true)"
  prompt_value DB_USER "Usuário do banco para execução fora do Compose" "$(env_value POSTGRES_USER || true)"
  ensure_db_password_alignment
  prompt_value SQLITE_DB_PATH "Caminho do SQLite legado" "src/data/database.sqlite"
  prompt_value SSL_COMMON_NAME "SSL common name" "localhost"
  prompt_value SSL_ORGANIZATION "SSL organização" "ZeroCert"
  prompt_value SSL_ORGANIZATIONAL_UNIT "SSL unidade organizacional" "Dev"
  prompt_value SSL_COUNTRY "SSL país" "BR"
  prompt_value SSL_STATE "SSL estado" "DF"
  prompt_value SSL_LOCALITY "SSL localidade" "Brasilia"
  prompt_value SSL_DAYS_VALID "Dias de validade SSL" "365"
  prompt_value SSL_DOMAINS "Domínios SSL separados por vírgula" "localhost"
  prompt_value SSL_IPS "IPs SSL separados por vírgula" "127.0.0.1"
  prompt_value EMAIL_PROVIDER "Provedor de e-mail smtp ou resend" "smtp"
  prompt_value SMTP_HOST "SMTP host vazio para desativar" ""
  prompt_value SMTP_PORT "SMTP porta" "587"
  prompt_value SMTP_SECURE "SMTP seguro true ou false" "false"
  prompt_value SMTP_USER "SMTP usuário vazio se não houver" ""
  prompt_value SMTP_PASSWORD "SMTP senha vazia se não houver" ""
  prompt_value RESEND_API_KEY "Resend API key vazia se não houver" ""
  prompt_value EMAIL_FROM "Remetente de e-mail" "ZeroCert <no-reply@localhost>"

  ASSUME_YES="$previous_assume_yes"
}

compose() {
  require_command docker
  docker compose --env-file "$ENV_FILE" "$@"
}

choose_command() {
  local option

  if [[ "$COMMAND" != "menu" ]]; then
    return
  fi

  printf '%s\n' "1) init"
  printf '%s\n' "2) config"
  printf '%s\n' "3) up"
  printf '%s\n' "4) update"
  printf '%s\n' "5) reboot"
  printf '%s\n' "6) status"
  printf '%s\n' "7) logs"
  printf '%s\n' "8) down"
  printf '%s\n' "9) migrate"
  read -r -p "Escolha uma opção [3]: " option

  case "${option:-3}" in
    1) COMMAND="init" ;;
    2) COMMAND="config" ;;
    3) COMMAND="up" ;;
    4) COMMAND="update" ;;
    5) COMMAND="reboot" ;;
    6) COMMAND="status" ;;
    7) COMMAND="logs" ;;
    8) COMMAND="down" ;;
    9) COMMAND="migrate" ;;
    *) COMMAND="up" ;;
  esac
}

run_update() {
  if [[ -d .git ]]; then
    git pull --ff-only
  fi

  init_config false
  compose up -d --build
}

run_migration() {
  require_command docker
  init_config false
  local sqlite_path
  local sqlite_absolute_path
  local merge_answer

  sqlite_path="${MIGRATION_SQLITE_PATH:-$(env_value SQLITE_DB_PATH)}"

  if [[ -z "$sqlite_path" ]]; then
    printf '%s\n' "Informe o caminho do SQLite legado." >&2
    exit 1
  fi

  if [[ ! -f "$sqlite_path" ]]; then
    printf 'Arquivo SQLite não encontrado: %s\n' "$sqlite_path" >&2
    exit 1
  fi

  if [[ "$ASSUME_YES" != "true" && "$MIGRATION_ALLOW_NON_EMPTY" != "true" ]]; then
    printf '%s\n' "O banco PostgreSQL atual pode já conter dados."
    printf '%s\n' "Se permitir merge, registros com os mesmos IDs serão atualizados pelo SQLite."
    read -r -p "Permitir merge em banco não vazio? [s/N]: " merge_answer

    case "${merge_answer,,}" in
      s|sim|y|yes)
        MIGRATION_ALLOW_NON_EMPTY="true"
        ;;
    esac
  fi

  sqlite_absolute_path="$(cd "$(dirname "$sqlite_path")" && pwd)/$(basename "$sqlite_path")"

  compose up -d --build postgres
  compose run --rm -T \
    -v "${sqlite_absolute_path}:/tmp/zerocert-legacy.sqlite:ro" \
    -e SQLITE_DB_PATH=/tmp/zerocert-legacy.sqlite \
    -e MIGRATION_ALLOW_NON_EMPTY="$MIGRATION_ALLOW_NON_EMPTY" \
    -e DB_DIALECT=postgres \
    -e DB_HOST=postgres \
    -e DB_PORT=5432 \
    -e DB_NAME="$(env_value POSTGRES_DB)" \
    -e DB_USER="$(env_value POSTGRES_USER)" \
    -e DB_PASSWORD="$(env_value POSTGRES_PASSWORD)" \
    web bun run db:migrate:sqlite-to-postgres
}

choose_command

case "$COMMAND" in
  init)
    init_config true
    compose up -d --build
    ;;
  config)
    init_config true
    ;;
  up)
    init_config false
    compose up -d --build
    ;;
  update)
    run_update
    ;;
  reboot|restart)
    init_config false
    compose up -d --build
    compose restart web
    ;;
  status)
    init_config false
    compose ps
    ;;
  logs)
    init_config false
    compose logs -f --tail=120
    ;;
  down)
    init_config false
    compose down
    ;;
  migrate)
    run_migration
    ;;
  help|-h|--help)
    print_usage
    ;;
  *)
    print_usage
    exit 1
    ;;
esac
