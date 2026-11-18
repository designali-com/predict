import "dotenv/config";
import { db } from "@workspace/db/client";
import { communicationTemplate } from "@workspace/db/schema";
import { eq } from "@workspace/db";

// Standalone preflight for the WhatsApp integration: proves the credentials
// in .env are live and that every whatsapp template the flows can send is
// actually approved on the WABA. Run with `pnpm check:whatsapp` before
// blaming the engine for messages that never arrive.

const GRAPH = "https://graph.facebook.com/v21.0";

const token = process.env.WHATSAPP_ACCESS_TOKEN;
const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
const wabaId = process.env.WHATSAPP_WABA_ID;

let failures = 0;

function ok(label: string, detail = "") {
  console.log(`  ok    ${label}${detail ? ` — ${detail}` : ""}`);
}
function bad(label: string, detail = "") {
  failures++;
  console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
}
function warn(label: string, detail = "") {
  console.log(`  warn  ${label}${detail ? ` — ${detail}` : ""}`);
}

async function graph(path: string): Promise<{ ok: boolean; data: any }> {
  const res = await fetch(`${GRAPH}/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => null);
  return { ok: res.ok, data };
}

async function main() {
  console.log("\nenv");
  if (!token) bad("WHATSAPP_ACCESS_TOKEN not set");
  else ok("WHATSAPP_ACCESS_TOKEN set", `${token.slice(0, 12)}… (${token.length} chars)`);
  if (!phoneNumberId) bad("WHATSAPP_PHONE_NUMBER_ID not set");
  else ok("WHATSAPP_PHONE_NUMBER_ID set", phoneNumberId);
  if (!wabaId) bad("WHATSAPP_WABA_ID not set — template submission will be skipped");
  else ok("WHATSAPP_WABA_ID set", wabaId);
  if (!process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN)
    warn("WHATSAPP_WEBHOOK_VERIFY_TOKEN not set — Meta can't verify the webhook subscription");
  if (!process.env.WHATSAPP_APP_SECRET)
    warn("WHATSAPP_APP_SECRET not set — inbound webhook signatures are NOT verified");

  if (!token || !phoneNumberId || !wabaId) {
    console.log("\nSkipping live API checks — fill the missing vars above first.\n");
    process.exit(1);
  }

  console.log("\ntoken");
  // Expiring tokens have been the single biggest source of "why did the
  // automation stop" here — the API Setup tab hands out ones that die within
  // a day. Prove up front that this one is a System User token with no expiry.
  const appId = process.env.WHATSAPP_APP_ID;
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appId || !appSecret) {
    warn("WHATSAPP_APP_ID / WHATSAPP_APP_SECRET not set — cannot inspect token expiry");
  } else {
    const debug = await graph(
      `debug_token?input_token=${token}&access_token=${encodeURIComponent(`${appId}|${appSecret}`)}`,
    );
    const info = debug.data?.data;
    if (!debug.ok || !info) {
      warn("could not inspect token", debug.data?.error?.message ?? "unknown error");
    } else if (!info.is_valid) {
      bad("token is not valid");
    } else {
      const expiresAt: number = info.expires_at ?? 0;
      if (expiresAt === 0) ok("never expires", `type ${info.type}`);
      else
        bad(
          "token expires",
          `${new Date(expiresAt * 1000).toISOString()} — generate a System User token instead`,
        );

      const scopes: string[] = info.scopes ?? [];
      for (const needed of ["whatsapp_business_messaging", "whatsapp_business_management"]) {
        if (scopes.includes(needed)) ok(`scope ${needed}`);
        else bad(`scope ${needed} missing`);
      }
    }
  }

  console.log("\ncredentials");
  const phone = await graph(
    `${phoneNumberId}?fields=display_phone_number,verified_name,quality_rating,code_verification_status,status,platform_type`,
  );
  if (!phone.ok) {
    bad("phone number lookup", phone.data?.error?.message ?? "unknown error");
  } else {
    ok(
      "phone number reachable",
      `${phone.data.display_phone_number} "${phone.data.verified_name}" quality=${phone.data.quality_rating}`,
    );

    // A number can pass OTP verification and still not be registered on the
    // Cloud API. Until it is, status stays PENDING, platform_type reads
    // NOT_APPLICABLE, and the number simply isn't on WhatsApp — customers
    // see "Invite" and every send fails. Easy to miss, so check it loudly.
    if (phone.data.status === "CONNECTED") {
      ok("number registered on the Cloud API", `platform ${phone.data.platform_type}`);
    } else {
      bad(
        `number not registered — status ${phone.data.status}`,
        "POST /{phone-number-id}/register with your 6-digit two-step PIN, " +
          "or finish onboarding in WhatsApp Manager. Until then nobody can message it.",
      );
    }
  }

  const waba = await graph(`${wabaId}?fields=id,name,timezone_id`);
  if (!waba.ok) bad("WABA lookup", waba.data?.error?.message ?? "unknown error");
  else ok("WABA reachable", waba.data.name ?? waba.data.id);

  // The one check that explains "the API returned a message id but nothing
  // arrived". A send can be accepted (200 + wamid) and then dropped because
  // billing is broken or the app isn't subscribed — health_status is where
  // Meta actually says so, and without webhooks it is the only place we see it.
  const health = await graph(`${wabaId}?fields=health_status`);
  const entities = health.data?.health_status?.entities ?? [];
  if (!health.ok || entities.length === 0) {
    warn("could not read health_status", health.data?.error?.message ?? "no entities returned");
  } else {
    for (const entity of entities) {
      const label = `${entity.entity_type} can_send_message`;
      if (entity.can_send_message === "AVAILABLE") {
        ok(label, entity.can_send_message);
      } else {
        const reason = (entity.errors ?? [])
          .map((e: { error_code?: number; error_description?: string }) =>
            `[${e.error_code}] ${e.error_description}`,
          )
          .join("; ");
        bad(label, `${entity.can_send_message}${reason ? ` — ${reason}` : ""}`);
      }
      for (const info of entity.additional_info ?? []) warn(entity.entity_type, info);
    }
  }

  if (!phone.ok || !waba.ok) {
    console.log(
      "\nToken looks dead or lacks whatsapp_business_messaging / whatsapp_business_management.\n" +
        "Generate a permanent System User token in Meta Business Settings — the\n" +
        "24-hour token from the app dashboard's API Setup tab expires overnight.\n",
    );
    process.exit(1);
  }

  console.log("\ntemplates approved on the WABA");
  const remote = await graph(`${wabaId}/message_templates?limit=200&fields=name,status,language,category`);
  const approved = new Map<string, string>();
  if (!remote.ok) {
    bad("could not list templates", remote.data?.error?.message ?? "unknown error");
  } else {
    for (const t of remote.data.data ?? []) approved.set(t.name, t.status);
    if (approved.size === 0) warn("the WABA has no templates at all");
    for (const [name, status] of approved) {
      if (status === "APPROVED") ok(name, status);
      else warn(name, status);
    }
  }

  console.log("\nDB templates on the whatsapp channel");
  const rows = await db
    .select()
    .from(communicationTemplate)
    .where(eq(communicationTemplate.channel, "whatsapp"));
  for (const row of rows) {
    if (!row.providerTemplateName) {
      bad(row.key, "no providerTemplateName — sendCommunication will fail for this key");
      continue;
    }
    const status = approved.get(row.providerTemplateName);
    if (!status) bad(row.key, `"${row.providerTemplateName}" does not exist on the WABA`);
    else if (status !== "APPROVED") bad(row.key, `"${row.providerTemplateName}" is ${status}`);
    else ok(row.key, `→ ${row.providerTemplateName} APPROVED`);
  }

  console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} check(s) failed.\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
