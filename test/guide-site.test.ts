import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, test } from "node:test";
import { guideHTML } from "../scripts/guide-site.mjs";

describe("the user guide website", () => {
  test("renders the guide as a page whose pictures sit beside it", async () => {
    const markdown = await readFile(new URL("../assets/readme.md", import.meta.url), "utf8");
    const html = guideHTML(markdown);

    assert.match(html, /<h1 id="x-rayview">X-RayView<\/h1>/);
    assert.match(html, /<a href="#start-here">Start here<\/a>/);
    assert.match(html, /<img src="review-path\.png" alt="Four steps:/);
    assert.equal(html.includes("docs/review-path.png"), false);
    assert.equal(html.includes("<script"), false);
    assert.equal(await readFile(new URL("../docs/index.html", import.meta.url), "utf8"), html, "run npm run site");
  });

  test("the repository license is the one the extension ships", async () => {
    const shipped = await readFile(new URL("../assets/LICENSE.txt", import.meta.url), "utf8");
    const root = await readFile(new URL("../LICENSE", import.meta.url), "utf8");

    assert.equal(root, shipped);
    assert.match(root, /Copyright \(c\) 2026 Ali Qaryan/);
  });
});
