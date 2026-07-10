export type GlossaryFigure = {
  url: string;
  caption: string | null;
};

const GLOSSARY_HOST = "https://glossary.slb.com";

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&#039;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function absolutize(src: string): string {
  if (/^https?:\/\//i.test(src)) {
    return src;
  }
  return `${GLOSSARY_HOST}${src.startsWith("/") ? "" : "/"}${src}`;
}

// Extracts the term's figure from an SLB glossary page. Content diagrams/photos are
// served from the /-/media/publicmedia/ path (logos and nav icons are not), so that
// path is used as the selector. Returns the absolute image URL and its alt caption,
// or null when the page has no figure.
export function extractFigureImage(html: string): GlossaryFigure | null {
  const match = /<img\b[^>]*\bsrc="([^"]*\/-\/media\/publicmedia\/[^"]+)"[^>]*>/i.exec(html);
  if (!match) {
    return null;
  }
  const alt = /\balt="([^"]*)"/i.exec(match[0])?.[1] ?? "";
  const caption = decodeEntities(alt);
  return {
    url: absolutize(match[1]),
    caption: caption.length > 0 ? caption : null
  };
}
