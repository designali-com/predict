/**
 * Check the S3 setup end to end, from this laptop or the server.
 *
 *   pnpm --filter @workspace/storage s3:test
 *
 * (reads apps/web/.env — see the s3:test script). Uploads two small files,
 * checks each can be read exactly as it should, and deletes them again.
 */
import { deleteFile, readableUrl, uploadFile } from "../src/index";

let failed = false;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
  if (!ok) failed = true;
}

async function status(url: string) {
  const res = await fetch(url);
  return res.status;
}

console.log(`bucket ${process.env.S3_BUCKET} · region ${process.env.AWS_REGION ?? "ap-south-1"}\n`);

const body = Buffer.from(`predict storage test ${new Date().toISOString()}\n`);
const uploaded: string[] = [];

try {
  const priv = await uploadFile({ visibility: "private", folder: "_test", fileName: "private-test.txt", body, contentType: "text/plain" });
  uploaded.push(priv.url);
  check("upload a private file", true, priv.key);

  const plain = await status(priv.url);
  check("private file is NOT readable by its plain URL", plain === 403, `HTTP ${plain}`);

  const signed = await readableUrl(priv.url, 60);
  const signedStatus = await status(signed);
  check("private file IS readable by a signed link", signedStatus === 200, `HTTP ${signedStatus}`);

  const pub = await uploadFile({ visibility: "public", folder: "_test", fileName: "public-test.txt", body, contentType: "text/plain" });
  uploaded.push(pub.url);
  check("upload a public file", true, pub.key);

  const pubStatus = await status(pub.url);
  check(
    "public file is readable by its plain URL",
    pubStatus === 200,
    pubStatus === 403 ? "HTTP 403 — the bucket policy for public/* is not applied yet" : `HTTP ${pubStatus}`,
  );
} catch (error) {
  const e = error as { name?: string; message?: string };
  check("talk to S3", false, `${e.name}: ${e.message}`);
  if (e.name === "CredentialsProviderError") console.log("\n→ Add AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY to apps/web/.env");
  if (e.name === "AccessDenied") console.log("\n→ The IAM user's policy does not allow this bucket yet");
} finally {
  for (const url of uploaded) {
    await deleteFile(url).then(
      () => console.log(`      cleaned up ${url.split("/").pop()}`),
      (e) => check("delete test file", false, String(e)),
    );
  }
}

process.exit(failed ? 1 : 0);
