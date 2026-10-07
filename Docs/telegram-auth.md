# Telegram contact verification

Open `https://t.me/<bot_username>?start=auth_998901234567`. Use the full international phone number as digits, including the country code, without `+`, spaces, or punctuation. The reserved `auth_` prefix keeps this flow separate from campaign links. `buildTelegramAuthDeepLink(botUsername, phone)` in `src/utils/telegram/telegram-auth.util.ts` generates the link from an international phone number.

Telegram allows letters, digits, underscores and hyphens in start payloads, up to 64 characters ([documentation](https://core.telegram.org/bots/features#deep-linking)). The generated phone payload stays within this limit.

The bot immediately requests the user's contact through a reply-keyboard button in a private chat. Existing bot registration is unnecessary. Starting verification exits any active conversation and clears its pending application/registration routing. A new auth link replaces the previous attempt. Ordinary `/start` or the menu's `start` callback clears auth state and resumes the normal start flow; `/cancel` cancels a pending verification.

Verification requires all of these checks:

- An unexpired pending attempt bound to the sender's Telegram ID.
- A contact message, with `contact.user_id` present and equal to `ctx.from.id`.
- A non-forwarded contact sent no earlier than the attempt's start time.
- An exact full-number match after removing `+` and formatting spaces/parentheses/hyphens. Country codes are never inferred and suffixes are never compared.

Typed phone numbers, contacts without a Telegram ID, other people's contacts, forwarded contacts, invalid phone numbers and mismatched numbers cannot complete verification. The user can retry without leaving the flow. Requests expire after 10 minutes.

On success, the keyboard is removed and `ctx.session.telegramAuth` becomes `{ status: 'verified', telegram_id, phone_number, verified_at, expires_at }`. Timestamps are Unix milliseconds. This state uses the existing Redis session storage and is valid for 10 minutes after verification; expiry is checked on updates. Redis session TTL is 3 days, so expired data may remain stored until the next update or session eviction. Repeated contact messages cannot trigger verification again.

This version only verifies contact ownership and phone equality. It sends no webhook, creates no external login/session, and does not change bot registration, customer records, or SAP identity. The verified state is a future integration point, not a webhook delivery queue. When the external API contract is available, add request correlation, delivery/authentication and replay handling according to that contract; a phone-only link currently does not identify an external login attempt.

Messages are available in Uzbek and Russian using the bot's current locale. Raw auth-start and contact updates are excluded from verbose update logging.

Local verification:

```powershell
node --require ts-node/register --test src/utils/telegram/telegram-auth.util.spec.ts src/middlewares/telegram-auth.middleware.spec.ts
npm run build
```
