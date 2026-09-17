const NUMERIC_ENTITY_RE = /&#(\d+);/g;
const HEX_ENTITY_RE = /&#x([0-9a-fA-F]+);/g;

// Matches, in document order: <w:t>...</w:t> / <w:t xml:space="preserve">...</w:t>
// text runs, and the self-closing <w:tab/>, <w:br/>, <w:cr/> whitespace markers.
// The `(?:\s[^>]*)?` after each tag name requires the next character to be
// whitespace or the tag close, so `<w:t` never matches `<w:tbl>`, `<w:tr>`,
// `<w:tc>`, `<w:tcPr>`, etc. — those table elements are simply skipped, along
// with their own raw XML, since nothing in this regex matches them.
const TOKEN_RE = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab(?:\s[^>]*)?\/>|<w:br(?:\s[^>]*)?\/>|<w:cr(?:\s[^>]*)?\/>/g;

// <w:pPr> (paragraph properties) can contain a <w:tabs> block whose
// <w:tab w:val="..." w:pos="..."/> tab-STOP DEFINITIONS are also
// self-closing `<w:tab .../>` elements — they match TOKEN_RE's tab-character
// branch just as well as a real <w:tab/> whitespace marker, which would
// inject stray leading tabs into the text. Strip the whole <w:pPr> block
// before tokenising so only actual run content is scanned. (<w:rPr> — run
// properties — holds only formatting elements like <w:rFonts>/<w:b/>/<w:sz>,
// none of which match TOKEN_RE, so it doesn't need the same treatment.)
const PARAGRAPH_PROPERTIES_RE = /<w:pPr>[\s\S]*?<\/w:pPr>/g;

function decodeXmlEntities(text: string): string {
  return text
    .replace(HEX_ENTITY_RE, (_, code: string) => String.fromCharCode(parseInt(code, 16)))
    .replace(NUMERIC_ENTITY_RE, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&"); // decode last so "&amp;lt;" (literal "&lt;" text) isn't double-decoded to "<"
}

function paragraphToText(paragraph: string): string {
  const withoutParagraphProperties = paragraph.replace(PARAGRAPH_PROPERTIES_RE, "");
  let text = "";
  let match: RegExpExecArray | null;
  TOKEN_RE.lastIndex = 0;
  while ((match = TOKEN_RE.exec(withoutParagraphProperties)) !== null) {
    if (match[1] !== undefined) {
      // <w:t>...</w:t> run — check capture group, not a string prefix, since
      // "<w:tab/>" also starts with "<w:t".
      text += match[1];
    } else if (match[0].startsWith("<w:tab")) {
      text += "\t";
    } else {
      // <w:br/> or <w:cr/>
      text += "\n";
    }
  }
  return text;
}

function docxXmlToText(xml: string): string {
  const paragraphs = xml.split("</w:p>");
  const lines: string[] = [];

  for (const paragraph of paragraphs) {
    const decoded = decodeXmlEntities(paragraphToText(paragraph));
    if (decoded.trim().length > 0) {
      lines.push(decoded);
    }
  }

  return lines.join("\n").trim();
}

async function parseDocx(file: File): Promise<string> {
  const JSZip = (await import("jszip")).default;
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
