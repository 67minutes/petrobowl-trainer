import { describe, expect, it } from "vitest";
import { extractFigureImage } from "@/lib/import/glossary-images";

describe("extractFigureImage", () => {
  it("returns the absolute figure URL and decoded caption", () => {
    const html =
      '<div><img src="/-/media/publicmedia/ogl98014.gif?sc_lang=en" alt="Synclines &amp; anticlines" /></div>';
    expect(extractFigureImage(html)).toEqual({
      url: "https://glossary.slb.com/-/media/publicmedia/ogl98014.gif?sc_lang=en",
      caption: "Synclines & anticlines"
    });
  });

  it("returns a null caption when alt is empty", () => {
    const html = '<img src="/-/media/publicmedia/ogl99087.gif?sc_lang=en" alt="" >';
    expect(extractFigureImage(html)).toEqual({
      url: "https://glossary.slb.com/-/media/publicmedia/ogl99087.gif?sc_lang=en",
      caption: null
    });
  });

  it("ignores non-content images (logos, icons)", () => {
    const html =
      '<img src="/-/media/slb/logo.svg" alt="logo"><img src="/assets/icon.png" alt="icon">';
    expect(extractFigureImage(html)).toBeNull();
  });

  it("returns null when the page has no figure", () => {
    expect(extractFigureImage("<html><body>text only</body></html>")).toBeNull();
  });

  it("keeps already-absolute URLs unchanged", () => {
    const html =
      '<img alt="Fault" src="https://glossary.slb.com/-/media/publicmedia/ogl98058.jpg?sc_lang=en">';
    expect(extractFigureImage(html)?.url).toBe(
      "https://glossary.slb.com/-/media/publicmedia/ogl98058.jpg?sc_lang=en"
    );
  });
});
