# Capstone Milestone — OPM to Code

Next.js 14 + Supabase auth. Deployment test for the capstone milestone.

## 1. Supabase setup

1. Go to https://supabase.com → New project (free tier).
2. In the project dashboard, go to **Project Settings → API**. Copy:
   - `Project URL`
   - `anon public` key
3. (Optional, for demo) **Authentication → Providers → Email**: disable "Confirm email" so signups log in immediately.

## 2. Local run

```bash
cp .env.local.example .env.local
# edit .env.local and paste your URL + anon key
npm install
npm run dev
```

Open http://localhost:3000

## 3. Deploy to Vercel

1. Create a GitHub repo and push this folder.
2. Go to https://vercel.com → **Add New → Project** → import the repo.
3. In **Environment Variables**, add:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Click **Deploy**.

## Pages

- `/` — landing
- `/login`, `/signup` — email + password
- `/dashboard` — protected, shows user email
