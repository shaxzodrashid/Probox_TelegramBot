# Telegram bot orqali saytga kirish: bot ↔ store-api kontrakti

**Sana:** 2026-10-07 · **Kimga:** Probox Telegram bot (`Probox_TelegramBot`, grammy) · **Asos:** botchining `telegram-auth.md` (contact verification) · **Sayt ishi:** [MARKETPLACE_TELEGRAM_BOT_LOGIN_FRONTEND_GUIDE.md](MARKETPLACE_TELEGRAM_BOT_LOGIN_FRONTEND_GUIDE.md) · **Ilova ishi:** [APP_TELEGRAM_BOT_LOGIN_GUIDE.md](APP_TELEGRAM_BOT_LOGIN_GUIDE.md)

> **Yangilanish 2026-10-15 — mobil ilova.** Shu oqimdan endi Probox mobil ilovasi
> ham foydalanadi. `open` javobida yangi maydon bor: **`source: "web" | "app"`** —
> kirish saytdan yoki ilovadan boshlangani (5.1). Botdagi «Probox saytiga kirish»,
> «Saytga qayting» kabi matnlar ilova foydalanuvchisi uchun shu maydon bo'yicha
> almashtiriladi (**6a-bo'lim**). Maydon qo'shimcha: hozirgi bot uni e'tiborsiz
> qoldiradi, hech narsa buzilmaydi. So'rovlar, imzo va boshqa javoblar o'zgarmagan.

Saytda SMS kodi kelmasa, mijoz "Telegram orqali olish" ni bosib botga o'tadi.
Botdagi contact verification uning raqamini tasdiqlaydi va natijani
store-api'ga yuboradi. Sayt buni socket orqali bilib, kod kiritmasdan tizimga
kiradi. Bu pullik Telegram Gateway (`/auth/otp/resend-telegram`) o'rnini bosadi.

Sizning `telegram-auth.md` dagi tekshiruvlaringiz deyarli to'liq qoladi.
Hujjatda yozganingizdek, oqimga faqat **so'rov korrelyatsiyasi, yetkazish va
replay himoyasi** qo'shiladi. Ular quyida.

---

## 0. Hozirgi oqimingiz → integratsiyada

| `telegram-auth.md` da | Integratsiyada |
|---|---|
| `start=auth_998901234567` (havolada telefon) | **`start=auth_<login_id>`**, `login_id` 32 ta kichik hex. Prefiks o'sha `auth_`. Havolani store-api yaratadi, `buildTelegramAuthDeepLink` kerak emas |
| kutilayotgan raqam havoladan olinadi | raqam havolada **yo'q**. `open` niqoblangan raqamni qaytaradi, tenglikni store-api tekshiradi (3-bo'lim) |
| urinish `ctx.from.id` ga bog'lanadi | qoladi. `open` sessiyani store-api'da ham shu akkauntga bog'laydi |
| bot darhol kontakt so'raydi | avval `open`, keyin **o'sha xabarda** tafsilot va kontakt tugmasi (6-bo'lim) |
| `contact.user_id === ctx.from.id`, forward emas, urinishdan oldingi emas | **qoladi**, botda. Faqat shundan o'tgan kontakt `confirm` ga ketadi |
| to'liq raqam aniq mosligi | store-api'da, xuddi shu qoida bilan: faqat `998` + 9 xona, kod taxmin qilinmaydi, oxiri solishtirilmaydi. `confirm` → `200` yoki `409 TG_LOGIN_PHONE_MISMATCH` |
| mos kelmasa — qayta urinish | egalikdan o'tmagan kontakt (qo'lda yozilgan, begona, forward, `user_id` siz): **avvalgidek botda qayta urinish**. `409 TG_LOGIN_PHONE_MISMATCH` dan keyin urinishni yakunlang: bir akkauntning raqami o'zgarmaydi, sayt ham shu zahoti "raqam mos emas" ko'rsatadi |
| 10 daqiqa | `open` javobidagi **`expires_at`** (store-api, standart 5 daqiqa) |
| yangi havola eskisini almashtiradi | qoladi. Eski sessiya saytda o'z muddati bilan tugaydi |
| oddiy `/start` / `start` callback auth holatini tozalaydi | qoladi, store-api'ga hech narsa yuborilmaydi |
| `/cancel` | `decline` + `"reason": "cancelled"` |
| (yangi, tavsiya) "❌ Bu men emasman" tugmasi | `decline` + `"reason": "not_me"` |
| `ctx.session.telegramAuth = { status: 'verified', … }` | faqat `confirm` **200** qaytgandan keyin. Tarmoq xatosi yoki 5xx bo'lsa "verified" qilmang, foydalanuvchi kontaktni qayta yuborsin |
| "webhook yo'q, korrelyatsiya keyin qo'shiladi" | korrelyatsiya — `login_id`; yetkazish — imzolangan HTTPS POST; replay — imzo timestamp'i ±5 daqiqa va idempotent javoblar |
| raw auth-start va contact update'lari verbose logda yo'q | qoladi. `login_id` ni ham to'liq yozmang |

**Nega telefon havolada emas:** faqat raqamdan qaysi brauzer kutayotgani
bilinmaydi. Bitta raqamga ikki brauzer (masalan biri begona) kutib tursa,
tasdiq ikkalasini ham kiritib yuborardi. `login_id` aniq bitta urinishni
bildiradi. Bundan tashqari raqam URL'da (tarix, QR, ulashilgan havola) qolmaydi.

---

## 1. Bir qatorda

| | |
|---|---|
| Deep link | `https://t.me/<bot>?start=auth_<login_id>`, regex `/^auth_([0-9a-f]{32})$/` |
| Bot chaqiradigan yo'llar | `POST /api/v1/webhooks/telegram-bot/login/open` · `/confirm` · `/decline` |
| Himoya | HMAC-SHA256 imzo, `X-Probox-Bot-Signature` header |
| Env (ikkala tomonda bir xil secret) | store-api: `TELEGRAM_LOGIN_BOT_SECRET` · bot: masalan `PROBOX_LOGIN_SECRET` |
| Sessiya muddati | `open` javobidagi `expires_at` (standart 5 daqiqa) |
| Kod (store-api) | `src/auth/telegram-login/`, `src/webhooks/telegram-bot/` |
| Swagger | ataylab yashirilgan, kontrakt shu hujjatda |

---

## 2. Oqim

```
 Sayt (brauzer)             store-api                         Bot
 ──────────────             ─────────                         ───
 "Telegram orqali olish"
   ── POST /auth/telegram-login ─▶  sessiya (kiritilgan raqamga bog'langan)
   ◀── deep_link, login_id ──────
   socket'ga ulanadi ◀─────────▶  (holatni kutadi)
   [Telegram'ni ochish] ─────────────────────────────────▶  /start auth_<login_id>
                                    ◀── POST …/open ───────  (from.id)
                                    ── tafsilot ──────────▶  tafsilot + [📱 Raqamni ulashish]
   ◀── socket: opened ─────────
                                                            kontakt: user_id, forward, sana tekshiruvi
                                    ◀── POST …/confirm ────  (contact.phone_number)
                                    raqam == saytdagi raqam?
                                    ── 200 confirmed ─────▶  klaviatura olinadi, "✅ Saytga qayting"
   ◀── socket: confirmed ──────
   ── POST /auth/telegram-login/complete ─▶ token (cookie)
   tizimga kirdi
```

Botdan 2-3 ta so'rov kerak: `open`, keyin `confirm` yoki `decline`. Socket,
token va cookie — store-api va sayt ishi.

---

## 3. Deep link va `/start`

```
https://t.me/<bot>?start=auth_3f6c0a3b9d2e4f718a5b6c7d8e9f0a1b
```

- `login_id` doim **32 ta kichik hex**. `extractStartPayload` payload'ni
  kichik harfga o'giradi, bu id'ga zarar qilmaydi. Payload 37 belgi (≤ 64).
- `auth_` ni hozirgidek promo slug'lar, til tanlash va registratsiyadan
  **oldin** tekshiring. Faol conversation'dan chiqish ham o'sha holicha qoladi.
- Eski `auth_<telefon>` formatini qabul qilmang. Regex'ga mos kelmasa:
  "Havola eskirgan, saytdan qaytadan oling".

```ts
const AUTH_PAYLOAD = /^auth_([0-9a-f]{32})$/;

// startHandler boshida (hozirgi auth_ tekshiruvi o'rnida):
const match = payload ? AUTH_PAYLOAD.exec(payload) : null;
if (match) {
  await startSiteLogin(ctx, match[1]); // 6-bo'lim
  return;
}
```

---

## 4. Sozlash va imzo

1. Secret: `openssl rand -hex 32`. Ikkala tomonga aynan bir xil qiymat.
2. **store-api** `.env`: `TELEGRAM_LOGIN_BOT_USERNAME=<bot, @ siz>` va
   `TELEGRAM_LOGIN_BOT_SECRET=<secret>`, keyin PM2 reload.
3. **bot** `.env`: `PROBOX_STORE_API_URL=https://store-api.probox.uz` va
   `PROBOX_LOGIN_SECRET=<secret>` (nomlarini o'zingiz tanlang).

Bu secret bilan istalgan raqamga kirishni tasdiqlab bo'ladi, ya'ni u parol
darajasidagi kalit. Faqat bot serverining env'ida tursin. Repo'ga, logga va
xatolik xabariga tushmasin. Oqib ketsa darhol ikkala tomonda almashtiring.

Header: `X-Probox-Bot-Signature: t=<unix_ts>,s=<hex>`. Imzolanadigan matn
`<ts>.<rawBody>`, algoritm HMAC-SHA256 (hex). Timestamp ±5 daqiqa ichida
bo'lishi kerak. Imzolangan satr va yuborilgan tana **bayt-bayt bir xil**
bo'lsin: `JSON.stringify` ni bir marta chaqiring va o'sha satrni yuboring.

Tayyor client (Node 18+, `fetch`):

```ts
import crypto from 'node:crypto';

const BASE = process.env.PROBOX_STORE_API_URL!; // https://store-api.probox.uz
const SECRET = process.env.PROBOX_LOGIN_SECRET!;

export type OpenResult = {
  login_id: string;
  status: 'opened';
  source: 'web' | 'app'; // kirish saytdan yoki ilovadan (6a)
  phone_masked: string; // "+998 90 *** ** 67"
  language: 'uz' | 'ru' | 'en';
  client: { device_type: string | null; os: string | null; browser: string | null };
  location: { country_code: string | null; country: string | null; city: string | null };
  requested_at: string;
  expires_at: string;
  expires_in: number;
};
export type ActionResult = { login_id: string; status: string };
export type ConfirmInput = {
  login_id: string;
  telegram_user_id: number;
  phone_number: string;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
};

export class ProboxLoginError extends Error {
  constructor(readonly status: number, readonly location: string, message: string) {
    super(message);
  }
}

async function call<T>(path: 'open' | 'confirm' | 'decline', body: object): Promise<T> {
  const raw = JSON.stringify(body);
  let lastError: unknown;

  // Faqat tarmoq xatosi va 5xx qayta yuboriladi — so'rovlar idempotent.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const ts = Math.floor(Date.now() / 1000);
    const sig = crypto.createHmac('sha256', SECRET).update(`${ts}.${raw}`).digest('hex');
    try {
      const res = await fetch(`${BASE}/api/v1/webhooks/telegram-bot/login/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Probox-Bot-Signature': `t=${ts},s=${sig}` },
        body: raw,
        signal: AbortSignal.timeout(10_000),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) return json as T;
      if (res.status < 500) {
        throw new ProboxLoginError(res.status, json.location ?? 'UNKNOWN', json.message ?? '');
      }
      lastError = new ProboxLoginError(res.status, json.location ?? 'SERVER_ERROR', json.message ?? '');
    } catch (err) {
      if (err instanceof ProboxLoginError) throw err;
      lastError = err;
    }
    await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
  }
  throw lastError;
}

export const proboxLogin = {
  open: (loginId: string, telegramUserId: number) =>
    call<OpenResult>('open', { login_id: loginId, telegram_user_id: telegramUserId }),
  confirm: (input: ConfirmInput) => call<ActionResult>('confirm', input),
  decline: (loginId: string, telegramUserId: number, reason: 'not_me' | 'cancelled') =>
    call<ActionResult>('decline', { login_id: loginId, telegram_user_id: telegramUserId, reason }),
};
```

`scripts/simulate-telegram-bot-login.js` (store-api repo) xuddi shu imzo bilan
botning o'rnida so'rov yuboradi. O'z so'rovingizni u bilan solishtirsangiz bo'ladi.

---

## 5. Yo'llar

Tana JSON. Hujjatda yo'q maydon yuborilsa `400` qaytadi (kontrakt qat'iy).
Xato javobi hamma joyda bir xil, ish `location` bo'yicha yuritiladi
(`message` matni o'zgarishi mumkin):

```json
{ "statusCode": 409, "message": "…", "error": "Conflict", "location": "TG_LOGIN_PHONE_MISMATCH", "timestamp": "…", "path": "…" }
```

### 5.1 `POST …/login/open`

`/start auth_<id>` kelganda, kontakt so'rashdan **oldin** chaqiriladi. Sessiya
shu Telegram akkauntiga bog'lanadi: keyin boshqa akkaunt uni ocha olmaydi,
tasdiqlay ham, rad eta ham olmaydi.

```json
{ "login_id": "3f6c0a3b9d2e4f718a5b6c7d8e9f0a1b", "telegram_user_id": 123456789 }
```

`200`:

```json
{
  "login_id": "3f6c0a3b9d2e4f718a5b6c7d8e9f0a1b",
  "status": "opened",
  "source": "web",
  "phone_masked": "+998 90 *** ** 67",
  "language": "uz",
  "client": { "device_type": "desktop", "os": "macOS", "browser": "Chrome" },
  "location": { "country_code": "UZ", "country": "Uzbekistan", "city": "Tashkent" },
  "requested_at": "2026-10-07T10:00:00.000Z",
  "expires_at": "2026-10-07T10:05:00.000Z",
  "expires_in": 287
}
```

- `source` (2026-10-15 dan): kirish qayerdan boshlangani.
  - `web` — Probox sayti.
  - `app` — Probox mobil ilovasi.

  Bot matnlari shu bo'yicha tanlanadi (6a). Qiymatni urinish bilan birga saqlang
  (`pending.details`), chunki `confirm` / `decline` javoblarida u yo'q. Takror `open`
  ham o'sha qiymatni qaytaradi. Maydon kelmasa (eski store-api), `web` deb qarang.
- `phone_masked`: saytda (yoki ilovada) kiritilgan raqam niqoblangan holda. To'liq raqam botga berilmaydi.
- `language`: sayt tili (`uz | ru | en`). Bot o'z joriy tilida gapiradi, `en`
  matni yo'q bo'lsa e'tiborsiz qoldiring.
- `client.*`, `location.*` har biri `null` bo'lishi mumkin. Bo'sh bo'lsa shu qatorni ko'rsatmang.
- `expires_at`: pending attempt'ingiz muddati shundan olinsin (10 daqiqa emas).
- Takror chaqiruv (o'sha akkauntdan) o'sha javobni qaytaradi.

### 5.2 `POST …/login/confirm`

Kontakt egalik tekshiruvlaridan o'tgandan keyin chaqiriladi.

```json
{
  "login_id": "3f6c0a3b9d2e4f718a5b6c7d8e9f0a1b",
  "telegram_user_id": 123456789,
  "phone_number": "998901234567",
  "first_name": "Ali",
  "last_name": "Valiyev",
  "username": "ali_v",
  "language_code": "uz"
}
```

- `phone_number`: `message.contact.phone_number` ni o'zgartirmasdan yuboring.
  store-api `+`, bo'shliq, qavs va tirelarni olib tashlaydi va faqat `998` + 9
  xonani qabul qiladi. Bu sizning qoidangiz bilan bir xil.
- `first_name`, `last_name`, `username`, `language_code` ixtiyoriy (`ctx.from`
  dan), faqat audit uchun.

`200` → `{ "login_id": "…", "status": "confirmed" }`. Shu payt sayt avtomatik
kiradi. Takror chaqiruv (o'sha akkaunt va raqam) yana `200` qaytaradi, status
`confirmed` yoki `completed` bo'ladi. Shu sababli "repeated contact messages"
xavfsiz.

`409 TG_LOGIN_PHONE_MISMATCH`: raqam saytdagisi emas. Sessiya **yopiladi**,
sayt "raqam mos emas" ko'rsatadi. Botda urinishni yakunlang va
klaviaturani olib tashlang.

### 5.3 `POST …/login/decline`

```json
{ "login_id": "3f6c0a3b9d2e4f718a5b6c7d8e9f0a1b", "telegram_user_id": 123456789, "reason": "cancelled" }
```

| `reason` | Qachon | Saytda |
|---|---|---|
| `cancelled` (standart, yuborilmasa ham) | `/cancel` | "Kirish botda bekor qilindi" |
| `not_me` | "❌ Bu men emasman" tugmasi | "Kirish botda rad etildi", store-api'da audit log |

`200` → `{ "login_id": "…", "status": "declined" }`. Takror chaqiruv ham `200`.
Oddiy `/start` (urinishni tashlab ketish) uchun hech narsa yubormang: sessiya
muddati bilan tugaydi.

### 5.4 Xatolar va botdagi javob

| HTTP | `location` | Qachon | Botda (taklif) |
|---|---|---|---|
| 404 | `TG_LOGIN_NOT_FOUND` | id noma'lum yoki yozuv o'chgan | "Havola eskirgan. Saytdan qaytadan «Telegram orqali olish» ni bosing." |
| 410 | `TG_LOGIN_EXPIRED` | muddat o'tdi | xuddi shu |
| 403 | `TG_LOGIN_OTHER_ACCOUNT` | havola boshqa Telegram akkauntida ochilgan | "Bu havola boshqa Telegram akkauntida ochilgan." |
| 409 | `TG_LOGIN_NOT_OPENED` | `open` siz `confirm` | bot xatosi, `open` dan boshlang |
| 409 | `TG_LOGIN_PHONE_MISMATCH` | kontakt raqami saytdagisi emas | "Telegram raqamingiz saytda kiritilgan raqamga mos emas. Saytda shu Telegram raqamini kiriting yoki SMS orqali kiring." |
| 409 | `TG_LOGIN_ALREADY_CONFIRMED` | allaqachon tasdiqlangan | "Kirish allaqachon tasdiqlangan. Saytga qayting." |
| 409 | `TG_LOGIN_DECLINED` | allaqachon bekor qilingan yoki rad etilgan | "Bu kirish bekor qilingan." |
| 400 | `invalid_*` | maydon formati xato (`invalid_reason` ham) | bot xatosi |
| 401 | `TG_BOT_*` | imzo yo'q / noto'g'ri / eski / secret sozlanmagan | bot xatosi yoki sozlama (4-bo'lim) |
| 503 | `TG_LOGIN_UNAVAILABLE` | store-api vaqtincha ishlamayapti | "Hozir tasdiqlab bo'lmadi, birozdan keyin kontaktni qayta yuboring." Urinishni yopmang |

Jadvaldagi matnlar saytdagi kirish uchun. Ilovadan boshlangan kirishda (`source: "app"`)
va manba hali noma'lum bo'lganda (`open` dan oldin) — 6a-bo'limdagi matnlar.

---

## 6. Botdagi oqim: majburiy talablar

Mavjud `telegram-auth.middleware` ustiga qo'shiladi:

1. **`/start auth_<id>`:** avval `open`. Xato bo'lsa, 5.4 bo'yicha javob
   bering va kontakt so'ramang. Muvaffaqiyatli bo'lsa, pending attempt'ga
   `{ loginId, telegramId: from.id, startedAt, expiresAt: Date.parse(expires_at) }` yozing.
2. **Kontakt so'rovi xabarida tafsilot bo'lsin:** `phone_masked`, `client`
   (brauzer, OS), `location.city` va "siz bo'lmasangiz tasdiqlamang"
   ogohlantirishi. Begona odam havolani tashlab qo'yishi mumkin, shu xabar
   mijozni shundan himoya qiladi. Reply-keyboard: `requestContact(...)` va
   tavsiya etiladi `❌ Bu men emasman`.
3. **Kontakt tekshiruvlari o'zingizdagidek:** `contact.user_id === ctx.from.id`,
   forward emas, `message.date * 1000 >= startedAt`, urinish muddati o'tmagan.
   Shulardan o'tmasa — avvalgidek qayta urinish, store-api'ga yubormang.
4. **O'tgan kontakt → `confirm`:**
   - `200` — klaviaturani olib tashlang (`remove_keyboard: true`), "✅
     Tasdiqlandi. Saytga qayting, kirish avtomatik davom etadi" deb yozing,
     `telegramAuth` ni `verified` qiling;
   - `409 TG_LOGIN_PHONE_MISMATCH` va boshqa 4xx — urinishni yakunlang;
   - 5xx yoki tarmoq xatosi (client 3 marta urinib bo'lgandan keyin) —
     urinish ochiq qoladi, foydalanuvchi kontaktni qayta yuboradi.
5. **`/cancel`** → `decline` `cancelled`. **"Bu men emasman"** → `decline` `not_me`.
6. Logga to'liq `login_id` va raqam yozmang (birinchi 8 belgi va oxirgi 4 raqam yetadi).

Taxminiy kod (grammy). Tuzilmani middleware'ingizga moslang:

```ts
const startSiteLogin = async (ctx: BotContext, loginId: string) => {
  try {
    const info = await proboxLogin.open(loginId, ctx.from!.id);
    ctx.session.telegramAuth = {
      status: 'pending',
      login_id: loginId,
      telegram_id: ctx.from!.id,
      started_at: Date.now(),
      expires_at: Date.parse(info.expires_at),
    };
    const device = [info.client.browser, info.client.os].filter(Boolean).join(' · ');
    await ctx.reply(
      ctx.t('site_login_confirm', { phone: info.phone_masked, device, city: info.location.city ?? '' }),
      {
        reply_markup: new Keyboard()
          .requestContact(ctx.t('site_login_share_phone')) // "📱 Raqamni ulashish va kirish"
          .row()
          .text(ctx.t('site_login_not_me')) // "❌ Bu men emasman"
          .resized()
          .oneTime(),
      },
    );
  } catch (err) {
    await ctx.reply(siteLoginErrorText(ctx, err)); // 5.4 jadvali
  }
};

// Kontakt sizning barcha egalik tekshiruvlaringizdan o'tgandan keyin:
const confirmSiteLogin = async (ctx: BotContext, pending: PendingSiteLogin, phone: string) => {
  try {
    await proboxLogin.confirm({
      login_id: pending.login_id,
      telegram_user_id: ctx.from!.id,
      phone_number: phone,
      first_name: ctx.from!.first_name,
      last_name: ctx.from!.last_name,
      username: ctx.from!.username,
      language_code: ctx.from!.language_code,
    });
    ctx.session.telegramAuth = { status: 'verified', /* … */ };
    await ctx.reply(ctx.t('site_login_done'), { reply_markup: { remove_keyboard: true } });
  } catch (err) {
    if (err instanceof ProboxLoginError) {
      ctx.session.telegramAuth = undefined; // 4xx — yakuniy
      await ctx.reply(siteLoginErrorText(ctx, err), { reply_markup: { remove_keyboard: true } });
    } else {
      await ctx.reply(ctx.t('site_login_retry')); // tarmoq/5xx — kontaktni qayta yuborsin
    }
  }
};
```

Kontakt so'rovi xabari uchun taklif (uz):

> 🔐 **Probox saytiga kirish**
>
> Raqam: +998 90 \*\*\* \*\* 67
> Qurilma: Chrome · macOS, Tashkent
>
> Agar hozir saytda kirayotgan bo'lsangiz, pastdagi **«📱 Raqamni ulashish va
> kirish»** tugmasini bosing. Siz bo'lmasangiz, **«❌ Bu men emasman»** ni
> bosing va hech kimga havola yubormang.

---

## 6a. Matnni `source` bo'yicha tanlash: sayt yoki ilova (2026-10-15)

Hozirgi matnlarning bir qismi «sayt» deydi: «Probox saytiga kirish», «Saytga
qayting», «Saytdan qaytadan…». Ilovadan kirayotgan foydalanuvchi uchun bu
chalkash. Qoida:

1. **`open` muvaffaqiyatli bo'lgandan keyingi har bir xabar** (kontakt so'rovi,
   tasdiq, `confirm` / `decline` xatolari, muddati tugagani) — saqlangan
   `source` bo'yicha. `app` bo'lsa `_app` varianti, `web` bo'lsa hozirgi matn
   (o'zgarmaydi).
2. **`open` dan oldin yoki `open` xato qaytarganda** manba hali noma'lum:
   havola noto'g'ri, `open` → `410` / `404` / `TG_LOGIN_OTHER_ACCOUNT`. Bu
   yerda **neytral** matn (`_any`) — sayt ham, ilova ham.
3. `source` kelmasa (eski store-api) — `web`.

```ts
type LoginSource = 'web' | 'app';

// `_app` varianti bor kalitlar (pastdagi jadval).
const APP_KEYS = new Set([
  'telegram_auth_heading',
  'telegram_auth_request_contact',
  'telegram_auth_verified',
  'telegram_auth_already_confirmed',
  'telegram_auth_phone_mismatch',
  'telegram_auth_declined',
  'telegram_auth_decline_retry',
  'telegram_auth_error',
  'telegram_auth_expired',
]);
// Manba noma'lum paytda chiqishi mumkin bo'lganlar — `_any` varianti.
const NEUTRAL_KEYS = new Set([
  'telegram_auth_invalid_link',
  'telegram_auth_expired',
  'telegram_auth_other_account',
]);

/** `source` ma'lum — sayt/ilova matni; noma'lum (open'dan oldin) — neytral. */
const authKey = (key: string, source: LoginSource | undefined): string => {
  if (!source) return NEUTRAL_KEYS.has(key) ? `${key}_any` : key;
  return source === 'app' && APP_KEYS.has(key) ? `${key}_app` : key;
};

// open muvaffaqiyatli:
pending.details = { ...details, source: info.source ?? 'web' };
// keyin: ctx.t(authKey('telegram_auth_verified', pending.details.source))
// open xatosi: ctx.t(authKey(errorTextKey(error, 'telegram_auth_open_retry'), undefined))
```

`verified` holatiga o'tganda ham `source` ni saqlab qoling: kontakt qayta
yuborilsa, «allaqachon tasdiqlangan» matni ham to'g'ri tilda bo'lsin.

### `_app` variantlari (`source: "app"`)

| Kalit | uz | ru |
|---|---|---|
| `telegram_auth_heading_app` | 🔐 \<b\>Probox ilovasiga kirish\</b\> | 🔐 \<b\>Вход в приложение Probox\</b\> |
| `telegram_auth_request_contact_app` | Agar hozir Probox ilovasida kirayotgan bo'lsangiz, pastdagi «📱 Raqamni ulashish va kirish» tugmasini bosing. Siz bo'lmasangiz, «❌ Bu men emasman» ni bosing va hech kimga havola yubormang. Bekor qilish: /cancel. | Если вы сейчас входите в приложение Probox, нажмите «📱 Поделиться номером и войти» ниже. Если это не вы, нажмите «❌ Это не я» и никому не отправляйте ссылку. Отмена: /cancel. |
| `telegram_auth_verified_app` | ✅ Tasdiqlandi. Probox ilovasiga qayting, kirish avtomatik davom etadi. | ✅ Подтверждено. Вернитесь в приложение Probox, вход продолжится автоматически. |
| `telegram_auth_already_confirmed_app` | Kirish allaqachon tasdiqlangan. Probox ilovasiga qayting. | Вход уже подтверждён. Вернитесь в приложение Probox. |
| `telegram_auth_phone_mismatch_app` | Telegram raqamingiz ilovada kiritilgan raqamga mos emas. Ilovada shu Telegram raqamini kiriting yoki SMS orqali kiring. | Ваш номер Telegram не совпадает с номером, введённым в приложении. Введите в приложении номер этого Telegram-аккаунта или войдите по SMS. |
| `telegram_auth_declined_app` | Bu kirish bekor qilingan yoki rad etilgan. Yangi havolani ilovadan oling. | Этот вход отменён или отклонён. Получите новую ссылку в приложении. |
| `telegram_auth_decline_retry_app` | Bekor qilishni ilovaga yetkazib bo'lmadi. Birozdan keyin /cancel ni yoki «❌ Bu men emasman» tugmasini qayta bosing. Bu urinish tasdiqlanmaydi. | Не удалось сообщить приложению об отмене. Повторно нажмите /cancel или «❌ Это не я» немного позже. Этот запрос не будет подтверждён. |
| `telegram_auth_error_app` | Kirishni tasdiqlab bo'lmadi. Ilovaga qaytib yangi havola oling yoki SMS orqali kiring. | Не удалось подтвердить вход. Вернитесь в приложение и получите новую ссылку или войдите по SMS. |
| `telegram_auth_expired_app` | Kirish havolasining muddati tugadi. Ilovada qaytadan «Telegram orqali kirish» ni bosing. | Срок действия ссылки истёк. В приложении снова нажмите «Войти через Telegram». |

### `_any` variantlari (manba noma'lum)

| Kalit | uz | ru |
|---|---|---|
| `telegram_auth_invalid_link_any` | Havola eskirgan yoki noto'g'ri. Probox sayti yoki ilovasidan yangi havola oling. | Ссылка устарела или неверна. Получите новую ссылку на сайте или в приложении Probox. |
| `telegram_auth_expired_any` | Kirish havolasining muddati tugadi. Probox sayti yoki ilovasidan yangi havola oling. | Срок действия ссылки истёк. Получите новую ссылку на сайте или в приложении Probox. |
| `telegram_auth_other_account_any` | Bu havola boshqa Telegram akkauntida ochilgan. Probox sayti yoki ilovasidan yangi havola oling. | Эта ссылка открыта в другом Telegram-аккаунте. Получите новую ссылку на сайте или в приложении Probox. |

O'zgarmaydigan matnlar — «sayt» so'zi yo'q, ikkala manba uchun bir xil:
`telegram_auth_phone`, `_device`, `_location`, `_share_phone`, `_not_me`,
`_own_contact_only`, `_private_only`, `_cancelled`, `_retry`, `_open_retry`.

**Qurilma qatori** ilovada `client.os` + `client.device_type` dan bo'ladi
(`browser` odatda `null`), masalan «Android · mobile». Mavjud
`[browser, os, device_type].filter(Boolean)` yig'ish o'zgarishsiz ishlaydi.

---

## 7. Ishga tushirish tartibi (backend, server)

1. **Deploy:** `npx knex migrate:latest` (feature flag `auth.telegram_bot_login`
   **o'chiq** qo'shiladi), keyin `npm run build` va PM2 reload.
2. **nginx:** WebSocket upgrade. Brauzer `wss://store-api.probox.uz/api/v1/socket.io/`
   ga ulanadi. nginx `Upgrade`/`Connection` sarlavhalarini o'zi uzatmaydi.
   store-api'ning `server {}` blokida ular hali yozilmagan bo'lsa, shu blokni
   qo'shing (`proxy_pass` mavjud `location /` dagi bilan bir xil bo'lsin, prod'da port `5006`):
   ```nginx
   location /api/v1/socket.io/ {
       proxy_pass http://127.0.0.1:5006;
       proxy_http_version 1.1;
       proxy_set_header Upgrade $http_upgrade;
       proxy_set_header Connection "upgrade";
       proxy_set_header Host $host;
       proxy_read_timeout 120s;
   }
   ```
   `nginx -t && systemctl reload nginx`. Cloudflare'da **Network → WebSockets**
   yoqilgan bo'lsin (standart holatda yoqilgan).
3. **PM2:** sticky session kerak emas. Socket faqat WebSocket transportida
   ishlaydi, instance'lar orasidagi xabarlarni Redis adapter yetkazadi
   (`src/common/socket/redis-io.adapter.ts`).
4. **CORS:** socket handshake HTTP CORS whitelist'idan
   (`CORS_ALLOWED_ORIGINS`) o'tadi. 2026-10-07 holatida `probox.uz` va
   `probox-marketplace.vercel.app` ro'yxatda, `www.probox.uz` yo'q. Sayt
   `www` da ochiladigan bo'lsa, uni ham qo'shing.
5. **Tekshiruv:** `node scripts/check-telegram-login.js`. To'g'ridan-to'g'ri
   port o'tib, public URL o'tmasa, muammo nginx yoki Cloudflare'da.
6. **Bot tayyor bo'lgach** flag'ni yoqing:
   `PATCH /api/v1/features/auth.telegram_bot_login {"is_active": true}`
   (ruxsat `store.feature.toggle`) yoki
   `UPDATE app_features SET is_active = true WHERE feature_key = 'auth.telegram_bot_login';`.
   Kesh 5 daqiqa. Flag o'chiq bo'lsa sayt `403 TG_LOGIN_DISABLED` oladi va
   tugmani yashiradi. Bot ishdan chiqsa, xuddi shu flag bilan o'chiriladi.
7. **`source` (2026-10-15):** store-api deploy (migratsiya yo'q), keyin bot 6a
   matnlari bilan, keyin ilova (`x-client-type: app` yuboradi). Ketma-ketlik qat'iy
   emas: maydon qo'shimcha. Bot yangilanmaguncha ilovadagi kirishda ham sayt matni
   chiqadi; ilova yangilanmaguncha `source` doim `web` bo'ladi.

---

## 8. Sinash

- **Botsiz** (store-api va sayt tomoni): saytda deep link oling, keyin
  ```bash
  node scripts/simulate-telegram-bot-login.js <deep_link yoki login_id> --phone 901234567
  ```
  Sayt avtomatik kirishi kerak. `--cancel` (`/cancel`), `--decline` ("Bu men
  emasman") va boshqa `--phone` (raqam mos emas) holatlarini ham sinang.
- **Bot bilan** (staging), sizning testlaringizga qo'shimcha:
  - o'z raqamingiz bilan: saytda "Telegram orqali olish" → botda tafsilot →
    kontakt → sayt kiradi;
  - boshqa raqamli Telegram akkaunti → `TG_LOGIN_PHONE_MISMATCH`, sayt "mos emas" ko'rsatadi;
  - havolani ikkinchi akkauntda ochish → `TG_LOGIN_OTHER_ACCOUNT`;
  - `/cancel` → sayt "bekor qilindi";
  - 5 daqiqadan keyin havola → `TG_LOGIN_EXPIRED`;
  - kontaktni ikki marta yuborish → ikkinchisi ham `200`, sayt bir marta kiradi.
- **Ilova matni** (`source`): ilovadan kirish yoki botsiz —
  ```bash
  curl -s -X POST "$API/api/v1/auth/telegram-login" -H 'content-type: application/json' \
    -H 'x-device-id: test-device-01' -H 'x-client-type: app' \
    -d '{"phone_number":"+998901234567"}'
  node scripts/simulate-telegram-bot-login.js <deep_link> --phone 901234567
  ```
  Skript chiqargan `open` javobida `"source":"app"` bo'lishi kerak. Botda esa
  «Probox ilovasiga kirish» va «✅ … Probox ilovasiga qayting». `x-client-type`
  siz yoki `web` bilan — hozirgi sayt matni. Eskirgan havolada esa neytral matn.
