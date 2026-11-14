import { randomBytes } from "node:crypto";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * File storage on S3, for every app.
 *
 * Two kinds of file, kept under two prefixes:
 *
 *   private/  medical reports. Never readable by URL alone: whoever shows one
 *             asks readableUrl() for a link that works for a few minutes.
 *   public/   profile photos and the WhatsApp media library. Readable by URL
 *             (the bucket policy allows GetObject on public/* only), because
 *             an <img> in every header needs it, and Meta fetches a template's
 *             header media itself with no way to sign in.
 *
 * Every key carries a random part, so a public URL cannot be guessed.
 *
 * What is stored in the database is the object's plain S3 URL. That keeps the
 * columns meaning what they always meant — "where the file is" — and lets old
 * Cloudinary URLs sit beside new ones: readableUrl() signs ours and passes
 * anything else through untouched.
 *
 * Credentials come from the AWS SDK's default chain: AWS_ACCESS_KEY_ID /
 * AWS_SECRET_ACCESS_KEY in .env on a laptop, the instance role on EC2 (no keys
 * on the server at all).
 */

const region = process.env.AWS_REGION ?? process.env.S3_REGION ?? "ap-south-1";

/**
 * Path-style URLs (s3.<region>.amazonaws.com/<bucket>/<key>), not
 * <bucket>.s3...: the bucket name has a dot in it, and a dotted name as a
 * subdomain falls outside AWS's *.s3 certificate — browsers refuse the link.
 */
const host = `s3.${region}.amazonaws.com`;

let client: S3Client | null = null;
function s3() {
  client ??= new S3Client({ region, forcePathStyle: true });
  return client;
}

function bucket(): string {
  const name = process.env.S3_BUCKET;
  if (!name) throw new Error("S3_BUCKET is not set — add it to this app's .env");
  return name;
}

export type Visibility = "public" | "private";

/** The object's plain URL — what the database keeps. */
export function objectUrl(key: string): string {
  const path = key.split("/").map(encodeURIComponent).join("/");
  return `https://${host}/${encodeURIComponent(bucket())}/${path}`;
}

/** The key, when the URL points into our bucket; null for anything else (e.g. an old Cloudinary link). */
export function keyFromUrl(url: string | null | undefined): string | null {
  if (!url || !process.env.S3_BUCKET) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const path = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  // Path style (what uploadFile stores) or virtual-host style, either region form.
  if (parsed.hostname === host || parsed.hostname === "s3.amazonaws.com") {
    return path.startsWith(`${bucket()}/`) ? path.slice(bucket().length + 1) : null;
  }
  if (parsed.hostname === `${bucket()}.${host}` || parsed.hostname === `${bucket()}.s3.amazonaws.com`) return path;
  return null;
}

/** "Blood Report (1).PDF" → "blood-report-1.pdf" — safe in a key, still recognisable. */
function slug(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  const base = (dot > 0 ? fileName.slice(0, dot) : fileName)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  const ext = dot > 0 ? fileName.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) : "";
  return `${base || "file"}${ext ? `.${ext}` : ""}`;
}

/**
 * Store a file. `folder` is the part after the visibility prefix, e.g.
 * "reports/<userId>"; the file name is kept, behind a random part.
 */
export async function uploadFile(input: {
  visibility: Visibility;
  folder: string;
  fileName: string;
  body: Buffer | Uint8Array;
  contentType: string;
}): Promise<{ key: string; url: string }> {
  const folder = input.folder.replace(/^\/+|\/+$/g, "");
  const key = `${input.visibility}/${folder}/${randomBytes(8).toString("hex")}-${slug(input.fileName)}`;

  // Demo: no bucket. The file is kept inline as a data URL (capped, so a
  // visitor cannot fill the demo database), and opens straight from the row.
  if (process.env.DEMO_MODE !== "0") {
    const bytes = Buffer.from(input.body);
    if (bytes.length > 2 * 1024 * 1024) throw new Error("Uploads are limited to 2 MB in the demo.");
    return { key, url: `data:${input.contentType || "application/octet-stream"};base64,${bytes.toString("base64")}` };
  }

  await s3().send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: input.body,
      ContentType: input.contentType || "application/octet-stream",
      // Opened in the browser rather than downloaded, under its real name.
      ContentDisposition: `inline; filename="${slug(input.fileName)}"`,
      CacheControl: input.visibility === "public" ? "public, max-age=31536000, immutable" : "private, no-store",
    }),
  );

  return { key, url: objectUrl(key) };
}

/** Remove a file by its stored URL or key. Anything not in our bucket is left alone. */
export async function deleteFile(urlOrKey: string | null | undefined): Promise<void> {
  if (!urlOrKey) return;
  if (process.env.DEMO_MODE !== "0" || urlOrKey.startsWith("data:")) return;
  const key = urlOrKey.startsWith("http") ? keyFromUrl(urlOrKey) : urlOrKey;
  if (!key) return;
  await s3().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}

/**
 * A URL a browser can open. Private files get a link that works for
 * `expiresIn` seconds (15 minutes by default); public files and anything not in
 * our bucket come back as they are.
 */
export async function readableUrl(url: string, expiresIn = 15 * 60): Promise<string> {
  const key = keyFromUrl(url);
  if (!key || !key.startsWith("private/")) return url;
  return getSignedUrl(s3(), new GetObjectCommand({ Bucket: bucket(), Key: key }), { expiresIn });
}

/** readableUrl() over a list of rows with a fileUrl, for API responses. */
export async function withReadableUrls<T extends { fileUrl: string }>(rows: T[], expiresIn?: number): Promise<T[]> {
  return Promise.all(rows.map(async (row) => ({ ...row, fileUrl: await readableUrl(row.fileUrl, expiresIn) })));
}
