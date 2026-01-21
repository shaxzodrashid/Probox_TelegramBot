# Probox Telegram Bot 🤖

A powerful and scalable Telegram bot built with the [grammY](https://grammy.dev/) framework, designed for managing user contracts, tracking payments, and seamless integration with **SAP Business One (SAP HANA)**.

## 🚀 Key Features

- **🌐 Multi-language Support**: Fully localized in Uzbek (UZ) and Russian (RU).
- **📝 Intelligent Registration**: Conversation-based registration flow with phone number verification.
- **🔗 SAP HANA Integration**: Real-time business partner verification and data retrieval from SAP B1.
- **📄 Contract Management**: 
  - Paginated list of user contracts.
  - On-demand PDF contract downloads.
- **📦 Object Storage**: Integration with **MinIO** for secure document handling.
- **💾 Persistent Sessions**: Session management using PostgreSQL/Redis.
- **🛠️ Robust Architecture**: Built with TypeScript, clean separation of concerns (handlers, services, conversations, middlewares).

## 🛠️ Tech Stack

- **Framework**: [grammY](https://grammy.dev/)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Database**: [PostgreSQL](https://www.postgresql.org/) with [Knex.js](https://knexjs.org/)
- **Cache/Session**: [Redis](https://redis.io/) (ioredis)
- **ERP Integration**: [SAP HANA Client](https://www.sap.com/products/technology-platform/hana.html)
- **Object Storage**: [MinIO](https://min.io/)
- **Localization**: [@grammyjs/i18n](https://grammy.dev/plugins/i18n)

## 📁 Project Structure

```text
src/
├── bot.ts           # Bot initialization and route registration
├── server.ts        # Entry point (Server/Health check)
├── config/          # Project configuration and environment variables
├── conversations/   # Wizard-style user flows (Registration, etc.)
├── database/        # Database migrations, seeds, and connection
├── handlers/        # Command and callback query handlers
├── keyboards/       # Custom inline and reply keyboards
├── locales/         # i18n translation files (uz.yaml, ru.yaml)
├── middlewares/     # Bot middlewares (Logging, Session, etc.)
├── sap/             # SAP HANA service and connection logic
├── services/        # Business logic (User, Contracts, etc.)
├── types/           # TypeScript interfaces and types
└── utils/           # Helper functions and Logger
```

## ⚙️ Getting Started

### Prerequisites

- Node.js (v18+)
- PostgreSQL
- Redis
- MinIO instance (optional for local dev, but required for PDF features)
- SAP HANA client (for ERP integration)

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/your-repo/probox-telegrambot.git
   cd probox-telegrambot
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Environment Setup**:
   Copy `.env.example` to `.env` and fill in your credentials:
   ```bash
   cp .env.example .env
   ```

4. **Run Migrations**:
   ```bash
   npx knex migrate:latest
   ```

### Running the Bot

- **Development**:
  ```bash
  npm run dev
  ```
- **Production Build**:
  ```bash
  npm run build
  npm start
  ```

## 📜 Available Scripts

- `npm run dev` - Start the bot in development mode with nodemon.
- `npm run build` - Compile TypeScript to JavaScript.
- `npm start` - Run the compiled production bundle.
- `npm run lint` - Run ESLint for code quality checks.
- `npm run format` - Format code using Prettier.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

This project is licensed under the ISC License.
