# Resume Generator

A Next.js 14 app for generating tailored resumes, cover letters, and interview answers from a job description and your saved profile data.

## What It Does

- Generate a resume tailored to the job description
- Switch between **Anthropic Claude** and **OpenAI GPT** per session/tab
- Keep multiple resume sessions open at the same time
- Save generated resumes and cover letters as PDFs on the server
- Generate interview question answers from the current resume context
- Show live provider state in the UI so each tab tracks its own selected model
- Use prompt caching for Anthropic requests to reduce repeated prompt cost

## Tech Stack

- Next.js 14 (App Router)
- React 18 + TypeScript
- Tailwind CSS
- Supabase for authentication and saved profile data
- Anthropic SDK for Claude
- OpenAI SDK for GPT
- Puppeteer for local PDF generation
- Mustache for HTML resume templates

## Features

### Resume generation
- Paste a job description and your existing resume content
- Select a template and provider per session
- Generate a tailored resume in JSON, then render it to PDF

### Cover letter generation
- Generate a short cover letter from the resume and job description
- Save the letter as a PDF on the server

### Interview Q&A
- Ask interview-style questions based on the generated resume
- Use the currently selected provider for the session

### Multi-session workflow
- Open several tabs/sessions at once
- Use Claude in one session and GPT in another
- Each tab remembers its own provider selection

### Cost controls
- Anthropic routes use prompt caching with `cache_control: { type: "ephemeral", ttl: "1h" }`
- OpenAI routes use the configured GPT model and support prompt caching automatically for recent models

## Environment Variables

Create a `.env.local` file in the project root:

```env
ANTHROPIC_API_KEY=your_anthropic_key
ANTHROPIC_MODEL=claude-sonnet-4-6
OPENAI_API_KEY=your_openai_key
OPENAI_MODEL=gpt-4.1-mini
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
# PDFSHIFT_API_KEY is optional and currently unused for local PDF generation
```

## Setup

1. Install dependencies:

```bash
npm install
```

2. Start the development server:

```bash
npm run dev
```

3. Open the app:

```text
http://localhost:3000
```

## Usage

1. Sign in with Supabase auth
2. Load or edit your saved profile information
3. Choose a provider and template for the current session
4. Paste a job description and your resume content
5. Generate the resume
6. Optionally create a cover letter or answer interview questions from the result view
7. Save PDFs to the server-generated `resume/` folder

## Project Structure

- `app/page.tsx` — main page, tab/session orchestration, provider legend
- `app/api/analyze/route.ts` — resume generation API
- `app/api/cover-letter/route.ts` — cover letter generation API
- `app/api/answer-questions/route.ts` — interview Q&A API
- `app/api/save-resume/route.ts` — server-side PDF saving
- `app/api/save-cover-letter/route.ts` — server-side cover-letter PDF saving
- `components/ResumeForm.tsx` — input form and provider/template selectors
- `components/ResultDisplay.tsx` — generated output, toasts, PDF/cover-letter actions
- `lib/prompts/resume-analyze-static.ts` — static resume prompt
- `templates/` — HTML resume templates used for PDF rendering

## Scripts

```bash
npm run dev
npm run build
npm run lint
npm run start
```

## Notes

- PDFs are generated locally with Puppeteer; no external PDF service is required.
- Resume and cover-letter downloads are handled server-side to avoid duplicate browser downloads.
- If you change providers in a tab, the tab keeps its own selection for future actions.
- If OpenAI is enabled, make sure `OPENAI_API_KEY` is set to a real key.

## License

No license file is currently included.

