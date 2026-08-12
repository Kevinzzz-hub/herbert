# Herbert Web

Herbert Web turns a text-based PDF into a concise, page-cited Chinese summary.

## Local development

Requirements: Node.js 22.13 or newer.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Add a private `DEEPSEEK_API_KEY` to `.env.local`. Environment files are ignored
by Git and the key is read only inside the server route.

Open <http://localhost:3000> and upload a PDF that contains selectable text.

## Vercel previews

The Vercel project is linked to `Kevinzzz-hub/herbert` with `web` as its Root
Directory. Pushing a non-production branch creates a protected preview deployment.

`DEEPSEEK_API_KEY` and `DEEPSEEK_MODEL` are configured in Vercel's Preview
environment. Keep API keys in Vercel or a local ignored environment file; never
commit them to Git.

## How it works

1. The browser checks and extracts page-by-page text from the PDF.
2. The server validates the extracted pages and divides the text into bounded chunks.
3. DeepSeek summarizes the chunks and synthesizes a final structured result.
4. Herbert validates the JSON and page citations before displaying the result.
5. Follow-up questions retrieve relevant pages and return grounded, page-cited answers.
6. A study request turns summary-backed pages into flashcards and a five-question quiz.

The original PDF remains in the browser. Only extracted text is sent for the
summary, follow-up answers, and study materials. Herbert does not currently provide accounts or
saved reading history.

## Verification

```bash
npm run build
DEEPSEEK_API_KEY= node --test tests/rendered-html.test.mjs
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
