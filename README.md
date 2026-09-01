# Herbert

> An AI-powered PDF reading assistant.

Herbert helps readers understand long PDF documents by extracting their text and turning it into a clear, structured summary. The project is named in tribute to an outstanding librarian in American history.

## Why Herbert?

Long documents often leave readers unsure about the main argument, important ideas, and final conclusion. Herbert aims to make the first pass through a document faster and more focused.

## Web V1.0

The public web app is available at
<https://herbert-pdf-reader.vercel.app/>. V1.0 includes:

- passwordless email-code login;
- course workspaces containing multiple PDFs;
- page-cited summaries and document Q&A;
- course-wide retrieval and Q&A across PDFs;
- flashcards, quizzes, and saved study progress;
- local course backup and restore;
- per-user encrypted API credentials;
- DeepSeek, OpenAI, Gemini, Claude, and OpenRouter support.

## Error handling

- If the uploaded file is not a PDF, Herbert asks the user to upload another file.
- If no usable text can be extracted, Herbert explains that the PDF is not currently supported.

## Development setup

Herbert requires Python 3.10 or newer. Create an isolated virtual environment and
install the project with its development tools:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -e ".[dev]"
```

The virtual environment keeps Herbert's packages separate from other Python
projects. The editable installation (`-e`) means local source changes are used
without reinstalling the project.

## Command-line usage (V0)

The current V0 extracts text from a local, text-based PDF:

```bash
herbert path/to/document.pdf
```

Every page is kept traceable in the output:

```text
--- Page 1 ---
Extracted and conservatively cleaned text...
```

Save the extracted text to a UTF-8 text file:

```bash
herbert path/to/document.pdf --output extracted.txt
```

Compare the cleaned output with the original extracted text:

```bash
herbert path/to/document.pdf --raw --output raw.txt
```

Herbert reports pages with sparse text, possible garbled text, joined words,
unusual bullet encoding, and duplicate content. These warnings do not rewrite
or delete the source material; they identify pages that may need visual review.

Prepare bounded, page-traceable chunks for later AI processing:

```bash
herbert path/to/document.pdf --chunk-size 4000 --output chunks.txt
```

Herbert keeps a page whole whenever it fits. Only a page that exceeds the
chosen limit is divided, and continued fragments retain the source page number.

Run the automated tests:

```bash
python -m pytest
```

## Command-line DeepSeek summarization

Herbert uses DeepSeek's OpenAI-compatible API. The `openai` Python package is
only the protocol client here; requests are sent to `https://api.deepseek.com`.

Copy the safe example file and add your own key to the new `.env` file:

```bash
cp .env.example .env
```

```dotenv
DEEPSEEK_API_KEY=your_private_key_here
DEEPSEEK_MODEL=deepseek-v4-flash
```

Never paste the key into source code or commit `.env`. Herbert's `.gitignore`
keeps that private file out of Git.

Generate a page-cited Markdown summary:

```bash
herbert path/to/document.pdf --summarize --output summary.md
```

Herbert first summarizes each bounded text chunk, then makes one final request
to synthesize the document. For example, five chunks use six API requests.
This makes long documents manageable and keeps the original PDF page numbers
attached to the summary. A custom chunk size and model can also be selected:

```bash
herbert path/to/document.pdf --summarize --chunk-size 3000 \
  --model deepseek-v4-pro --output summary.md
```

The PDF text is treated as untrusted input: prompts inside a document are not
instructions for Herbert. AI output can still contain mistakes, so page
citations are included for verification.

## Web app (V1)

The browser version lives in `web/`. It parses the original PDF locally in the
browser, sends only validated extracted text to the server, and retrieves each
reader's encrypted AI credential only for authenticated server requests.

```bash
cd web
npm install
cp .env.example .env.local
npm run dev
```

Open <http://localhost:3000>, sign in, connect an AI provider, create a course,
and upload a text-based PDF.
See [`docs/WEB_V1_GUIDE.zh-CN.md`](docs/WEB_V1_GUIDE.zh-CN.md) for a Chinese
walkthrough of the architecture and each important source file.

## Not included in V1.0

- OCR for scanned PDFs;
- related-knowledge expansion;
- cloud synchronization of course content between devices;
- guaranteed email delivery across every mailbox provider;
- understanding charts, images, or complex layouts.

## Roadmap

- **V0 — Prototype (complete):** extract text from a local PDF and generate a summary.
- **V0.5 — Reading assistant (complete):** summaries, citations, Q&A, and study tools.
- **V0.7 — Course workspace (complete):** multi-PDF courses, retrieval, and backup.
- **V0.9 — Public beta (complete):** account isolation and multiple AI providers.
- **V1.0 — Public release:** tested, documented, backed up on GitHub, and deployed.

## Project status

Herbert V1.0 is publicly deployed. The original command-line prototype remains
available, while the web app is the primary product. Future work should be based
on real reader feedback rather than expanding the feature list by default.
