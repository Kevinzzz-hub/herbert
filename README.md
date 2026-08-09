# Herbert

> An AI-powered PDF reading assistant.

Herbert helps readers understand long PDF documents by extracting their text and turning it into a clear, structured summary. The project is named in tribute to an outstanding librarian in American history.

## Why Herbert?

Long documents often leave readers unsure about the main argument, important ideas, and final conclusion. Herbert aims to make the first pass through a document faster and more focused.

## MVP

The first version will:

1. Accept a text-based PDF upload.
2. Check whether the uploaded file is a PDF.
3. Extract text from the document.
4. Generate an AI-assisted structured summary.
5. Display the summary to the reader.

The summary will contain:

- a one-sentence overview;
- three to seven key points;
- the author's main conclusion;
- concepts worth paying attention to.

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

## Current usage

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

## DeepSeek summarization

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

## Not included in the first version

- OCR for scanned PDFs;
- related-knowledge expansion;
- follow-up questions about the document;
- user accounts and reading history;
- understanding charts, images, or complex layouts.

## Roadmap

- **V0 — Prototype (in progress):** extract text from a local PDF and generate a summary.
- **V1 — Web app:** upload a PDF and read its summary in a browser.
- **V2 — Reliable summaries:** support longer documents, citations, and better error handling.
- **V3 — Reading assistant:** add document Q&A and carefully sourced knowledge expansion.
- **V4 — Product release:** add tests, deployment, documentation, and a public demo.

## Project status

Herbert is currently in V0 development. PDF validation, text extraction, a
command-line interface, and automated tests are implemented locally. Development
decisions and progress will be recorded in this repository.
