# Herbert Web

Herbert Web turns a text-based PDF into a concise, page-cited Chinese summary.

## Local development

Requirements: Node.js 22.13 or newer.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Add the Supabase public and server variables shown in `.env.example`, then run
`npm run db:migrate` once. Environment files are ignored by Git. Each reader
signs in and connects their own DeepSeek API key inside Herbert.

Open <http://localhost:3000> and upload a PDF that contains selectable text.

## Vercel previews

The Vercel project is linked to `Kevinzzz-hub/herbert` with `web` as its Root
Directory. Pushing a non-production branch creates a protected preview deployment.

Supabase project variables and `DEEPSEEK_MODEL` must be configured in the hosting
environment. Herbert's own deployment does not need a shared DeepSeek API key.

## How it works

1. The browser checks and extracts page-by-page text from the PDF.
2. Supabase Auth verifies the reader's login token.
3. The server retrieves that reader's encrypted DeepSeek key from Supabase Vault.
4. The server validates the extracted pages and divides the text into bounded chunks.
5. DeepSeek summarizes the chunks and synthesizes a final structured result.
6. Herbert validates the JSON and page citations before displaying the result.
7. Follow-up questions retrieve relevant pages and return grounded, page-cited answers.
8. The browser saves courses, extracted text, and completed summaries in IndexedDB.
9. A study request turns summary-backed pages into flashcards and a five-question quiz.

The original PDF is never saved. Extracted text is sent to the server only when
DeepSeek needs it for a summary, follow-up answer, or study pack. Courses,
extracted pages, and summaries are stored in that reader's browser with
IndexedDB and are isolated by the authenticated user ID. Records remain after a
restart but are tied to the same browser and origin; clearing site data removes
them. API keys are encrypted in Supabase Vault and never returned to the browser
after being saved.

## Verification

```bash
npm run build
node --test tests/rendered-html.test.mjs
npm audit --omit=dev
```

`npm run build` verifies the Sites/Cloudflare build. `npm run build:vercel`
verifies the same app with the native Next.js builder used by Vercel.

See [the Chinese learning guide](../docs/WEB_V1_GUIDE.zh-CN.md) for the design,
code map, security boundaries, and suggested exercises.

See [the question-answering module guide](../docs/QA_MODULE_GUIDE.zh-CN.md) for
the retrieval flow, validation rules, and acceptance checklist.

See [the study module guide](../docs/STUDY_MODULE_GUIDE.zh-CN.md) for the
flashcard and quiz data flow, validation rules, and acceptance checklist.

See [the local library guide](../docs/LOCAL_LIBRARY_GUIDE.zh-CN.md) for the
free-tier storage decision, IndexedDB data flow, limitations, and acceptance checklist.

See [the account and API key guide](../docs/AUTH_AND_API_KEY_GUIDE.zh-CN.md) for
the login flow, Vault security boundary, and bring-your-own-key product model.
