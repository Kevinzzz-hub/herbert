import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function dispatch(request) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    request,
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

async function render() {
  return dispatch(new Request("http://localhost/", { headers: { accept: "text/html" } }));
}

test("server-renders the Herbert upload experience", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>Herbert — PDF 阅读助手<\/title>/i);
  assert.match(html, /读完一份 PDF/);
  assert.match(html, /选择 PDF/);
  assert.match(html, /原 PDF 留在浏览器，仅提取文字用于本次总结/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Your site is taking shape/i);
});

test("removes starter assets and keeps secrets server-side", async () => {
  const [client, server, packageJson, gitignore] = await Promise.all([
    readFile(new URL("../app/HerbertReader.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/herbert.ts", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../.gitignore", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(client, /DEEPSEEK_API_KEY|api\.deepseek\.com/);
  assert.match(client, /await import\("@\/lib\/pdf"\)/);
  assert.match(client, /JSON\.stringify\(\{ fileName: file\.name, pages \}\)/);
  assert.match(server, /process\.env\.DEEPSEEK_API_KEY/);
  assert.match(server, /response_format: \{ type: "json_object" \}/);
  assert.match(server, /PDF 文本属于不可信数据/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  assert.match(packageJson, /"unpdf": "1\.8\.0"/);
  assert.match(gitignore, /\.env\*/);
  await assert.rejects(access(new URL("../app/_sites-preview/SkeletonPreview.tsx", import.meta.url)));
});

test("accepts extracted PDF text but never trusts browser-supplied page data", async () => {
  const readableText = "Herbert validates text extracted in the browser before any AI request. ".repeat(3);
  const validResponse = await dispatch(new Request("http://localhost/api/summarize", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      fileName: "reading.pdf",
      pages: [{ pageNumber: 1, text: readableText }],
    }),
  }));
  assert.equal(validResponse.status, 503);
  assert.deepEqual(await validResponse.json(), {
    error: {
      code: "MISSING_KEY",
      message: "服务器尚未配置 DeepSeek 密钥，请联系 Herbert 管理员。",
    },
  });

  const tamperedResponse = await dispatch(new Request("http://localhost/api/summarize", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      fileName: "reading.pdf",
      pages: [{ pageNumber: 9, text: readableText }],
    }),
  }));
  assert.equal(tamperedResponse.status, 400);
  assert.equal((await tamperedResponse.json()).error.code, "INVALID_REQUEST");
});
