#!/usr/bin/env bash
#
# Deploy SEGURO do War Room na VPS — builda, VERIFICA que o build passou, e só
# ENTÃO recria o container; depois confere a saúde. Aborta (sem recriar) se o
# build falhar, para nunca servir imagem velha achando que subiu — o incidente
# que motivou este script (um `export const` em "use server" derrubava o
# `pnpm build`, o deploy "dizia OK" e servia código antigo).
#
# Uso (na VPS, em /root/warroom):   bash scripts/deploy-vps.sh [branch]
# Pré-requisitos: .env presente; docker compose; estar no diretório do repo.
set -euo pipefail

BRANCH="${1:-$(git rev-parse --abbrev-ref HEAD)}"
COMPOSE="docker compose -f docker-compose.local.yml"
export LOCAL_ENV_FILE="${LOCAL_ENV_FILE:-.env}"
LOGIN_URL="${LOGIN_URL:-https://warromcleitonxavier.cloud/login}"

say() { printf '\n\033[1;33m==> %s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31mXX %s\033[0m\n' "$*" >&2; exit 1; }

[ -f .env ] || die ".env não encontrado — rode a partir de /root/warroom."
[ -f docker-compose.local.yml ] || die "docker-compose.local.yml não encontrado."

IMG_ANTES="$(docker image inspect deskcomm-app:local --format '{{.Id}}' 2>/dev/null || echo 'nenhuma')"
say "Imagem atual: ${IMG_ANTES}"

say "git pull origin ${BRANCH}"
git pull origin "${BRANCH}"
say "HEAD agora: $(git log --oneline -1)"

# ── BUILD (o gate). Se o pnpm build falhar, o docker build sai !=0 e o
#    `set -e` aborta o script AQUI, ANTES de qualquer recreate. ────────────────
say "Buildando a imagem (pode levar ~10 min)…"
if ! ${COMPOSE} build app; then
  die "BUILD FALHOU. NADA foi recriado — o container segue servindo a versão anterior. Corrija o build e rode de novo."
fi

IMG_DEPOIS="$(docker image inspect deskcomm-app:local --format '{{.Id}}' 2>/dev/null || echo 'nenhuma')"
if [ "${IMG_DEPOIS}" = "nenhuma" ]; then
  die "Build não produziu imagem deskcomm-app:local — abortando sem recriar."
fi
if [ "${IMG_DEPOIS}" = "${IMG_ANTES}" ]; then
  say "AVISO: imagem não mudou (${IMG_DEPOIS}). Build cacheado ou sem alterações — recriando mesmo assim."
else
  say "Imagem nova: ${IMG_DEPOIS}"
fi

# ── RECREATE (a janela de ~10 s de 502 começa aqui) ──────────────────────────
say "Recriando o container app (janela de ~10 s)…"
${COMPOSE} up -d --force-recreate app
# A rede interna precisa do alias 'app' (idempotente).
docker network connect --alias app warroom_internal warroom-app-1 2>/dev/null || true

# ── HEALTH CHECK ─────────────────────────────────────────────────────────────
say "Conferindo a saúde…"
OK=""
for i in $(seq 1 24); do
  sleep 5
  RUN="$(docker inspect warroom-app-1 --format '{{.State.Running}}' 2>/dev/null || echo false)"
  HEALTH="$(docker inspect warroom-app-1 --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}sem-healthcheck{{end}}' 2>/dev/null || echo erro)"
  CODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "${LOGIN_URL}" || echo 000)"
  printf '   [%2ss] Running=%s Health=%s login=%s\n' "$((i*5))" "${RUN}" "${HEALTH}" "${CODE}"
  if [ "${RUN}" = "true" ] && { [ "${HEALTH}" = "healthy" ] || [ "${HEALTH}" = "sem-healthcheck" ]; } && [ "${CODE}" = "200" ]; then
    OK="sim"; break
  fi
done

RESTARTS="$(docker inspect warroom-app-1 --format '{{.RestartCount}}' 2>/dev/null || echo '?')"
if [ -n "${OK}" ]; then
  say "DEPLOY OK — app saudável (RestartCount=${RESTARTS}, login 200). HEAD $(git log --oneline -1)"
else
  die "DEPLOY SUBIU MAS NÃO FICOU SAUDÁVEL (RestartCount=${RESTARTS}). Veja: docker logs --tail=80 warroom-app-1"
fi
