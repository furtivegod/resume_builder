# Resume Generator

A Next.js 14 app for generating tailored resumes, cover letters, and interview answers from a job description and your saved profile data.

## What It Does

- Generate a resume tailored to the job description
- Switch between **Anthropic Claude**, **OpenAI GPT**, and **Deepseek** per session
- Keep multiple resume sessions open at the same time
- Save generated resumes and job descriptions to **Supabase Storage**
- Track job bids on the **History** page with bid status
- Record interviews linked to job bids on the **Interviews** page
- Save cover letters as JSON in cloud storage
- Download resume PDFs in the browser after generation

## Tech Stack

- Next.js 14 (App Router)
- React 18 + TypeScript
- Tailwind CSS
- Supabase (auth, Postgres, Storage)
- Anthropic SDK, OpenAI SDK
- Puppeteer for server-side PDF generation
- Mustache for HTML resume templates

## Data Model

Profile data lives in normalized Supabase tables:

- `profiles` — name, contact, summary, default settings (template, jobsite)
- `user_educations`, `user_certifications`, `user_projects`, `user_companies`
- `resumes` — job bid metadata + Storage paths
- `interviews` — interview records linked to resumes

Storage paths:

- `{userId}/jds/{resumeId}.txt` — job description
- `{userId}/resumes/{resumeId}.json` — generated resume JSON
- `{userId}/cover-letters/{resumeId}.json` — cover letter JSON

Legacy `user_preferences` is read as a fallback when normalized tables are empty (no migration script required).

## Environment Variables

Create a `.env.local` file:

```env
ANTHROPIC_API_KEY=your_anthropic_key
ANTHROPIC_MODEL=claude-sonnet-4-6
OPENAI_API_KEY=your_openai_key
OPENAI_MODEL=gpt-4.1-mini
DEEPSEEK_API_KEY=your_deepseek_key
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

AI routes require a signed-in user (Bearer JWT). User data uses the anon key with RLS — no service role needed for profile or resume CRUD.

## Setup

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Usage

1. Sign in with Supabase auth
2. Fill in your profile at `/profile` and click **Save**
3. On the home page, choose AI model and jobsite, paste job details
4. Generate a resume — it is saved to cloud storage automatically
5. Download PDF, generate/save cover letter JSON, or practice interview Q&A
6. View past bids at `/history` and track interviews at `/interviews`

## Project Structure

- `app/page.tsx` — home, multi-session resume builder
- `app/profile/page.tsx` — profile editor (one global Save)
- `app/history/page.tsx` — resume / job bid history
- `app/interviews/page.tsx` — interview history
- `app/api/analyze/route.ts` — AI resume generation (auth required)
- `app/api/cover-letter/route.ts` — cover letter generation (auth required)
- `app/api/answer-questions/route.ts` — interview Q&A (auth required)
- `lib/supabase/` — types, loaders, Storage helpers, CRUD services
- `lib/mappers/` — profile ↔ resume transformations, legacy fallback
- `components/ResumeForm.tsx`, `components/ResultDisplay.tsx`

## Scripts

```bash
npm run dev
npm run build
npm run lint
npm run start
```

## Notes

- PDFs are generated server-side with Puppeteer; download happens in the browser.
- Cover letters are stored as JSON in Supabase Storage (not local disk).
- Skills UI is not implemented yet; skills from DB are included in generation when present.

## License

No license file is currently included.
