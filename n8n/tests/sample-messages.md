# Sample messages and acceptance tests

Use these after setup to confirm the workflow behaves as designed. They
assume the demo data that `oracle/ords-setup.sql` creates when your schema
has no `CUSTOMERS` table, and the FAQ rows from `turso/seed-faq.sql`.

| Who | Email | Oracle account |
|---|---|---|
| Ada Okafor | `ada.okafor@example.com` | `C-10042`, plan `plus`, last order `NW-58211` shipped via UPS |
| Marcus Lind | `marcus.lind@example.com` | `C-10077`, plan `standard`, order `NW-58390` processing |
| Anyone else | e.g. `sam@example.org` | no account |

Replace the demo emails with mailboxes you can receive at if you want to
see the email replies yourself (update the demo rows in Oracle to match).

## Preparation

1. Create a session token for Ada (simulates your website login) in Turso:

   ```sql
   INSERT INTO session_tokens (token, customer_email, oracle_customer_id, expires_at)
   VALUES ('tok_ada_demo_7f3c2a91b8e44d0f', 'ada.okafor@example.com', 'C-10042', '2099-01-01T00:00:00.000Z');
   ```

2. Open the demo page (`chat-widget/index.html` on GitHub Pages), paste your
   production webhook URL and click **Save and reload**.
3. Keep the Slack channel set in the console (Settings → Slack channel ID) open.

Useful queries while testing (`turso db shell <db>`):

```sql
SELECT conversation_id, role, substr(body, 1, 80), created_at FROM messages ORDER BY id DESC LIMIT 10;
SELECT id, channel, claude_confidence, gemini_confidence, substr(reason, 1, 100), slack_ts, status
  FROM escalations ORDER BY id DESC LIMIT 5;
```

---

## Five sample messages

### 1. FAQ · chat · "How long does shipping take?"

- **Send:** chat widget, any name and email, not signed in.
- **Expected:** auto-answer within 10 seconds that standard shipping is 3 to 5
  business days and express 1 to 2, formatted Markdown. Response `status` is
  `answered`. Two new rows in `messages` (`customer`, `assistant`). No
  escalation.

### 2. FAQ · email · "Return policy"

- **Send:** email to the support inbox from any address.
  Subject: `Returning a mug`. Body: `Hi, what is your return policy? I bought a mug set last week.`
- **Expected:** reply from `SUPPORT_FROM_EMAIL` with subject
  `Re: Returning a mug`, greeting with the sender's first name, the 30-day
  policy, the signature from CONFIG and the original message quoted below.
  Both messages in Turso. No escalation.

### 3. FAQ · chat · "I forgot my password"

- **Send:** chat widget, not signed in.
- **Expected:** auto-answer pointing to **Sign in → Forgot password** and the
  30-minute link validity. Stored in `messages`.

### 4. Escalation · email · unusual product question

- **Send:** email from `ada.okafor@example.com`.
  Subject: `Kettle on induction?`. Body:
  `Can I use the stovetop kettle on a commercial induction range rated 3500 W? My colleague bob@contoso.com asked too.`
- **Expected:** not in the FAQ, so Claude sets `needs_human` and/or both
  confidences fall below the threshold. Ada gets the holding email ("A
  teammate will follow up shortly"). A new `escalations` row with
  `status = 'open'` and both confidence scores. Slack shows Ada's verified
  email in full, but `b***@c***.com` for the colleague. `slack_ts` is filled.

### 5. Escalation · chat · legal threat

- **Send:** chat widget, not signed in: `This is the third broken kettle. Refund me twice the price or I am filing a chargeback and calling my lawyer.`
- **Expected:** both models flag it for a human (refund outside policy,
  chargeback, legal threat). The widget shows the holding message; an
  `escalations` row and a Slack alert with the masked email appear.

---

## Acceptance tests A to E

### TEST A · escalation, email (account holder, question not in FAQ)

Use sample message 4.

| Check | Expected |
|---|---|
| Decision | Human path: Claude `needs_human = true` or confidence < `CONFIDENCE_THRESHOLD`; Gemini disagrees or flags |
| Turso | New `escalations` row: `channel = 'email'`, both confidences, `gemini_issues` JSON array, `claude_draft`, `status = 'open'` |
| Slack | Message in the console's Slack channel with channel, masked customer info, original message, Claude draft, both scores, Gemini issues, reason, timestamp |
| slack_ts | The same row's `slack_ts` equals the Slack message timestamp |
| Customer | Holding email received, subject `Re: Kettle on induction?` |

### TEST B · FAQ, chat

Use sample message 1.

| Check | Expected |
|---|---|
| Latency | Reply in under 10 seconds |
| Format | Clean Markdown (bold, lists) rendered by the widget |
| Turso | `messages` has the customer and assistant rows for the conversation id the widget stored |

### TEST C · account, verified (chat with session token)

1. On the demo page, **Simulate a signed-in customer** with token
   `tok_ada_demo_7f3c2a91b8e44d0f` and email `ada.okafor@example.com`.
2. Ask `Where is my last order?`

| Check | Expected |
|---|---|
| Reply | Mentions order `NW-58211`, status `shipped`, UPS tracking number |
| Privacy | No card number, expiry, `card_last4`, payment token or billing address anywhere in the reply (the ORDS views never return them; `🧩 Attach Account Data` also scrubs them) |
| Response | `signedIn: true` and the same `sessionToken` echoed |

### TEST D · account, unverified (email from an address with no account)

Send from an address that has no Oracle account (e.g. `sam@example.org`).
Subject: `Where is my order?`. Body: `Hi, where is my last order? My friend Ada ordered from the same address.`

| Check | Expected |
|---|---|
| Oracle | One lookup, for the sender's own address only; ORDS answers 404 |
| Reply | General tracking guidance and a note to write from the account email or sign in. No order numbers, no statuses, no confirmation that any other account exists |
| Data | `account_lookup = "not_found"` in the execution; CUSTOMER_CONTEXT shows `customer: null` |

### TEST E · Oracle down

Simulate an ORDS outage, for example by setting `ORACLE_ORDS_BASE_URL` in
CONFIG to a non-routable address such as `https://10.255.255.1/ords/support_ro`
(times out after `ORACLE_LOOKUP_TIMEOUT_MS`), then save the workflow.

1. Signed in as Ada (token from TEST C), ask `How long does shipping take?`
2. Ask `Where is my last order?`

| Check | Expected |
|---|---|
| FAQ question | Answered automatically within 10 seconds; execution shows `account_lookup = "unavailable"` and `identity.check = "failed"` |
| Order question | Escalated: Policy Guard reason "Identity check could not complete … asked about their account"; holding reply in the widget; Slack alert |
| Restore | Put the real ORDS URL back in CONFIG afterwards |

---

## What was verified before publishing

The workflow was imported into n8n 2.46.6 and run end to end together with the
Support Console (production build) against local stand-ins for the external
services: one SQLite database shared by the console and a Turso-compatible
`/v2/pipeline` endpoint, mock ORDS, mock Anthropic and Gemini endpoints
returning API-shaped responses, a mock Slack API (error workflow) and a local
SMTP server. These passed:

- Chat FAQ auto-answered in under a second (against mocks) and recorded in the
  console with both confidence scores.
- Email FAQ sent by the console over SMTP as `Re: <subject>` with
  `In-Reply-To` and `References` headers.
- Verified chat order question answered with Oracle order status; payment
  fields never reached the model.
- Unusual email escalated with reason `unusual_question`, an SLA and a holding
  email in the same thread.
- A FAQ edit made in Turso reached Claude on the next message.
- Console settings applied after the 30-second cache: email kill switch
  (reason `kill_switch`), blocked keyword (`blocked_keyword`, high priority),
  blocked sender (chat 403).
- Console down: the chat customer still got the answer and the error workflow
  wrote a high-priority `system_error` escalation and a Slack alert.
- Expired or mismatched session tokens, malformed Claude JSON, a 529 followed
  by a successful retry, invalid chat input, auto-reply loop protection, a batch
  of four emails in one execution, and CORS preflight (earlier run).

Not verified against the real services: live Claude and Gemini output quality,
real ORDS on Autonomous Database, real Turso, Slack, IMAP and SMTP providers.
Run tests A to E above after setup.
