“Probox” Telegram bot loyihasi uchun **Flow chart** tayyorlash. Diagramma **aniq, o‘qilishi oson, modulli** bo‘lishi kerak: onboarding/registratsiya, SAP tekshiruvi, admin verifikatsiya, bypass (kelajak vitrina/katalog funksiyalari uchun), shartnoma PDF yuborish, to‘lovlar, eslatmalar, admin/super admin boshqaruvi.

### 1) Diagramma talablari

* Diagramma turi: **Swimlane flowchart** (role-based).

* Swimlane (rol) lar:

  1. **Customer (Telegram User)**
  2. **Telegram Bot**
  3. **Backend/API**
  4. **SAP Database**
  5. **SMS Provider**
  6. **Admin**
  7. **Super Admin**
  8. (ixtiyoriy) **Store/POS/CRM System** (shartnoma va to‘lov eventlari keladigan tizim sifatida)

* Diagramma “modullar”ga bo‘lingan bo‘lishi kerak (bitta katta diagramma yoki 3–5 ta sub-diagramma):

  * A) Start / Language select
  * B) Registration + SAP check + Verification logic
  * C) Main menu: contracts/payments
  * D) Contract created event → PDF auto send
  * E) Payment reminders scheduler
  * F) Admin & Super Admin management

* Har bir modulda:

  * **Decision node** (ha/yo‘q) lar aniq ko‘rsatiladi.
  * Xatolik/exception branchlar: SMS noto‘g‘ri, kod muddati tugagan, user bloklagan, SAP unavailable va h.k.

* Diagrammada quyidagi vizual konvensiyalarni ishlat:

  * Start/End — oval
  * Process — rectangle
  * Decision — diamond
  * Data store (DB/SAP) — cylinder
  * Notification — “message” belgisi yoki alohida tugun

* Chiqish format:

  * Agar mumkin bo‘lsa **Mermaid flowchart** + **renderga tayyor** bo‘lsin.
  * Aks holda: **draw.io / BPMN** yoki Figma-compatible flowchart.
  * Har bir modul nomi sarlavha bilan ajratilsin.

---

### 2) Tizim konteksti (bot nima qiladi)

**Probox** — Apple gadjetlarini bo‘lib to‘lash asosida sotadigan do‘kon. Telegram bot:

* Registratsiya (til tanlash → telefon yuborish → SAP’da mavjudligini tekshirish → SMS kod bilan tasdiqlash).
* Xarid bo‘lsa shartnoma PDF avtomatik yuboriladi.
* User o‘zi shartnomalar ro‘yxatini ko‘radi, shartnoma PDF ni yuklab oladi.
* Har shartnoma bo‘yicha:

  * Keyingi to‘lov sanasi va summasi
  * To‘lovlar tarixi
  * Agar shartnoma yakunlanmagan bo‘lsa: tarix bilan birga **kelgusi to‘lovlar jadvali** ham ko‘rsatiladi.
* To‘lov eslatmalari:

  * To‘lov sanasidan **2 kun oldin** reminder
  * To‘lov kuni: avval “to‘lov amalga oshganmi?” tekshiriladi. To‘lanmagan bo‘lsa reminder yuboriladi.

---

### 3) Registratsiya va SAP verifikatsiya qoidalari (ENG MUHIM)

Registratsiya bosqichi:

**A. Start:**

1. User /start bosadi
2. Bot: Til tanlash (UZ/RU/EN)
3. Bot: Telefon raqamini yuborishni so‘raydi (Contact share)

**B. Telefon validatsiyasi:**
4) User telefon yuboradi
5) Backend: formatni tekshiradi (+998… E.164)

* Agar noto‘g‘ri: Bot xato → qayta yuborishni so‘raydi
* Agar to‘g‘ri: davom

**C. SAP tekshiruv:**
6) Backend → SAP DB: “phone mavjudmi?” query
7) Decision: “SAP’da mavjudmi?”

* **Ha** → SMS OTP stepga o‘tadi (normal verifikatsiya)
* **Yo‘q** → Admin verifikatsiya oqimi:

  * Backend: “pending_verification” holatidagi request yaratadi
  * Bot userga: “Raqamingiz tekshirishga yuborildi, kuting” (yoki “tez orada admin tasdiqlaydi”)
  * Backend → Admin: yangi raqam verifikatsiya uchun notif yuboradi (admin kanal/DM)
  * Admin decision: “Approve / Reject”

    * Approve → SMS OTP step (yoki bevosita verified; lekin afzal: baribir SMS bilan bog‘lash)
    * Reject → bot userga “rad etildi / supportga murojaat qiling”

**D. Bypass (verifikatsiyani aylanib o‘tish) — kelajak funksiyalari uchun:**

* Ayrim funksiyalar (masalan: **katalog/vitrina**, aksiyalar) uchun user **verifikatsiyasiz** ham foydalanishi mumkin.
* Shuning uchun onboardingda decision bo‘lsin:

  * “User verified required action qilyaptimi?”

    * Agar user faqat “Browse catalog / promotions” qilsa → verifikatsiyasiz ruxsat
    * Agar user “contracts/payments”ga kirsa → verifikatsiya majburiy (SAP/SMS)

Diagrammada buni aniq ajrat:

* **Public mode (Guest)**: katalog/aksiya (future)
* **Verified mode**: shartnoma/to‘lovlar/notification

**E. SMS OTP:**
8) Backend → SMS provider: OTP yuboradi
9) Bot: userdan kodni kiritishni so‘raydi
10) Backend: OTP tekshiradi (expiry + attempts)
11) Decision: OTP to‘g‘rimi?

* Ha → user status “VERIFIED”, main menu
* Yo‘q → qayta urinish / limit tugasa “resend OTP / block time”

---

### 4) Shartnoma PDF auto yuborish oqimi

**Trigger:** Store/POS/CRM yoki Admin panel orqali “contract_created” event.

1. Store/POS → Backend: contract created (phone, contract_id, pdf link/file, payment schedule)

2. Backend: phone bo‘yicha userni topadi

3. Decision: user Telegram’da ro‘yxatdan o‘tgan va verifiedmi?

   * Ha → Bot: userga PDF yuboradi + “shartnoma yaratildi” xabari
   * Yo‘q → Backend: “pending_delivery” queue saqlaydi (user keyin registratsiya qilsa yuboriladi)

4. PDF yuborishda:

   * Telegram file_id saqlab qo‘yish mumkin (keyingi yuborish tez bo‘lishi uchun).

---

### 5) User menyusi: shartnomalar va to‘lovlar

Main menu tugmalari:

* “Mening shartnomalarim”
* “Keyingi to‘lov”
* “To‘lovlar tarixi”
* “Sozlamalar (til)”
* “Yordam/Operator”

**Mening shartnomalarim:**

1. Bot → Backend: contracts list
2. User: contract tanlaydi
3. Bot: Contract detail:

   * PDF yuklab olish
   * Keyingi to‘lov
   * To‘lovlar tarixi (agar active bo‘lsa kelgusi schedule ham qo‘shiladi)

**Keyingi to‘lov:**

* Backend: eng yaqin due_date bo‘yicha (active contracts)
* Bot: sana + summa + contract nomi

**To‘lovlar tarixi:**

* User contract tanlaydi
* Backend: payments history
* Decision: contract active (yakunlanmagan)mi?

  * Ha → history + next scheduled payments
  * Yo‘q → faqat history

---

### 6) Reminder scheduler oqimi

Har kuni (masalan 09:00) ishlaydigan scheduler:

**D-2 Reminder:**

1. Backend: due_date = today+2 AND status=scheduled AND contract active
2. Decision: already paid?

   * Ha → skip
   * Yo‘q → botga reminder yuborish

**D0 Reminder (payment day):**

1. Backend: due_date = today AND status=scheduled
2. Backend: POS/SAP/payment systemdan “paid?” tekshiradi (yoki DB status)
3. Decision: paid?

   * Ha → (optional) “to‘lov qabul qilindi” notif
   * Yo‘q → reminder yuborish

Har reminder yuborilganda reminders_log yoziladi.

---

### 7) Admin va Super Admin rollari

**Super Admin:**

* Bot ichida “Admin management” bo‘limi
* “Add Admin” (telegram_id yoki phone orqali)
* “Remove Admin” (ixtiyoriy)
* “Admin list”

**Admin:**

* Mijoz ma’lumotlarini **ko‘rishi mumkin**, lekin **o‘zgartira olmaydi**.
* Admin uchun funksiyalar:

  * “Search customer by phone”
  * “View customer profile: contracts + payments + status”
  * “Verify phone requests list” (SAP’da topilmagan raqamlar)

    * Approve/Reject tugmalari
  * “View contract PDF” (read-only access)

Diagrammada RBAC (role-based access control) decision node bo‘lsin:

* “Is user Admin?” → admin menyu
* “Is user Super Admin?” → admin management menyu

---

### 8) Edge cases (diagramda alohida branch)

* SAP DB down/unavailable:

  * Backend error → Bot: “xizmat vaqtincha ishlamayapti, qayta urinib ko‘ring”
  * (optional) Admin queuega yuborish
* SMS provider fail:

  * retry → fail bo‘lsa userga xabar
* User OTP attempts limit:

  * lock timeout
* User botni bloklagan:

  * delivery fail → log + admin alert

---

### 9) Diagramma chiqishi

* Yakunda bitta “Master flow” + modul diagrammalar.
* Har bir modulda asosiy tugunlar va decisionlar aniq.
* Output: Mermaid code (afzal) yoki draw.io importga mos format.