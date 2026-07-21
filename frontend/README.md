Real Estate Proposal Engine — frontend (Next.js App Router, TypeScript, Tailwind).

See the top-level [README](../README.md) for the full project, architecture, and setup instructions.

## Local development

```bash
npm install
cp .env.example .env.local   # point NEXT_PUBLIC_API_BASE_URL at the backend
npm run dev
```

Requires the backend (`../backend`) running at the URL configured in `.env.local` (defaults to `http://localhost:8000`).
