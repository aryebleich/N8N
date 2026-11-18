# Holding messages (human escalation path)

Mirrors of the `HOLDING_EMAIL` and `HOLDING_CHAT` fields in the **📝 PROMPTS**
node of `workflows/support-dual-llm.json`. The customer receives one of
these when a conversation is handed to a human. The workflow uses the
node, not this file; keep the two in sync when you edit.

Placeholders filled by **🧑‍💼 Prepare Escalation**:

| Placeholder | Filled with |
|---|---|
| `[[GREETING]]` | `Hi <first name>,` or `Hi,` |
| `[[FIRST_NAME]]` | First name, or `there` |
| `[[COMPANY_NAME]]` | CONFIG → `COMPANY_NAME` |
| `[[SIGNATURE]]` | CONFIG → `SUPPORT_SIGNATURE` |

## HOLDING_EMAIL

<!-- PROMPT:START HOLDING_EMAIL -->
[[GREETING]]

Thanks for contacting [[COMPANY_NAME]]. A teammate will follow up shortly, usually within one business day. You don't need to send anything else, but you can reply to this email if you want to add details.

[[SIGNATURE]]
<!-- PROMPT:END HOLDING_EMAIL -->

## HOLDING_CHAT

<!-- PROMPT:START HOLDING_CHAT -->
Thanks, [[FIRST_NAME]]. A teammate will follow up shortly by email, usually within one business day.
<!-- PROMPT:END HOLDING_CHAT -->
