#!/usr/bin/env bash
# Point three hostnames at the three apps, and get HTTPS for them.
#
#   sudo bash deploy/nginx.sh <web-host[,alias…]> <clinic-host> <ops-host> [email]
#   sudo bash deploy/nginx.sh predict.fit,www.predict.fit clinic.predict.fit ops.predict.fit
#
# The email only gets Let's Encrypt expiry warnings; without it the
# certificates are issued and renewed just the same.
#
# Testing, on the Elastic IP 13.233.45.67 (sslip.io resolves any such name to
# that IP, free, and Let's Encrypt issues certificates for it):
#   sudo bash deploy/nginx.sh app.13-233-45-67.sslip.io clinic.13-233-45-67.sslip.io ops.13-233-45-67.sslip.io you@example.com
#
# Later, on the real domain — same command with the real names.
set -euo pipefail
if [ "$(id -u)" -ne 0 ]; then echo "Run with sudo"; exit 1; fi
if [ $# -lt 3 ]; then sed -n '2,14p' "$0"; exit 1; fi
WEB="$1"; CLINIC="$2"; OPS="$3"; EMAIL="${4:-}"

site() { # name host port [extra location block]
  cat > "/etc/nginx/sites-available/predict-$1" <<EOF
server {
  listen 80;
  server_name $2;
  # Blood reports and photos are uploaded through the apps.
  client_max_body_size 25m;
$4
  location / {
    proxy_pass http://127.0.0.1:$3;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection "upgrade";
    # AI chat answers stream; buffering would hold them until the end.
    proxy_buffering off;
    proxy_read_timeout 300s;
  }
}
EOF
  ln -sf "/etc/nginx/sites-available/predict-$1" "/etc/nginx/sites-enabled/predict-$1"
}

# WEB may list more than one name, comma separated — "predict.fit,www.predict.fit".
# The first is the address the app lives at; the others redirect to it, so
# sign-in cookies and links only ever see one origin.
IFS=',' read -r -a WEB_NAMES <<< "$WEB"
WEB="${WEB_NAMES[0]}"
site web "$WEB" 3000 ""
if [ "${#WEB_NAMES[@]}" -gt 1 ]; then
  cat > /etc/nginx/sites-available/predict-web-aliases <<EOF
server {
  listen 80;
  server_name ${WEB_NAMES[*]:1};
  return 301 https://$WEB\$request_uri;
}
EOF
  ln -sf /etc/nginx/sites-available/predict-web-aliases /etc/nginx/sites-enabled/predict-web-aliases
fi
site clinic "$CLINIC" 3002 ""
# WhatsApp / lead webhooks go to the webhook server; the rest is the ops panel.
site ops "$OPS" 3001 "  location /webhooks/ {
    proxy_pass http://127.0.0.1:3100;
    proxy_set_header Host \$host;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
  }"

nginx -t
systemctl reload nginx

# HTTPS for all three, and http:// redirected to https://. Renews itself.
if [ -n "$EMAIL" ]; then ACCOUNT=(-m "$EMAIL"); else ACCOUNT=(--register-unsafely-without-email); fi
DOMAINS=(-d "$WEB" -d "$CLINIC" -d "$OPS")
for alias in "${WEB_NAMES[@]:1}"; do DOMAINS+=(-d "$alias"); done
certbot --nginx --non-interactive --agree-tos "${ACCOUNT[@]}" --redirect "${DOMAINS[@]}"

echo
echo "https://$WEB  https://$CLINIC  https://$OPS"
