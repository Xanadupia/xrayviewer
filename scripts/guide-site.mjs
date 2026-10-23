/**
 * The user guide website: assets/readme.md rendered as one page for GitHub Pages (docs/index.html).
 * Image paths drop the `docs/` prefix because the page lives in that folder beside the pictures.
 * Each picture links to its full-size file, since screenshots shrink to the text column.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GUIDE = "https://xanadupia.github.io/xrayviewer";
const REPO = "https://github.com/Xanadupia/xrayviewer";

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function slug(text) {
  const id = text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return id || "section";
}

/** Inline markdown: code, pictures, links, and bold. Code is taken out first so the rest cannot match inside it. */
function inline(raw) {
  const codes = [];
  const held = raw.replace(/`([^`]+)`/g, (_, code) => {
    codes.push(code);
    return `\u0000${codes.length - 1}\u0000`;
  });
  let html = esc(held);
  html = html.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, src) => {
    const file = esc(src.replace(/^docs\//, ""));
    return `<a class="shot" href="${file}"><img src="${file}" alt="${alt}"></a>`;
  });
  html = html.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, text, href) => `<a href="${href}">${text}</a>`);
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  return html.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${esc(codes[Number(i)])}</code>`);
}

function isTable(line) {
  return line.startsWith("|") && line.endsWith("|");
}

function cells(line) {
  return line.split("|").slice(1, -1).map((cell) => cell.trim());
}

function isRule(line) {
  return /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(line);
}

/**
 * @param {string} markdown
 */
export function guideHTML(markdown) {
  const lines = markdown.replace(/\r\n/g, "\n").trim().split("\n");
  /** @type {string[]} */
  const blocks = [];
  /** @type {{ id: string, text: string, level: number }[]} */
  const headings = [];
  let i = 0;

  const paragraph = (text) => blocks.push(`<p>${inline(text)}</p>`);

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i += 1;
      continue;
    }
    const fence = /^```(\w*)\s*$/.exec(line);
    if (fence) {
      const code = [];
      i += 1;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        code.push(lines[i]);
        i += 1;
      }
      i += 1;
      const lang = fence[1] ? ` class="language-${fence[1]}"` : "";
      blocks.push(`<pre><code${lang}>${esc(code.join("\n"))}</code></pre>`);
      continue;
    }
    const heading = /^(#{1,3}) (.+)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const text = heading[2].trim();
      const id = slug(text);
      headings.push({ id, text, level });
      blocks.push(`<h${level} id="${id}">${inline(text)}</h${level}>`);
      i += 1;
      continue;
    }
    if (isTable(line)) {
      const rows = [];
      while (i < lines.length && isTable(lines[i])) {
        if (!isRule(lines[i])) rows.push(cells(lines[i]));
        i += 1;
      }
      const [head, ...body] = rows;
      const headHTML = (head || []).map((cell) => `<th>${inline(cell)}</th>`).join("");
      const bodyHTML = body.map((row) => `<tr>${row.map((cell) => `<td>${inline(cell)}</td>`).join("")}</tr>`).join("");
      blocks.push(`<div class="table-wrap"><table><thead><tr>${headHTML}</tr></thead><tbody>${bodyHTML}</tbody></table></div>`);
      continue;
    }
    if (/^[-*] /.test(line)) {
      const items = [];
      while (i < lines.length && /^[-*] /.test(lines[i])) {
        items.push(`<li>${inline(lines[i].slice(2))}</li>`);
        i += 1;
      }
      blocks.push(`<ul>${items.join("")}</ul>`);
      continue;
    }
    if (/^\d+\. /.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+\. /.test(lines[i])) {
        items.push(`<li>${inline(lines[i].replace(/^\d+\. /, ""))}</li>`);
        i += 1;
      }
      blocks.push(`<ol>${items.join("")}</ol>`);
      continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,3} |[-*] |\d+\. |```)/.test(lines[i]) && !isTable(lines[i])) {
      para.push(lines[i].trim());
      i += 1;
    }
    paragraph(para.join(" "));
  }

  const toc = headings
    .filter((heading) => heading.level === 2)
    .map((heading) => `<a href="#${heading.id}">${esc(heading.text)}</a>`)
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>X-RayViewer user guide</title>
  <meta name="description" content="Review GitHub pull requests in VS Code or Cursor. Agents run on your computer, and you post the review.">
  <link rel="canonical" href="${GUIDE}">
  <meta name="theme-color" content="#0F7668">
  <link rel="stylesheet" href="guide.css">
</head>
<body>
  <a class="skip" href="#guide">Skip to the guide</a>
  <header class="top">
    <a class="brand" href="./">X-RayViewer</a>
    <nav class="top-nav" aria-label="Site">
      <a href="${REPO}">Source</a>
      <a href="${REPO}/issues">Issues</a>
      <a href="${REPO}/blob/main/LICENSE">License</a>
    </nav>
  </header>
  <div class="layout">
    <nav class="toc" aria-label="Guide">${toc}</nav>
    <main id="guide">${blocks.join("\n")}</main>
  </div>
  <footer>
    <p>MIT. Copyright (c) 2026 Ali Qaryan.</p>
  </footer>
</body>
</html>
`;
}

async function main() {
  const markdown = await readFile(path.join(root, "assets", "readme.md"), "utf8");
  await writeFile(path.join(root, "docs", "index.html"), guideHTML(markdown));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
