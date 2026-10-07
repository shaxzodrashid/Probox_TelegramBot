# Telegram website login

Implemented against [the store API contract](ExternalSystemWebhook.md). The website/store API creates `https://t.me/<bot_username>?start=auth_<login_id>` with a 32-character lowercase hexadecimal login ID. Phone-only links such as `auth_998901234567` are rejected; the phone link builder has been removed. The bot never creates website login IDs.

## Configuration

Set these variables in the bot server environment:

```dotenv
PROBOX_STORE_API_URL=https://store-api.probox.uz
PROBOX_LOGIN_SECRET=<shared secret>
```

The secret must exactly match the store API's `TELEGRAM_LOGIN_BOT_SECRET`. Generate it privately with `openssl rand -hex 32`; do not commit or print it. The bot requires an HTTPS origin without credentials, query parameters or a path. Missing configuration fails closed for website login and does not disable the rest of the bot. Docker Compose already loads the bot's `.env` through `env_file`; no Compose changes or bot database migrations are needed.

## Flow

1. `/start auth_<login_id>` exits active conversations, clears pending application/registration routing, and sends `POST /api/v1/webhooks/telegram-bot/login/open` with `login_id` and `telegram_user_id`.
2. Only after a successful `open` does the bot request contact sharing. That same message includes the masked phone, available device/browser and location details, and a warning to approve only a login the user initiated. Remote details are escaped for Telegram HTML. The keyboard offers contact sharing and **This isn't me**.
3. The bot checks that the attempt is unexpired and bound to the sender, `contact.user_id === ctx.from.id`, the contact is not forwarded, and its message date is no earlier than the attempt start. Start time is rounded down to Telegram's second precision. Typed phone numbers, missing owner IDs and other people's contacts never reach `confirm`.
4. A valid contact triggers `POST .../confirm`. The contact's phone number is sent unchanged; audit names, username and language come from `ctx.from`. The store API owns phone normalization and exact equality checks.
5. Only a validated `200` response with matching `login_id` and status `confirmed` or `completed` marks `telegramAuth` as `verified`, removes the keyboard and tells the user to return to the website.

The pending state uses the store API's `expires_at`, typically five minutes. Confirmation does not extend it. Existing bot registration is unnecessary, and website verification does not modify the bot's customer/SAP identity. Website sockets, completion, tokens and cookies remain the store API/frontend's responsibility.

## Cancellation and failures

- `/cancel` sends `decline` with `reason: "cancelled"`; **This isn't me** sends `reason: "not_me"`.
- A failed decline retains the refusal for retry. Subsequent contact messages retry the decline and cannot approve that attempt. A successful decline removes local state and the keyboard.
- A new auth link replaces the local attempt. Ordinary `/start` or the menu's `start` callback abandons it locally without calling `decline`; the store session expires on its own.
- All `4xx` action failures end the local attempt. Error messages are mapped by `location`, including phone mismatch, other account, expired link, already confirmed and declined.
- Network failures and `5xx` are retried at most three times with a 10-second timeout per request and 500ms/1000ms waits. After exhausted confirmation retries, pending state remains and the user can resend their contact. A failed `open` asks the user to reopen the link and never shows a contact request.
- Malformed success responses or responses for a different login ID cannot mark the user verified.

## Signing and state

Every request uses `X-Probox-Bot-Signature: t=<unix_seconds>,s=<hex HMAC-SHA256>`, calculated over `<timestamp>.<raw JSON body>`. JSON is serialized once and the exact string is sent on every retry, with a fresh timestamp/signature. Redirects are not followed. The store API checks its five-minute signature window and makes actions idempotent, so uncertain request delivery can be retried safely.

Redis-backed `ctx.session.telegramAuth` stores the login ID, Telegram ID, server expiry, pending masked request details or verified timestamp, and an outstanding refusal when needed. It does not store the shared contact phone. Expiry is checked on updates; expired data can remain until an update or the existing three-day Redis session TTL. Old persisted phone-only auth sessions are discarded.

Uzbek and Russian messages follow the bot's current locale. Raw auth starts, contacts and pending auth updates are excluded from verbose update logs; auth-start and pending auth messages are redacted in bot error notifications. The webhook client never logs secrets, signatures, full login IDs, phones or upstream response messages.

## Verification and rollout

```powershell
npm run test:telegram-login
npm run build
```

Local tests cover exact request bytes/signatures, bounded retries, terminal errors, malformed responses, contact ownership, request details, cancellation, refusal retries, legacy links and actual conversation middleware ordering. HTTP and Telegram delivery are mocked; they do not prove live deployment.

Deploy the bot with the two environment variables configured. Use the store API deployment/feature-flag instructions in [ExternalSystemWebhook.md](ExternalSystemWebhook.md). Before enabling `auth.telegram_bot_login`, run the documented staging browser-to-bot flow, mismatch, second-account, cancellation, expiry and duplicate-confirmation checks. No store API settings or feature flags are changed by this bot implementation.
