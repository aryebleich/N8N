# Support Assistant: admin panel

An easy control panel for your AI customer support assistant. The assistant (an
[n8n](https://n8n.io) workflow in [`n8n/`](n8n/README.md)) reads your support email and
website chat. **Claude** writes an answer from your own answers, **Gemini** double-checks
it, and the reply is sent automatically only when both are sure. Otherwise a person is asked.

This panel is where you, the owner, control all of that, without touching code.

> ⚠️ **There is no login.** Whoever can open the panel is the admin. That is deliberate,
> to make testing easy. To keep it safe, the panel only opens on the computer it runs on
> (`http://localhost:3000`). Read [7. Security](#7-security-read-this-before-putting-it-online)
> before you make it reachable from anywhere else.

---

## 1. What it does

| Page (left menu) | What you do there |
|---|---|
| 🏠 **Home** | A big **ON/OFF** switch for the assistant. Today's numbers in plain words. The 5 latest customers waiting for a person, each with an **Open** button. Quick actions. A status light for every connected service. |
| 💬 **Conversations** | Every email and chat, with a badge: **Answered automatically**, **Waiting for a person** or **Resolved**. Filter by channel and status, and search. Open one to see the whole thread, the assistant's answer and a plain-language **Why?**. Then: **Send this answer**, **Edit then send**, **Write my own reply**, or **Mark as done**. |
| 📖 **Answers (FAQ)** | The facts the assistant may use. Each one has a question, a reply, keywords and a **Use this answer** switch. A live preview shows how a customer sees it. **Import a spreadsheet** (CSV) with a downloadable template and a preview before anything is added. |
| 🎨 **Tone and Rules** | Friendly, Professional, Short and direct, or Custom. Your company name, email signature, chat greeting, and a checklist of **things the assistant must never do**. An advanced section shows the full instructions, with **Reset to recommended** and every earlier version restorable in one click. |
| ⚙️ **Settings** | The **Careful ↔ Confident** slider with a live note ("about 60% of questions would be answered automatically"), with optional separate email and chat levels. Weekly business hours with your "we are closed" message. An on/off switch per channel. Blocked senders and words. The Slack channel, with **Send a test message**. The chat widget code to copy. |
| 🧪 **Test Center** | Type a question (or pick one of 5 samples), choose Email or Chat, press **Ask the assistant**. See how sure each AI was, whether it would answer automatically or ask a person, why, what the customer would receive, and the response time (green check if under 10 seconds). **Test mode** is on by default: nothing is sent to real customers. |

Everywhere:

* Every setting has a one-sentence help text and a **What does this do?** button with an example.
* Every destructive or risky action asks **Are you sure?** and explains what will happen.
* After saving an answer, the tone or a setting, an **Undo** button stays for 10 seconds.
* The full history is kept: answers have a **History** button, and instructions have numbered versions.
* It works on a phone. The menu folds into the ☰ button.
* On the first visit, a 4-step wizard asks for your company name and business hours, offers 12 sample answers, and lets you send a test message.

**How it fits together**

```
 Customer email ─┐                                        ┌─▶ reply sent automatically
                 ├─▶ n8n workflow ─▶ Claude ─▶ Gemini ─▶ rules ┤
 Website chat ───┘        ▲  reads settings, tone, answers      └─▶ "ask a person" → Slack + this panel
                          │  (cached 30 s)
                   ┌──────┴─────────────────────────────┐
                   │  This admin panel  +  database     │  ◀── you
                   └────────────────────────────────────┘
```

The panel and n8n share one database (a local file to start, or a free
[Turso](https://turso.tech) database once n8n runs on another server). n8n calls the panel's
internal endpoints (`/api/internal/*`), protected by a shared secret, to send email replies
and to record conversations and requests for help.

---

## 2. Before you start

You need nothing for a first look: without any keys the panel runs with 12 sample answers
and an **offline simulator** in the Test Center. To make it answer real customers, collect
these. Tick each one off:

- [ ] **A computer to run it on** with **Node.js 24** ([nodejs.org](https://nodejs.org), the "LTS" button), or **Docker Desktop** ([docker.com](https://www.docker.com/products/docker-desktop/)).
- [ ] **A Claude key** from [console.anthropic.com](https://console.anthropic.com) → *API Keys*. It starts with `sk-ant-`.
- [ ] **A Gemini key** from [aistudio.google.com](https://aistudio.google.com) → *Get API key*. It starts with `AIza`.
- [ ] **Your support mailbox's SMTP details** (server, port, user name, password). Your email provider's help pages call this "SMTP settings". For Gmail, use an *App Password*.
- [ ] *Optional:* **a Slack app token** so your team is told when a person is needed. Create an app at [api.slack.com/apps](https://api.slack.com/apps), add the `chat:write` permission, install it, and copy the *Bot User OAuth Token* (starts with `xoxb-`).
- [ ] *Optional:* **Oracle** read-only access, if you want order lookups. Your IT person sets this up with [`n8n/oracle/ords-setup.sql`](n8n/oracle/ords-setup.sql).
- [ ] **n8n** to run the workflow itself (n8n Cloud, or your own). Setup is in [`n8n/README.md`](n8n/README.md).

---

## 3. Set it up in 5 minutes

**With Node.js**

```bash
git clone https://github.com/aryebleich/N8N.git support-panel
cd support-panel
cp .env.example .env            # Windows: copy .env.example .env
npx -y npm@11.6.2 install       # downloads what the panel needs (1–2 minutes)
npm run build
npm start
```

**With Docker**

```bash
git clone https://github.com/aryebleich/N8N.git support-panel
cd support-panel
cp .env.example .env
docker compose up -d --build
```

Then open **http://localhost:3000**. The wizard starts. The database tables and the sample
data are created automatically the first time; there is no separate step.

Now open `.env` in any text editor (Notepad, TextEdit), paste your keys after the `=` signs,
save, and restart (`Ctrl+C` then `npm start`, or `docker compose restart`). On **Home →
Connections** each service turns green. Finally connect n8n as described in
[`n8n/README.md`](n8n/README.md), using the same `INTERNAL_API_SECRET` and database.

For development: `npm run dev` (with automatic reload).

---

## 4. Every setting in `.env`, explained

Keys live **only** in `.env` on the server. They are never shown in the browser and never
typed into the page. The panel only shows "Connected" or "Not connected".

| Name | What to put there | Needed? |
|---|---|---|
| `ADMIN_PUBLIC` | `false` = the panel only opens on this computer. `true` = it opens from other computers too (see [Security](#7-security-read-this-before-putting-it-online)). | Leave `false` |
| `APP_URL` | The address you open the panel at, e.g. `http://localhost:3000`. Used in Slack links and the chat widget code. | Yes |
| `TURSO_DATABASE_URL` | Where data is kept. `file:./data/support.db` = a file on this computer. For a shared database: your Turso URL (`libsql://…`). | Yes (default works) |
| `TURSO_AUTH_TOKEN` | The Turso token. Leave empty for a file database. | With Turso |
| `INTERNAL_API_SECRET` | A long random password n8n sends with each call (`openssl rand -hex 32`). Put the same value in n8n. | For n8n |
| `N8N_CHAT_WEBHOOK_URL` | The *Production URL* of the n8n Chat Webhook node. Fills in the chat widget code. | For chat |
| `WIDGET_SCRIPT_URL` | Where `widget.js` is hosted. The default is this project's GitHub Pages copy. | No |
| `WIDGET_ALLOWED_ORIGINS` | Your website address(es), comma-separated, so the chat can load your greeting and your replies. | For chat |
| `ANTHROPIC_API_KEY` | Claude key (`sk-ant-…`). Without it the Test Center uses the simulator. | For real answers |
| `GOOGLE_AI_API_KEY` | Gemini key (`AIza…`). Without it the Test Center uses the simulator. | For real answers |
| `SLACK_BOT_TOKEN` | Slack bot token (`xoxb-…`). Pick the channel under Settings. | Optional |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD` | Your mailbox's outgoing mail server. Port 465 with `SMTP_SECURE=true`, or 587 with `false`. | For email replies |
| `SMTP_FROM` | The "From" address. Optional; otherwise the support address from Settings is used. | No |
| `ORACLE_ORDS_URL`, `ORACLE_ORDS_USER`, `ORACLE_ORDS_PASSWORD` | Read-only Oracle REST access, for the status light. n8n uses its own copy for lookups. | Optional |
| `BIND_HOST`, `PORT` | Advanced: the network address and port the server listens on (default `127.0.0.1`, `3000`). | No |

---

## 5. The confidence level, with examples

Claude writes each answer and says how sure it is. Gemini checks it and says how sure *it*
is. The assistant only replies by itself when **both** are at least as sure as your
confidence level, Gemini agrees, and no safety rule says otherwise.

| Slider | Level | Who it suits | What happens |
|---|---|---|---|
| All the way to **Careful** | 95% | Starting out, sensitive businesses | Only questions your answers cover word for word are answered. Most go to you. |
| **Balanced** (default) | 80% | Most shops | "How long does shipping take?" → answered. "Can I get 10% off 40 kettles?" → asks you. |
| **Fairly confident** | 70% | Busy shops with good answers | Small variations of your answers are answered too. |
| All the way to **Confident** | 55% | Only with many, detailed answers | Answers most things your answers touch on. Check Conversations often. |

The note under the slider estimates how many questions would be answered automatically.
For the first days it is a typical estimate; once real messages arrive it is calculated
from your own last 300 messages. You can give email and chat different levels (for example
Careful for email, Balanced for chat).

Whatever the level, a person is **always** asked when: the assistant is switched off; the
channel is switched off; it is outside business hours (if turned on); the message contains a
blocked word; or the draft contains something risky (a card number, another person's email
address, account details for an unverified customer).

---

## 6. Changing answers and tone without code

**Answers (FAQ)**

1. Go to **Answers (FAQ)** → **Add an answer**.
2. *Question*: how a customer would ask it. *Reply*: the facts, including times, prices and conditions. The assistant never promises anything that is not written here.
3. *Keywords* (optional): other words customers use, such as "delivery" for shipping.
4. Watch the live preview, then **Save answer**. Changed your mind? Click **Undo** within 10 seconds, or use **History** later.
5. Switch **Use this answer** off to pause an answer without deleting it.

To add many at once: **Import a spreadsheet** → **Download the template** → fill it in with
Excel, Google Sheets or Numbers → *Save as / Download* → **CSV** → **Choose a CSV file**. You
see a preview with any problems in red before anything is added. Questions you already have
are skipped. The template is also in [`docs/sample-faq.csv`](docs/sample-faq.csv).

**Tone and Rules**

1. Pick **Friendly**, **Professional**, **Short and direct** or **Custom**. Each shows an example.
2. Check your company name, email signature, chat greeting and the message customers get when a person needs to help.
3. Tick the **things the assistant must never do**, and add your own, one per line.
4. **Save tone and rules**. Changes reach the assistant within a minute.

The **Advanced** section shows the exact instructions Claude receives. You may edit them;
the panel then stops rebuilding them from your tone choices until you press **Reset to
recommended**. Every version is kept under **Earlier versions**, restorable in one click.

**Then test it**: open the **Test Center**, ask the questions customers really ask, and check
the confidence scores and the reply.

---

## 7. Security: read this before putting it online

There is **no login, no password and no access token** for the admin area. Anyone who can
open the panel can read every conversation, change every setting and send replies to customers.

That is why, by default:

* The server only listens on `127.0.0.1` (this computer). The Docker setup publishes the port on `127.0.0.1` only.
* Even if a request reaches it, the panel refuses any address other than `localhost`, `127.0.0.1` or `[::1]` (this also blocks "DNS rebinding" tricks).
* Changes are only accepted from the panel's own pages (same-origin check), so another website cannot flip your settings in the background.
* Keys stay in `.env` on the server and are never sent to the browser.
* Only these are reachable from outside: `/api/internal/*` for n8n (needs `INTERNAL_API_SECRET`), `/api/public/*` for the chat widget (greeting and your chat replies, by unguessable conversation id), and `/api/health`.

**To use it from other computers**, first put your own login in front of it: a VPN or
Tailscale, Cloudflare Access, your host's password protection (on Vercel: *Deployment
Protection*), or a reverse proxy with a password. Only then set the single switch
`ADMIN_PUBLIC=true` in `.env` and restart. On Vercel the panel answers "only opens on this
computer" until you do both.

Also: keep `.env` private (it is in `.gitignore`), use a long random `INTERNAL_API_SECRET`,
give the Slack app only `chat:write`, and use the **read-only** Oracle user. Everything you
change is written to an append-only `audit_log` table.

---

## 8. Troubleshooting

| What you see | What to do |
|---|---|
| "This admin panel only opens on this computer" | You opened it by a name other than `localhost`. Use `http://localhost:3000`, or see [Security](#7-security-read-this-before-putting-it-online). |
| The page does not open at all | Is the server window still running? Restart with `npm start` (or `docker compose up -d`). Another program on port 3000? Set `PORT=3001` in `.env`. |
| `npm install` fails with `edgesOut` | Use the exact command `npx -y npm@11.6.2 install` (older npm versions have a bug). |
| A light is red, "Not connected" | The key for that service is not in `.env`, or the panel was not restarted after you added it. |
| A light is yellow, "Check needed" | The key is there but the service refused it. Copy the key again (no spaces), check the model name under Settings → Advanced, then **Check again**. |
| Test Center says "Offline simulator" | Add `ANTHROPIC_API_KEY` and `GOOGLE_AI_API_KEY` to `.env` and restart. |
| Every test asks a person | Is the assistant ON (Home)? Is the channel on? Outside business hours? Does the message contain a blocked word? The **Why** line says which. Otherwise, add an answer or move the slider toward Confident. |
| "Send a test message" fails in Slack | Invite the bot into the channel (`/invite @yourbot`), check that the channel name is right, and that the app has `chat:write`. |
| "The email could not be sent" | Check the SMTP settings in `.env`. Gmail needs an App Password, not your normal password. |
| n8n light stays yellow | n8n has not called the panel yet. Check that n8n uses the same `INTERNAL_API_SECRET` and the panel's address, then send a test email. |
| Changes do not reach the assistant | n8n caches settings for 30 seconds. Wait a minute, and check n8n uses the same database. |
| I want to start over | Stop the panel and delete the `data` folder (or the Docker volume `panel-data`). The next start creates fresh tables and sample data. |

---

## 9. Owner test checklist

Do these once after setup (they are also automated in `tests/e2e/owner-checklist.spec.ts`):

1. ☐ Open `http://localhost:3000`. The wizard appears. Finish all 4 steps. You land on **Home** with your company name.
2. ☐ Click the big switch. You are asked "Are you sure?". Confirm: it turns red (OFF). Click again: green (ON).
3. ☐ **Answers** → **Add an answer**, fill it in, watch the preview, save. Click **Undo**. It disappears.
4. ☐ **Import a spreadsheet** with one good and one empty row. The preview shows 1 ready and 1 problem. Import.
5. ☐ **Settings**: move the confidence slider. The "about …% answered automatically" note changes. Save.
6. ☐ **Tone and Rules**: choose Professional, save, click **Undo**. Friendly is back and a new version is listed.
7. ☐ **Test Center**: the green banner says "Test mode: nothing is sent to real customers." Pick the "lawyer" sample. The result is "ask a person" because of a blocked word, and the response time has a green check. Switch on Live mode: you are asked to confirm.
8. ☐ When n8n hands over a conversation, it appears on Home under "Waiting for a person". Open it, read **Why?**, write a reply and send it. It moves to **Resolved**.
9. ☐ Open the panel on your phone (on the same computer: shrink the browser window). The menu folds into ☰.
10. ☐ On **Home → Connections**, every service you set up is green. No key is shown anywhere.

---

## 10. Five-minute video script

| Time | On screen | Say |
|---|---|---|
| 0:00 | Home page | "This is the control panel for our support assistant. It answers customer emails and chats by itself when it is sure, and asks us when it isn't." |
| 0:20 | Big ON/OFF switch | "This switch turns the whole assistant on or off. Off means every message waits for us. It asks before turning off." |
| 0:40 | Today box, Waiting list | "Here are today's numbers in plain words, and the latest customers waiting for a person. One click on Open takes me to them." |
| 1:00 | Conversation detail | "Here's the customer's message, what the assistant would have said, and why it asked me: it wasn't sure enough. I can send its answer, edit it, write my own, or mark it as done." |
| 1:40 | Answers page | "The assistant only uses the answers written here. I'll add one: question, reply, a few keywords, and the preview shows how customers see it. Save, and Undo if I change my mind." |
| 2:20 | Import dialog | "For many answers at once, I download the template, fill it in in Excel and import it. I see a preview first." |
| 2:45 | Tone and Rules | "Here I pick how it sounds: friendly, professional or short, plus my signature and the things it must never do, like promising refunds." |
| 3:20 | Settings slider | "This slider is the important one. Careful means it asks us more often; Confident means it answers more by itself. The note tells me what share it would answer." |
| 3:50 | Business hours, blocked words, Slack | "Our opening hours and the closed message, words that always go to a person, and the Slack channel where the team gets alerts. Send a test message to check." |
| 4:20 | Test Center | "Before going live, I test here. Nothing is sent to customers. I ask a question and see how sure each AI is, whether it would answer, and why, in under ten seconds." |
| 4:50 | Home → Connections | "Finally, these lights show what's connected. The keys stay safely on the server, never in the browser. That's it!" |

---

## Project layout

```
app/                    Next.js pages: Home, conversations, answers, tone, settings, test, wizard
app/api/                Panel API (same-origin only), api/internal/* (n8n, shared secret), api/public/* (chat widget)
components/             Sidebar, help tooltips, confirm dialogs, tags input, status lights, ui/ (shadcn-style)
lib/db.ts               Database client (Turso / libSQL / local file)
lib/settings.ts         Settings read/write with audit entries; lib/settings-schema.ts has every setting
lib/assistant.ts        Test Center: real Claude + Gemini, or the offline simulator
lib/policy.ts           The decision rules (same as the n8n Policy Guard)
lib/validators.ts       Input validation for every route (zod)
lib/ingest.ts           What n8n sends: conversations, email delivery, Slack alerts, idempotency
migrations/             001_core.sql, 002_faq_prompts.sql, 003_conversations.sql
seeds/sample-data.sql   Default settings, tone and 12 sample answers (loaded on first start)
docs/sample-faq.csv     The spreadsheet template
tests/unit, tests/e2e   Vitest and Playwright (owner checklist)
n8n/                    The n8n workflows, prompts, Oracle and Turso SQL, chat widget
```

Commands: `npm run dev`, `npm run build`, `npm start`, `npm test`, `npm run test:e2e` (after
a build), `npm run typecheck`, `npm run migrate` (create tables now, e.g. on Turso),
`npm run seed:generate` (rebuild `seeds/` and `docs/` from `lib/` defaults).

GitHub Actions: **CI** (typecheck, unit tests, build, browser tests, workflow JSON check) on
every push; **Deploy Admin Panel** (Docker image to GHCR; Turso migrations and Vercel when their
secrets are set); **Deploy n8n workflows**; **Pages** (the chat widget). See
[`n8n/README.md`](n8n/README.md) for the workflow side.

## License

[MIT](LICENSE)
