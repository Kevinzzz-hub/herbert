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

## Not included in the first version

- OCR for scanned PDFs;
- related-knowledge expansion;
- follow-up questions about the document;
- user accounts and reading history;
- understanding charts, images, or complex layouts.

## Roadmap

- **V0 — Prototype:** extract text from a local PDF and generate a summary.
- **V1 — Web app:** upload a PDF and read its summary in a browser.
- **V2 — Reliable summaries:** support longer documents, citations, and better error handling.
- **V3 — Reading assistant:** add document Q&A and carefully sourced knowledge expansion.
- **V4 — Product release:** add tests, deployment, documentation, and a public demo.

## Project status

Herbert is currently in the planning and learning stage. Development decisions and progress will be recorded in this repository.
