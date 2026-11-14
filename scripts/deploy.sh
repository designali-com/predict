#!/usr/bin/env bash
#
# Deploy the websites with no downtime at all — blue/green.
#
# The old way — git pull and `next build` inside the live checkout — rewrote
# the .next folder the running servers were reading from, so every site
# answered 502 Bad Gateway for the whole build. Restarting in place still left
# a gap of a few seconds. Now nothing that is serving traffic is ever touched:
#
#   1. clone the branch into ~/releases/<time>, copy the .env files across,
#      install and build there — the live sites keep running;
#   2. for each site, start the new build next to the live one on the other
#      port (web 3000/3010, ops 3001/3011, clinic 3002/3012);
#   3. only when it answers, point nginx at the new port and reload nginx —
#      a graceful reload: requests already in flight finish on the old one;
#   4. after a drain period, stop the old one;
#   5. delete old releases (and their build caches), keeping the last few for
#      a rollback, never one a running process still uses.
#
# A build that fails changes nothing, and a new server that does not come up
# is removed without the live one ever being switched.
#
# The three websites (web, clinic, automation = ops) are deployed as above.
# automation-worker and automation-webhook run from ~/predictfit; once the
# sites are live, that checkout is fast-forwarded to the same commit and the
# two are restarted, so the daily check-ins and campaigns send with the code
# the sites run. (Left alone, the worker sat on 14 Oct's code for weeks and
# every check-in was refused by Meta.) WORKER=0 skips it; a rollback never
# touches it. Redis is never touched.
#
# Usage (on the server):
#   bash ~/deploy.sh                      (copied from scripts/deploy.sh)
#   APPS="clinic" bash ~/deploy.sh
#   WORKER=0 bash ~/deploy.sh             # the sites only
#   ROLLBACK=1 bash ~/deploy.sh           # the previous release, the same way

set -euo pipefail

BRANCH="${BRANCH:-production}"
APPS="${APPS:-web clinic automation}"
KEEP="${KEEP:-3}"
DRAIN="${DRAIN:-20}"
REPO="${REPO:-git@github.com:predictfit/predictfit.git}"

BASE="$HOME"
WORKER_TREE="$BASE/predictfit" # the worker's checkout — read, never changed
RELEASES="$BASE/releases"
UPSTREAMS=/etc/nginx/conf.d/predict-upstreams.conf
SITES=(predict-web predict-clinic predict-ops)

declare -A BLUE=([web]=3000 [automation]=3001 [clinic]=3002)

for app in $APPS; do
  [[ -n "${BLUE[$app]:-}" ]] || { echo "unknown app '$app' — only web, clinic, automation are deployed here"; exit 1; }
done

log() { echo "[deploy $(date +%H:%M:%S)] $*"; }

# Is the server on this port answering? Anything below 500 counts — a login
# redirect is healthy.
healthy() {
  local port="$1"
  for _ in $(seq 1 90); do
    local code
    code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "http://127.0.0.1:$port/" || true)
    if [[ "$code" =~ ^[1-4][0-9][0-9]$ ]]; then return 0; fi
    sleep 1
  done
  return 1
}

# The port nginx sends a site to right now.
live_port() {
  local app="$1" port=""
  [[ -f "$UPSTREAMS" ]] && port=$(sed -n "/upstream ${app}_app/,/}/p" "$UPSTREAMS" | grep -o '127.0.0.1:[0-9]*' | cut -d: -f2 | head -1)
  echo "${port:-${BLUE[$app]}}"
}

other_port() { local app="$1" port="$2"; [[ "$port" == "${BLUE[$app]}" ]] && echo $((port + 10)) || echo "${BLUE[$app]}"; }

# pm2 name for a site on a port: the blue one keeps the plain name.
pm2_name() { local app="$1" port="$2"; [[ "$port" == "${BLUE[$app]}" ]] && echo "$app" || echo "$app-green"; }

nginx_reload() {
  sudo nginx -t -q && sudo systemctl reload nginx
}

# Point one site at a port: rewrite the upstream block and reload nginx.
switch_to() {
  local app="$1" port="$2" tmp
  tmp=$(mktemp)
  for a in web clinic automation; do
    local p
    p=$([[ "$a" == "$app" ]] && echo "$port" || live_port "$a")
    printf 'upstream %s_app {\n  server 127.0.0.1:%s;\n}\n' "$a" "$p" >> "$tmp"
  done
  sudo cp "$UPSTREAMS" "$UPSTREAMS.bak" 2>/dev/null || true
  sudo cp "$tmp" "$UPSTREAMS"
  rm -f "$tmp"
  if ! nginx_reload; then
    sudo cp "$UPSTREAMS.bak" "$UPSTREAMS"
    nginx_reload || true
    return 1
  fi
}

# One time: the site configs proxy straight to the blue ports. Give each site a
# named upstream instead, still on the same port — nothing moves yet.
ensure_upstreams() {
  [[ -f "$UPSTREAMS" ]] && return 0
  log "one-time: moving the nginx sites onto named upstreams (same ports)"
  local backup="$BASE/nginx-backup-$(date +%Y%m%d-%H%M%S)"
  mkdir -p "$backup"
  sudo cp /etc/nginx/sites-available/predict-* "$backup/"
  printf 'upstream web_app {\n  server 127.0.0.1:3000;\n}\nupstream clinic_app {\n  server 127.0.0.1:3002;\n}\nupstream automation_app {\n  server 127.0.0.1:3001;\n}\n' | sudo tee "$UPSTREAMS" >/dev/null
  for s in "${SITES[@]}"; do
    sudo sed -i \
      -e 's#proxy_pass http://127.0.0.1:3000;#proxy_pass http://web_app;#' \
      -e 's#proxy_pass http://127.0.0.1:3002;#proxy_pass http://clinic_app;#' \
      -e 's#proxy_pass http://127.0.0.1:3001;#proxy_pass http://automation_app;#' \
      "/etc/nginx/sites-available/$s"
  done
  if ! nginx_reload; then
    log "nginx refused the change — putting the old configs back"
    sudo cp "$backup"/predict-* /etc/nginx/sites-available/
    sudo rm -f "$UPSTREAMS"
    nginx_reload
    exit 1
  fi
}

# Bring one site up from $release beside the live one, then switch to it.
deploy_site() {
  local app="$1" release="$2"
  local from to old new
  from=$(live_port "$app")
  to=$(other_port "$app" "$from")
  old=$(pm2_name "$app" "$from")
  new=$(pm2_name "$app" "$to")

  pm2 delete "$new" >/dev/null 2>&1 || true
  log "  $app: starting the new build on :$to (live stays on :$from)"
  NODE_ENV=production pm2 start "$release/apps/$app/node_modules/next/dist/bin/next" --name "$new" --cwd "$release/apps/$app" \
    -- start --port "$to" --hostname 127.0.0.1 >/dev/null

  if ! healthy "$to"; then
    log "  $app: the new build did not come up — removed it, live is unchanged on :$from"
    pm2 logs "$new" --nostream --lines 20 2>/dev/null | tail -20 || true
    pm2 delete "$new" >/dev/null 2>&1 || true
    return 1
  fi

  if ! switch_to "$app" "$to"; then
    log "  $app: nginx would not switch — removed the new build, live is unchanged on :$from"
    pm2 delete "$new" >/dev/null 2>&1 || true
    return 1
  fi
  log "  $app: live on :$to — letting :$from finish its requests for ${DRAIN}s"
  sleep "$DRAIN"
  pm2 delete "$old" >/dev/null 2>&1 || true
  log "  $app: done"
}

mkdir -p "$RELEASES"
ensure_upstreams

# The release a live site is running from.
release_of() {
  local app="$1" name pid
  name=$(pm2_name "$app" "$(live_port "$app")")
  pid=$(pm2 pid "$name" 2>/dev/null || true)
  [[ -n "$pid" && "$pid" != "0" ]] && readlink -f "/proc/$pid/cwd" | sed 's#/apps/.*##' || true
}

if [[ "${ROLLBACK:-}" == "1" ]]; then
  first=$(echo "$APPS" | awk '{print $1}')
  current=$(release_of "$first")
  new="$(ls -1d "$RELEASES"/*/ | sed 's#/$##' | grep -v "^$current$" | sort | awk -v c="$current" '$0 < c' | tail -1)"
  [[ -n "$new" ]] || { log "no earlier release to go back to"; exit 1; }
  log "rolling back to $new"
else
  new="$RELEASES/$(date +%Y%m%d-%H%M%S)"
  log "building $BRANCH in $new — the live sites keep running"

  git clone -q --branch "$BRANCH" --reference-if-able "$WORKER_TREE" --dissociate "$REPO" "$new"
  log "commit $(git -C "$new" log -1 --format='%h %s')"

  # Secrets are not in git: bring every app's .env along, from the worker's
  # checkout, which always has the current ones.
  (cd "$WORKER_TREE" && find apps packages -maxdepth 3 \( -name .env -o -name .env.local -o -name .env.production \) -not -path "*/node_modules/*") |
    while read -r f; do cp "$WORKER_TREE/$f" "$new/$f"; done

  cd "$new"
  log "install"
  pnpm install --frozen-lockfile --reporter=silent

  # One at a time — three builds at once runs a 4 GB server out of memory.
  for app in $APPS; do
    log "build $app"
    if ! pnpm --filter "$app" build > "$new/build-$app.log" 2>&1; then
      log "build of $app FAILED — nothing was switched, the live sites are unchanged"
      tail -30 "$new/build-$app.log"
      exit 1
    fi
  done
fi

failed=""
for app in $APPS; do
  deploy_site "$app" "$new" || failed="$failed $app"
done
pm2 save >/dev/null

# Old releases go, with their .next build caches. Kept: the newest $KEEP, and
# any release a running process still uses.
in_use="$(for pid in $(pm2 jlist | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{for(const p of JSON.parse(d))if(p.pid)console.log(p.pid)})'); do
  readlink -f "/proc/$pid/cwd" 2>/dev/null || true
done)"
ls -1d "$RELEASES"/*/ | sed 's#/$##' | sort | head -n -"$KEEP" | while read -r old; do
  if grep -q "^$old/" <<<"$in_use"; then
    log "keeping $old — still in use"
  else
    rm -rf "$old"
    log "removed $old"
  fi
done

if [[ -n "$failed" ]]; then
  log "finished with problems:$failed — those sites are still on their previous build"
  exit 1
fi

# The worker and webhook onto the commit just deployed. A failure here is
# reported but leaves the sites live — they are already switched.
update_worker() {
  local commit
  commit=$(git -C "$new" rev-parse HEAD)
  log "worker: $WORKER_TREE onto $(git -C "$new" log -1 --format='%h')"
  # Generated files the dev server rewrites must not block the fast-forward.
  git -C "$WORKER_TREE" checkout -- apps/web/.source 2>/dev/null || true
  git -C "$WORKER_TREE" fetch -q origin "$BRANCH" &&
    git -C "$WORKER_TREE" merge -q --ff-only "$commit" &&
    (cd "$WORKER_TREE" && pnpm install --frozen-lockfile --reporter=silent) &&
    pm2 restart automation-webhook automation-worker --update-env >/dev/null &&
    pm2 save >/dev/null
}
if [[ "${ROLLBACK:-}" == "1" ]]; then
  log "rollback: worker and webhook left as they are"
elif [[ "${WORKER:-1}" == "1" ]]; then
  if update_worker; then
    log "worker and webhook restarted on $(git -C "$WORKER_TREE" log -1 --format='%h')"
  else
    log "worker update FAILED — the sites are live; the worker still runs $(git -C "$WORKER_TREE" log -1 --format='%h')"
  fi
fi

log "done — live on $(git -C "$new" log -1 --format='%h %s')"
