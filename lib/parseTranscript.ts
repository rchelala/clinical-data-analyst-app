import JSZip from "jszip";

const NUMERIC_ENTITY_RE = /&#(\d+);/g;
const RUN_TEXT_RE = /<w:t[^>]*>([\s\S]*?)<\/w:t>/g;

function decodeXmlEntities(text: string): string {
  return text
    .replace(NUMERIC_ENTITY_RE, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function docxXmlToText(xml: string): string {
  const paragraphs = xml.split("</w:p>");
  const lines: string[] = [];

  for (const paragraph of paragraphs) {
    let runText = "";
    let match: RegExpExecArray | null;
    RUN_TEXT_RE.lastIndex = 0;
    while ((match = RUN_TEXT_RE.exec(paragraph)) !== null) {
      runText += match[1];
    }
    const decoded = decodeXmlEntities(runText);
    if (decoded.trim().length > 0) {
      lines.push(decoded);
    }
  }

  return lines.join("\n").trim();
}

async function parseDocx(file: File): Promise<string> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const documentXmlFile = zip.file("word/document.xml");
  if (!documentXmlFile) {
    throw new Error("This .docx doesn't look like a Word document.");
  }
  const xml = await documentXmlFile.async("string");
  return docxXmlToText(xml);
}

export async function parseTranscript(file: File): Promise<string> {
  const name = file.name.toLowerCase();

  if (name.endsWith(".txt") || name.endsWith(".vtt")) {
    return (await file.text()).trim();
  }

  if (name.endsWith(".docx")) {
    return parseDocx(file);
  }

  throw new Error("Unsupported file type. Upload a .docx, .vtt, or .txt transcript.");
}
