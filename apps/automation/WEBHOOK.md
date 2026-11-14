# Exposing the WhatsApp webhook

The webhook server is `src/http-server.ts`. It listens on `PORT` (default 3100)
and answers on `/webhooks/whatsapp` — a GET for Meta's verification handshake,
a POST for message and status callbacks.

Meta will only call an address that is public and HTTPS, which a laptop is not.
A Cloudflare tunnel is the shortest way to give it one.

## 1. Run the webhook server

```
cd apps/automation
pnpm webhook
```

It prints `[automation] webhook server listening on :3100`.

## 2. Open the tunnel

```
cloudflared tunnel --url http://localhost:3100
```

It prints a URL like `https://something-random.trycloudflare.com`.

**That address changes every time this command runs.** A quick tunnel is not
stable, so for anything past testing use a named tunnel on your own domain —
otherwise the webhook silently stops working the next time the tunnel restarts,
and nothing in the app will say so.

## 3. Point Meta at it

Meta app dashboard → WhatsApp → Configuration → Webhook → Edit:

- **Callback URL**: `https://<tunnel host>/webhooks/whatsapp`
- **Verify token**: the value of `WHATSAPP_WEBHOOK_VERIFY_TOKEN` in `.env`

Meta immediately sends a GET carrying `hub.challenge`; the server echoes it back
when the token matches and the dashboard marks the webhook verified.

Then **Manage** the fields and subscribe to:

- `messages` — inbound messages *and* delivery statuses (sent, delivered, read,
  failed). Both arrive on this one field; there is no separate status field to
  tick, and without it a campaign report never advances past "Sent".

## What the server does with each callback

| Callback | Effect |
|---|---|
| `statuses[]` | Updates `communication_message.status` by `provider_message_id` — this is what moves a campaign recipient from Sent to Delivered to Read. A failure is logged with Meta's own reason first, because the `status` column records *that* a send failed, never *why*. |
| `messages[]` | Stores the inbound message, creating a contact if the number is new (a Click-to-WhatsApp lead's first message looks exactly like a stranger's), and resumes any flow waiting on a reply. |

## Signature checking

`WHATSAPP_APP_SECRET` is set, so every POST is verified against the
`X-Hub-Signature-256` header and anything unsigned is rejected with a 401.
Without that variable the check is skipped entirely — fine on a laptop, not
fine on a public URL.

## Checking it works

Send a campaign of one to your own number, then watch the campaign report: it
polls every ten seconds while anything is in flight, so Delivered and Read fill
in on their own. If they never do, the webhook is not reaching the server —
check the tunnel's request log first, since Meta shows nothing useful about
callbacks it could not deliver.

---

# Lead intake: Meta Lead Ads, Google Ads, website forms

The same server (`pnpm webhook`, port 3100) also receives leads directly — no
third-party CRM in between. Every path ends in `ingestLead()`
(`packages/db/src/lead-intake.ts`), which:

- stores the submission in `lead_submission` (answers, form, campaign, ad set,
  ad, raw payload) — shown under **Lead forms** on the contact page;
- matches the person on phone, then email, or creates a `LEAD` contact;
- ignores a submission it has already seen (Meta `leadgen_id`, Google `lead_id`),
  so retries never message anyone twice;
- fires `LEAD_CAPTURED` when it created the contact (starts the nurture flow)
  and `LEAD_FORM_SUBMITTED` for every new submission.

| Endpoint | Provider |
|---|---|
| `GET/POST /webhooks/meta-leads` | Meta Page `leadgen` webhook |
| `POST /webhooks/google-leads` | Google Ads lead form webhook |
| `POST /webhooks/website-leads` | Our website / landing pages |

## Env vars (apps/automation/.env)

| Var | Needed for |
|---|---|
| `META_PAGE_ACCESS_TOKEN` | Reading leads. A long-lived Page token, or a system-user token with `leads_retrieval` + `pages_manage_metadata` + `pages_show_list` + `ads_management` |
| `META_PAGE_TOKENS` | Optional, several Pages: `{"<pageId>":"<token>"}` |
| `META_PAGE_IDS` | Optional, comma list of Page ids for `pnpm sync:meta-leads` |
| `META_APP_SECRET` | Signature check. Falls back to `WHATSAPP_APP_SECRET` (same app). **Required in production** |
| `META_LEADS_VERIFY_TOKEN` | Subscribe handshake. Falls back to `WHATSAPP_WEBHOOK_VERIFY_TOKEN` |
| `GOOGLE_LEADS_WEBHOOK_KEY` | The "Key" typed next to the webhook URL in the Google lead form. Endpoint refuses everything without it |
| `WEBSITE_LEAD_ORIGINS` | Comma list of sites allowed to post from a browser, e.g. `https://predictfit.in,https://www.predictfit.in`. Empty = any origin |
| `WEBSITE_LEAD_KEY` | Optional. Required on server-to-server posts (no `Origin`), as `X-Lead-Key` header |
| `EMAIL_FROM` | e.g. `Predict <care@predictfit.in>` — domain must be verified in Resend. Without it email only reaches the Resend account owner |
| `EMAIL_REPLY_TO` | Optional |

## Meta Lead Ads

1. The Meta app (the WhatsApp one is fine) needs **Webhooks** → object **Page**
   → subscribe field **leadgen**, callback `https://<host>/webhooks/meta-leads`,
   verify token = `META_LEADS_VERIFY_TOKEN`.
2. Subscribe the Page to the app (once per Page):
   `POST https://graph.facebook.com/v21.0/<PAGE_ID>/subscribed_apps?subscribed_fields=leadgen&access_token=<PAGE_TOKEN>`
3. Business Settings → Integrations → **Leads Access**: give this app (and the
   person/system user whose token is used) access. Without it the webhook
   arrives but the lead fetch fails with a permissions error.
4. For leads from real users the app needs **Advanced Access** for
   `leads_retrieval` (App Review). Admins/testers of the app work before that.
5. Test with the [Lead Ads Testing Tool](https://developers.facebook.com/tools/lead-ads-testing).

This does not affect any other CRM already subscribed to the Page — each app
gets its own copy of every lead.

Meta sends only the lead id; the server then reads the answers from the Graph
API. If that read fails (expired token, missing permission) the lead is
parked in `lead_submission` with `fetch_error` and nothing is lost:

```bash
pnpm sync:meta-leads              # retry parked leads + pull last 2 days from every form
pnpm sync:meta-leads --days 7 --dry-run
```

## Google Ads lead forms

In the lead form asset → **Lead delivery** → Webhook: URL
`https://<host>/webhooks/google-leads`, Key = `GOOGLE_LEADS_WEBHOOK_KEY`, then
**Send test data** (arrives with `is_test`, shown as "test").

A Google lead form holds **one** webhook URL. Pointing it here disconnects
whatever was there before (e.g. an agency CRM).

Google sends ids only for campaign / ad group / creative, not names.

## Website / landing pages

```js
await fetch("https://<host>/webhooks/website-leads", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    firstName, lastName, phone, email,     // or name
    formName: "Knee pain landing page",
    concern: "Knee pain",                  // any extra field is saved as an answer
    submissionId: crypto.randomUUID(),     // makes a double-click a no-op
    website: "",                           // honeypot: hidden input, leave empty
    ...utmParamsAndClickIds,               // utm_source/medium/campaign/content, gclid, fbclid
  }),
});
```

Phone or email is required. `application/x-www-form-urlencoded` works too, so a
plain `<form method="post">` can post straight to it. Limited to 10
submissions per minute per IP.

## Before real leads come in

- The nurture flow triggered by `LEAD_CAPTURED` must use **approved** WhatsApp
  templates. The seeded "Lead Nurture — TEST 1min delay" uses drafts and
  1-minute delays; replace it before switching ads over.
- If another system is also messaging these leads, decide which one sends the
  first WhatsApp, or every lead gets two.

---

# Lead routing, call statuses and per-topic messages

**Setup → Lead routing** (permission `ops.lead_routing`), checked on every new
lead before any event fires:

- **Clinics** — one assignment rule per clinic, with its city (e.g. Delhi,
  Kolkata), a role and optionally named people who take turns. A lead goes to
  the **nearest** clinic, located from (in order) the city on the form, its
  PIN code, its state, or a city named in the ad set. Where the person is
  beats which ad they clicked. Location unknown → the first rule. Distance is
  straight-line (`packages/db/src/india-geo.ts`): Bengaluru and Hyderabad are
  nearer Kolkata than Delhi. To override, add a rule without a clinic
  location whose keywords match (e.g. city contains `bangalore, hyderabad` →
  Delhi team) — those are checked first.
- **ICPs** — one per ICP: a name and a short code (`knee_pain`). Put the code
  in the ad set or ad name (`Delhi | knee_pain | video 3`) and leads map on
  their own. "Ads that sent leads" lists every ad with its ICP; unmapped ones
  can be mapped there in one click (adds the ad id to that ICP).

A lead that already has an owner or ICP keeps it.

**Who sees what.** `ops.leads` + `ops.leads_all` = every lead (all existing
roles got both, so nothing changed for them). `ops.leads` alone = only leads
assigned to that person, plus unclaimed leads in their role's pool — give a
telecaller role only `ops.leads`. Setting a status on a pool lead claims it.

**Call statuses** (contact page → Lead work): New, Contacted, No answer,
Callback later, Interested, Appointment booked, Visited, Not interested,
Invalid number, Duplicate, Lost. Booking an appointment sets "Appointment
booked" automatically. Each status fires its own trigger
`LEAD_STATUS_<STATUS>` (e.g. `LEAD_STATUS_NO_ANSWER`), plus
`LEAD_STATUS_CHANGED` for any change and `LEAD_ASSIGNED` on assignment.

**One message per ICP.** Name templates `<step>_general`,
`<step>_knee_pain`, `<step>_back_pain` … In a Send Communication node pick
"`<step>_…` (matched to the lead's interest)". A knee_pain lead gets the
knee version, anyone else `_general`. Templates whose variables are named
`name`, `firstName`, `city` or `interest` are filled automatically.

---

# AI replies

When a reply comes back and no flow branch and no keyword matches it, the AI
answers instead of leaving the person waiting. Set it up in **Setup → AI
replies** (permission `ops.ai_replies`; a superadmin always has it).

What it answers from: only the text in "What the clinic does, charges and when
it opens". Anything not written there it will not state — it hands over
instead. It never gives medical advice, never promises a result, and replies in
whatever language the person wrote in.

It stays quiet when: it is switched off, the person is marked do not contact,
a human replied in the last N minutes, the daily cap for that person is used
up, or WhatsApp's 24-hour window has closed. Every hand-over raises a task for
the lead's owner and fires `AI_HANDOFF_REQUESTED`; every reply fires
`AI_REPLY_SENT` and is marked "AI" in the Inbox.

Needs `OPENAI_API_KEY` or `GEMINI_API_KEY` in `apps/automation/.env` — the same
env the webhook server runs with. The page warns when the key for the chosen
provider is missing. Free Gemini keys allow only ~20 requests a day; a real
number of leads needs a paid key.

## The AI step inside a flow

The AI node in the flow builder uses the same clinic facts and safety rules —
a flow adds an instruction for its step, it cannot change what the assistant
may claim. Three modes:

- **Answer them on WhatsApp** — branches into *Answered* / *Needs a person*.
  The daily cap and the human-takeover pause still apply.
- **Sort their reply into branches** — you name the branches ("yes", "no",
  "asking something"); anything that fits none takes *Not clear*. Send that
  one to a task or a person, never nowhere.
- **Write text for a later step** — puts text in the run's context (e.g.
  `aiText`) for a Send Text node or a task note. Sends nothing itself.

---

# Automation settings, sweeps and opt-out

**Setup → Automation settings** (`ops.automation_settings`) holds the rules every
flow runs under, and shows whether the machinery is actually running.

**Quiet hours** (default 9pm–9am, Asia/Kolkata). A flow's message due inside the
window does not go out and is not skipped — the run parks itself and resumes at
the hour the window opens. A Send Communication node can opt out of this with
`ignoreQuietHours` for something genuinely time-critical. Replies to a person
who just messaged us are never held.

**The three sweeps** run every minute in the worker, each writing a marker
column so a check that runs 1,440 times a day acts once per lead:

| Sweep | Acts when | What it does |
|---|---|---|
| Callback | `callbackAt` has passed and status is Callback later | Task for the owner + `CALLBACK_DUE` |
| First response | Lead still New after `firstResponseMinutes` (default 15) | Task + `LEAD_UNWORKED` + email to the manager |
| Assignment notice | A lead was routed to a person | Emails them the lead |

The first-response sweep only looks at leads from the last 2 days, so switching
it on does not escalate the entire back catalogue at once.

**Opt-out.** "stop", "unsubscribe", "not interested", "band karo", "mat bhejo"
and similar now switch consent off for real — Do Not Contact plus the
preference row that `checkConsent()` reads — and fire `CONTACT_OPTED_OUT`.
Transactional messages about something the person asked for still go out. A
number we had never heard of whose first word is "stop" is kept as AUDIENCE,
never created as a lead for somebody to chase.

**Health.** The worker and webhook stamp `system_heartbeat` every tick; the
settings page goes red if either has not checked in for two minutes.
`GET /healthz` returns the database state too, so a load balancer sees 503
rather than a cheerful "ok" from a server that cannot reach the database.

---

# Multi-clinic

Everything belongs to a clinic: leads, patients, appointments, doctors' rotas,
money, flows, routing rules, AI settings and quiet hours. People see only the
clinics they work in (Setup → Clinics); a superadmin sees them all and is the
only one who can open a new one. The header switcher says which clinic the
screens are showing, and the clinic in a cookie is only ever honoured after
the membership is checked.

Roles are per clinic: the same person can be a telecaller at one and a manager
at another, on one login.

**WhatsApp numbers.** `clinic_channel` maps a number to a clinic:

- an inbound message finds its clinic by the `phone_number_id` it arrived on;
- a reply goes out from that person's clinic's number;
- a clinic with no number of its own uses the one marked group default — which
  is how two clinics share a single number today.

Register the number already in the environment with `pnpm seed:clinic-channel`,
then add more in Setup → Clinics. Tokens are never stored: a row names the env
var holding its token (blank = `WHATSAPP_ACCESS_TOKEN`), and the screen says
when that variable is missing on the server.

**Templates are approved per WhatsApp business account.** With two numbers the
same template can be live on one and pending on the other; `template_channel`
records that, and a send on a number where it is not approved is refused with
a reason instead of failing at Meta.
