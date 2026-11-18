# Holding message and email signature

Defaults for two prompts managed in the admin console under **Prompts**
(`holding_message` and `email_signature` in the Turso `prompts` table). The
workflow reads the console versions (cached 30 s) and falls back to the
`HOLDING_MESSAGE` and `EMAIL_SIGNATURE` fields of the **📝 PROMPTS** node,
which hold this same text.

The customer receives the holding message when a conversation goes to a
human. Email replies get `Hi <first name>,` above it and the signature below
it; chat shows the holding message alone.

| Variable | Filled with |
|---|---|
| `{{first_name}}` | Customer first name, or `there` |
| `{{customer_name}}` | Customer full name, or `there` |
| `{{company_name}}` | Company name from Settings |
| `{{channel}}` | `email` or `chat` (holding message only) |

## HOLDING_MESSAGE

<!-- PROMPT:START HOLDING_MESSAGE -->
Thanks, {{first_name}}. A teammate from {{company_name}} will follow up shortly, usually within one business day. You do not need to send anything else.
<!-- PROMPT:END HOLDING_MESSAGE -->

## EMAIL_SIGNATURE

<!-- PROMPT:START EMAIL_SIGNATURE -->
Best regards,
The {{company_name}} support team
<!-- PROMPT:END EMAIL_SIGNATURE -->
