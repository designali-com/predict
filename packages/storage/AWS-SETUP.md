# S3 setup

Bucket: `predict.fit-643620726493-ap-south-1-an` (ap-south-1, Mumbai).
Every app (web, clinic, automation) uses it through `@workspace/storage`.

| Prefix     | What                                  | Who can read                              |
|------------|---------------------------------------|-------------------------------------------|
| `private/` | blood reports and other patient files | nobody by URL — the app hands out a signed link that expires in 15 min |
| `public/`  | profile photos, WhatsApp media library | anyone with the URL (keys have a random part, so URLs can't be guessed) |

## 1. A policy the app runs with

IAM → Policies → Create policy → JSON. Name it `predict-app-s3`.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::predict.fit-643620726493-ap-south-1-an/*"
    },
    {
      "Effect": "Allow",
      "Action": "s3:ListBucket",
      "Resource": "arn:aws:s3:::predict.fit-643620726493-ap-south-1-an"
    }
  ]
}
```

- **Laptop:** IAM → Users → Create user `predict-local` (no console access) → attach
  `predict-app-s3` → Security credentials → Create access key ("Local code").
  Put the two values in `apps/web/.env`, `apps/clinic/.env`, `apps/automation/.env`:
  `AWS_ACCESS_KEY_ID=…` and `AWS_SECRET_ACCESS_KEY=…`. Never commit them.
- **EC2:** IAM → Roles → Create role → trusted entity EC2 → attach `predict-app-s3`
  → EC2 instance → Actions → Security → Modify IAM role. No keys on the server;
  leave `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` out of the server's `.env`.

## 2. Make `public/` readable

Bucket → Permissions → **Block public access** → Edit: untick only
"…through *new* public bucket or access point policies" and
"…through *any* public bucket or access point policies". Keep the two ACL
boxes ticked. (If the account-level setting under S3 → "Block Public Access
settings for this account" is on, relax the same two there.)

Then Bucket policy → Edit:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicPhotosAndMedia",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::predict.fit-643620726493-ap-south-1-an/public/*"
    }
  ]
}
```

`private/` stays closed — the policy names `public/*` only.

## 3. CORS (the report viewer reads PDFs from the browser)

Bucket → Permissions → CORS → Edit. Add the production domains when you have them.

```json
[
  {
    "AllowedOrigins": ["http://localhost:3000", "http://localhost:3001", "http://localhost:3002"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["Content-Length", "Content-Range", "Accept-Ranges"],
    "MaxAgeSeconds": 3000
  }
]
```

## 4. Check it

```
pnpm --filter @workspace/storage s3:test
```

Uploads a private and a public test file, checks that the private one is
refused by plain URL and opens by signed link, that the public one opens by
plain URL, then deletes both. All five lines should say PASS.

## Notes

- URLs are path-style (`s3.ap-south-1.amazonaws.com/<bucket>/<key>`) because
  the bucket name contains a dot, which breaks HTTPS on `<bucket>.s3…` hosts.
- Files uploaded to Cloudinary before the switch keep working: their URLs are
  stored as they were and passed through untouched.
