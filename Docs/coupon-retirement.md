# Coupon program retirement

The coupon program is permanently retired in code; there is no environment switch to re-enable it.

- No payment, purchase, store-visit, or referral coupons are issued.
- Registration and phone changes no longer claim or deliver historical coupons.
- Coupon and winner notifications are suppressed before template lookup or Telegram delivery.
- Coupon/prize controls are hidden; old buttons return the retirement notice in Uzbek/Russian.
- Promotions remain available for ordinary announcements, without coupon assignment controls.
- Historical coupon, referral, promotion, and dispatch records are retained. No coupon statuses are rewritten.
- The historical repair command supports read-only dry runs only; writes and notifications are rejected.

## API integration

Authenticated `POST /api/v1/coupons/` returns HTTP 410 with code `COUPON_PROGRAM_RETIRED` and message `The coupon program has ended.` No coupon payload validation or registration runs. The existing API authentication still applies. Upstream CRM automation must stop calling this endpoint and must treat 410 as permanent (do not retry).

## Deployment

For the Docker Compose deployment, rebuild and recreate only the bot service. Its entrypoint automatically runs `npm run db:migrate` before starting the application; no separate migration command is needed.

```sh
git pull --ff-only origin main &&
docker compose build bot &&
docker compose up -d --no-deps --force-recreate bot
docker compose ps bot
docker compose logs --tail=100 bot
```

 Migration `20260928090000_restore_payment_reminder_templates` creates only missing active Telegram templates for d2, d1, d0, overdue and paid-late notifications, in Uzbek and Russian. Existing active templates are preserved. It does not restore coupon templates. The new default texts are in the migration for review. Down migration deliberately retains these templates to preserve dispatch references.

The payment cron remains at its configured schedule (default 13:01 Asia/Tashkent) and sends ordinary payment reminders only. `PAYMENT_REWARD_TARGET_MONTH` no longer controls it. The current-month query window is retained for paid-late messages. Legacy reward counters in the run summary remain zero for compatibility.

After deployment, verify the API retirement response, customer/admin menus, old buttons, and the five active payment templates. At the next scheduled payment run, verify zero reward coupons/notifications and no coupon-template warnings. Do not manually execute a live payment run just to test retirement: it sends real reminders.

Review existing promotion copy and scheduled announcements for obsolete coupon promises. This code change does not edit operator-authored content or external CRM configuration.
