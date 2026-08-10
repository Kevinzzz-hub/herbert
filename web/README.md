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

## How it works

1. The browser checks and extracts page-by-page text from the PDF.
2. The server validates the extracted pages and divides the text into bounded chunks.
3. DeepSeek summarizes the chunks and synthesizes a final structured result.
4. Herbert validates the JSON and page citations before displaying the result.

The original PDF remains in the browser. Only extracted text is sent for the
one-time summary. Herbert does not currently provide accounts or reading history.

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
