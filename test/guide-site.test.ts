import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, test } from "node:test";
import { guideHTML } from "../scripts/guide-site.mjs";

describe("the user guide website", () => {
  test("renders the guide as a page whose pictures sit beside it", async () => {
    const markdown = await readFile(new URL("../assets/readme.md", import.meta.url), "utf8");
    const html = guideHTML(markdown);

    assert.match(html, /<h1 id="x-rayviewer">X-RayViewer<\/h1>/);
    assert.match(html, /<a href="#your-first-review">Your first review<\/a>/);
    assert.match(html, /<a class="shot" href="hero\.png"><img src="hero\.png" alt="X-RayViewer in VS Code:/);
    assert.equal(html.includes("docs/hero.png"), false);
    assert.match(html, /<pre><code class="language-yaml">agents:\n  migrations:\n/);
    assert.equal(html.includes("<script"), false);
    assert.equal(await readFile(new URL("../docs/index.html", import.meta.url), "utf8"), html, "run npm run site");
  });

  test("keeps a fenced block as written, escaped, with its blank lines", () => {
    const html = guideHTML("# Guide\n\nBefore\n```sh\na <b>\n\nb\n```\nAfter");

    assert.match(html, /<p>Before<\/p>\n<pre><code class="language-sh">a &lt;b&gt;\n\nb<\/code><\/pre>\n<p>After<\/p>/);
  });

  test("the repository license is the one the extension ships", async () => {
    const shipped = await readFile(new URL("../assets/LICENSE.txt", import.meta.url), "utf8");
    const root = await readFile(new URL("../LICENSE", import.meta.url), "utf8");

    assert.equal(root, shipped);
    assert.match(root, /Copyright \(c\) 2026 Ali Qaryan/);
  });
});
