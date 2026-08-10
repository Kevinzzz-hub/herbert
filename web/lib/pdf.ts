import { extractText, getDocumentProxy } from "unpdf";
import {
  cleanPageText,
  HerbertWebError,
  MAX_FILE_BYTES,
  MAX_PAGES,
  MAX_TEXT_CHARACTERS,
  type TextPage,
} from "./herbert";

export async function extractPdf(file: File): Promise<TextPage[]> {
  if (file.size > MAX_FILE_BYTES) {
    throw new HerbertWebError("FILE_TOO_LARGE", "文件超过 12 MB，请上传更小的 PDF。");
  }
  if (!file.name.toLowerCase().endsWith(".pdf")) {
    throw new HerbertWebError("NOT_PDF", "这不是 PDF 文件，请重新上传。");
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const signature = new TextDecoder("ascii").decode(bytes.slice(0, 5));
  if (signature !== "%PDF-") {
    throw new HerbertWebError("NOT_PDF", "文件内容不是有效的 PDF，请重新上传。");
  }

  try {
    const document = await getDocumentProxy(bytes);
    if (document.numPages > MAX_PAGES) {
      throw new HerbertWebError("TOO_LONG", `当前版本最多支持 ${MAX_PAGES} 页 PDF。`);
    }
    const extracted = await extractText(document, { mergePages: false });
    const pages = extracted.text.map((text, index) => ({
      pageNumber: index + 1,
      text: cleanPageText(text),
    }));
    const totalCharacters = pages.reduce((total, page) => total + page.text.length, 0);
    if (totalCharacters < 100) {
      throw new HerbertWebError(
        "UNSUPPORTED_PDF",
        "此 PDF 暂不适用。它可能是扫描图片，请重新上传可复制文字的 PDF。",
      );
    }
    if (totalCharacters > MAX_TEXT_CHARACTERS) {
      throw new HerbertWebError(
        "TOO_LONG",
        "这份 PDF 的文字量超过当前版本限制，请先拆分后再上传。",
      );
    }
    return pages;
  } catch (error) {
    if (error instanceof HerbertWebError) throw error;
    throw new HerbertWebError(
      "UNSUPPORTED_PDF",
      "此 PDF 暂不适用。文件可能已损坏、加密或无法提取文字，请重新上传。",
    );
  }
}
