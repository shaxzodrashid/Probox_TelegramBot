# Probox Telegram Bot Flowchart (Foydalanuvchi yo'li)

Ushbu diagramma **Probox Bot** uchun foydalanuvchi sayohati va tizim mantig'ining eng sodda va tushunarli ko'rinishini ifodalaydi.

```mermaid
flowchart TD
    %% Onboarding
    Start([1. BOSHLASH VA TIL<br/>UZ / RU / EN tanlovi]) --> Phone[Telefon raqamini yuborish<br/>Telegram kontakt ulashish]
    Phone --> CheckSAP{SAP bazasida bormi?}

    %% Verification Paths
    CheckSAP -- Yo'q --> AdminFlow[Admin ko'rigi<br/>Manual tasdiqlash talab etiladi]
    CheckSAP -- Ha --> SMS[SMS OTP bosqichi<br/>Tezkor tasdiqlash]
    
    AdminFlow --> Menu
    SMS --> Menu

    %% Features
    Menu[🏠 ASOSIY MENYU<br/>Tasdiqlangan kirish]
    
    Menu --> Contracts
    Menu --> Payments
    Menu --> Support
    Menu --> Settings

    subgraph "Asosiy funksiyalar"
        direction LR
        Contracts[Mening shartnomalarim<br/>PDF yuklab olish<br/>Faol va Yakunlangan]
        Payments[Mening to'lovlarim<br/>To'lovlar tarixi<br/>To'lov grafigi]
        Support[Qo'llab-quvvatlash<br/>Operator bilan bog'lanish<br/>Yordam markazi]
        Settings[⚙️ SOZLAMALAR<br/>Telefon raqamni o'zgartirish<br/>Tilni o'zgartirish]
    end

    subgraph Automation [ORQA FONDA AVTOMATLASHTIRISH]
        direction LR
        AutoPDF[📄 Xarid vaqtida avtomatik PDF]
        Reminders[🔔 Aqlli eslatmalar K-2, K0]
    end

    %% Styles
    classDef startBox fill:#448AFF,color:#fff,stroke:none,border-radius:20px;
    classDef whiteBox fill:#fff,stroke:#e0e0e0,stroke-width:1px,color:#333;
    classDef decision fill:#fff,stroke:#FFAB40,stroke-width:2px,color:#E65100;
    classDef admin fill:#FFEBEE,stroke:#FF5252,stroke-width:1px,color:#B71C1C;
    classDef greenBox fill:#E8F5E9,stroke:#66BB6A,stroke-width:1px,color:#2E7D32;
    classDef mainBtn fill:#7C4DFF,stroke:none,color:#fff,border-radius:20px;
    classDef autoBox fill:#00BFA5,color:#fff,stroke:none,border-radius:10px;

    class Start startBox;
    class Phone,Contracts,Payments,Support,Settings whiteBox;
    class CheckSAP decision;
    class AdminFlow admin;
    class SMS greenBox;
    class Menu mainBtn;
    class AutoPDF,Reminders autoBox;
```

## 📘 Oqim qisqacha mazmuni
1.  **Ro'yxatdan o'tish**: Foydalanuvchi tilni tanlaydi va telefon raqamini yuboradi.
2.  **Tasdiqlash**: 
    - Agar raqam **SAP tizimida** mavjud bo'lsa, foydalanuvchi darhol SMS OTP kodini oladi.
    - Agar yo'q bo'lsa, **Admin** so'rovni ko'rib chiqadi va qo'lda tasdiqlaydi.
3.  **Asosiy xizmatlar**: 
    - **Tasdiqlangan foydalanuvchilar**: Shartnomalarni ko'rishlari, PDF fayllarni yuklab olishlari va to'lovlar tarixini kuzatishlari mumkin.
4.  **Avtomatlashtirish**: Bot xarid amalga oshirilganda avtomatik ravishda shartnoma PDF faylini yuboradi va to'lov muddati kelishidan 2 kun oldin eslatma yuboradi.
