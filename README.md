# AutoApply 🚀

Auto-apply to software engineering jobs on **LinkedIn**, **TanitJobs**, and **Keejob** — upload your CV once, let the bot do the rest.

---

## Features

- 📄 **CV Parser** — upload a PDF, Claude extracts skills, title, experience
- 🔍 **Job Scraper** — finds matching jobs across all three platforms
- 🤖 **Auto-Apply Bot** — fills forms and submits applications via Playwright
- 📊 **Dashboard** — track applications, match scores, responses, interviews
- 🔐 **Auth** — Google, GitHub, or email login via NextAuth v5

---

## Tech Stack

| Layer        | Tech                                      |
|--------------|-------------------------------------------|
| Framework    | Next.js 14 App Router + TypeScript        |
| Database     | PostgreSQL + Prisma ORM                   |
| Auth         | NextAuth v5 + Google/GitHub/Credentials   |
| AI           | Anthropic Claude (CV parsing + matching)  |
| Automation   | Playwright (LinkedIn / TanitJobs / Keejob)|
| Queue        | BullMQ + Redis                            |
| Styling      | Tailwind CSS                              |

---

## Project Structure

```
autoapply/
├── prisma/
│   ├── schema.prisma          # All DB models
│   └── seed.ts                # Dev seed data
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── auth/          # NextAuth handler
│   │   │   ├── cv/            # CV upload + parse
│   │   │   ├── jobs/          # Job search + run trigger
│   │   │   └── apply/         # Application management
│   │   ├── dashboard/         # Main dashboard (protected)
│   │   ├── profile/           # CV upload page
│   │   └── login/             # Auth page
│   ├── lib/
│   │   ├── prisma.ts          # DB client singleton
│   │   ├── claude.ts          # CV parser + job matcher
│   │   ├── crypto.ts          # AES-256 for stored passwords
│   │   └── queues.ts          # BullMQ queue definitions
│   ├── worker/
│   │   └── index.ts           # Background worker process
│   ├── scrapers/              # ← Phase 2 (LinkedIn, TanitJobs, Keejob)
│   ├── auth.ts                # NextAuth config
│   └── middleware.ts          # Route protection
```

---

## Setup

### 1. Prerequisites

```bash
node >= 18
postgresql running locally (or use a hosted DB)
redis running locally (or use Upstash)
```

### 2. Install dependencies

```bash
npm install

# Install Playwright browsers (for the automation bots)
npx playwright install chromium
```

### 3. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and fill in:
- `DATABASE_URL` — your PostgreSQL connection string
- `AUTH_SECRET` — run `openssl rand -base64 32`
- `ANTHROPIC_API_KEY` — get from console.anthropic.com
- `REDIS_URL` — your Redis URL
- `ENCRYPTION_KEY` — run `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

Optional (for OAuth login):
- `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` — from Google Cloud Console
- `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET` — from GitHub Developer Settings

### 4. Set up the database

```bash
npm run db:push      # Push schema to DB (dev)
npm run db:seed      # Seed with demo data
```

### 5. Run the app

```bash
# Terminal 1: Next.js dev server
npm run dev

# Terminal 2: Background worker (processes scrape + apply jobs)
npm run worker
```

Open [http://localhost:3000](http://localhost:3000)

---

## Phase Roadmap

| Phase | Status      | Description                                      |
|-------|-------------|--------------------------------------------------|
| 1     | ✅ Done      | Scaffold — Next.js, DB, auth, CV parser, queues |
| 2     | 🔜 Next      | LinkedIn Playwright scraper + Easy Apply bot    |
| 3     | 🔜 Upcoming  | TanitJobs scraper + form-fill bot               |
| 4     | 🔜 Upcoming  | Keejob scraper + form-fill bot                  |
| 5     | 🔜 Upcoming  | Full dashboard UI (job cards, stats, history)   |

---

## API Reference

| Method | Endpoint       | Description                        |
|--------|----------------|------------------------------------|
| POST   | /api/cv        | Upload & parse CV (multipart PDF)  |
| GET    | /api/cv        | Get current parsed profile         |
| GET    | /api/jobs      | List matched jobs                  |
| POST   | /api/jobs      | Trigger scrape + apply run         |
| GET    | /api/apply     | List all applications + stats      |
| POST   | /api/apply     | Manually queue an application      |

---

## Security Notes

- Platform passwords are encrypted with AES-256-GCM before storage
- Use a proper secrets manager (AWS Secrets Manager, HashiCorp Vault) in production
- Never commit `.env` to git — it's in `.gitignore`
- Run Playwright in headless mode with residential proxies in production to avoid blocks

---

## License

MIT
