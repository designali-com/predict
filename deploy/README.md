# Deploying to EC2

One Ubuntu 24.04 instance runs everything:

| Process              | Port | Reached at            |
|----------------------|------|-----------------------|
| web (patient app)    | 3000 | `https://<WEB>`       |
| automation (ops)     | 3001 | `https://<OPS>`       |
| clinic               | 3002 | `https://<CLINIC>`    |
| automation-webhook   | 3100 | `https://<OPS>/webhooks/…` |
| automation-worker    | —    | —                     |
| Redis (Docker)       | 6380 | localhost only        |

The database (Neon) and files (S3) are outside the server.

For testing, with Elastic IP `A.B.C.D`, the hosts are free sslip.io names:
`<WEB>` = `app.A-B-C-D.sslip.io`, `<CLINIC>` = `clinic.A-B-C-D.sslip.io`,
`<OPS>` = `ops.A-B-C-D.sslip.io`. Moving to the real domain later is the same
steps with the real names — no code changes.

## 1. Connect

From the folder with `predict-key.pem`:

```
ssh -i predict-key.pem ubuntu@A.B.C.D
```

(On Windows, if ssh complains the key is "too open":
`icacls predict-key.pem /inheritance:r /grant:r "%USERNAME%:R"`.)
Or: EC2 console → instance → Connect → Session Manager.

## 2. Code and setup (once)

```
git clone https://github.com/predicttech/predictfit.git
cd predictfit
git checkout <branch>
sudo bash deploy/setup-server.sh
exit                     # log out and back in once, for the docker group
```

## 3. The three .env files

Copy them up from the laptop (run on the laptop, in the repo root):

```
scp -i predict-key.pem apps/web/.env        ubuntu@A.B.C.D:~/predictfit/apps/web/.env
scp -i predict-key.pem apps/clinic/.env     ubuntu@A.B.C.D:~/predictfit/apps/clinic/.env
scp -i predict-key.pem apps/automation/.env ubuntu@A.B.C.D:~/predictfit/apps/automation/.env
```

Then on the server (`nano apps/web/.env` …) change these, and **delete**
`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` and every `CLOUDINARY_*` line —
the instance role gives S3 access:

| File | Set |
|------|-----|
| `apps/web/.env` | `BETTER_AUTH_URL=https://<WEB>` · `NEXT_PUBLIC_APP_URL=https://<WEB>` |
| `apps/clinic/.env` | `BETTER_AUTH_URL=https://<CLINIC>` · `NEXT_PUBLIC_PATIENT_URL=https://<WEB>` · `NEXT_PUBLIC_OPERATIONS_URL=https://<OPS>` |
| `apps/automation/.env` | `BETTER_AUTH_URL=https://<OPS>` · `NEXT_PUBLIC_PATIENT_URL=https://<WEB>` · `NEXT_PUBLIC_CLINIC_URL=https://<CLINIC>` · `REDIS_URL=redis://localhost:6380` · `PORT=3100` |

All three keep `S3_BUCKET` and `AWS_REGION=ap-south-1`.
`NEXT_PUBLIC_*` values are baked in at build time — set them before step 4.

## 4. Build and start

```
bash deploy/deploy.sh
```

Builds one app at a time (~10–15 min on a t3.medium), starts all five
processes under pm2, and saves them so they come back after a reboot.

## 5. Hostnames and HTTPS

```
sudo bash deploy/nginx.sh app.A-B-C-D.sslip.io clinic.A-B-C-D.sslip.io ops.A-B-C-D.sslip.io you@example.com
```

## 6. Outside the server

- **S3 CORS** (bucket → Permissions → CORS): add `https://<WEB>`,
  `https://<CLINIC>`, `https://<OPS>` to `AllowedOrigins`.
- **Google sign-in** (Google Cloud → Credentials → the OAuth client): add
  `https://<WEB>/api/auth/callback/google` (and the clinic one if used) to
  the authorised redirect URIs.
- **WhatsApp** (Meta app → WhatsApp → Configuration): webhook URL
  `https://<OPS>/webhooks/whatsapp`, same verify token as in `.env`.

## Later deploys

```
cd ~/predictfit && bash deploy/deploy.sh --pull
```

## Looking at it

```
pm2 status               # all five should be "online"
pm2 logs web             # or clinic / automation / automation-webhook / automation-worker
pm2 restart clinic
```
