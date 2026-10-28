/**
 * The release workflow's check and notes: a tag such as v0.5.1 must name the VERSION that scripts/manifest.mjs
 * packages, and the release notes are that version's section of assets/changelog.md.
 * `node scripts/release.mjs v0.5.1` prints the notes, or fails with what to fix.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { VERSION } from "./manifest.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPOSITORY = "Xanadupia/xrayviewer";

/**
 * The version a release tag names: 0.5.1 for v0.5.1.
 * @param {string} tag
 */
export function tagVersion(tag) {
  const match = /^v(\d+\.\d+\.\d+)$/.exec(tag);
  if (!match) throw new Error(`${tag} isn't a release tag. Release tags are v and the version, such as v${VERSION}.`);
  return match[1];
}

/**
 * One version's section of the changelog, without its heading.
 * @param {string} changelog
 * @param {string} version
 */
export function changelogSection(changelog, version) {
  const lines = changelog.replace(/\r\n/g, "\n").split("\n");
  const start = lines.findIndex((line) => line.trim() === `## ${version}`);
  if (start < 0) throw new Error(`assets/changelog.md has no "## ${version}" section.`);
  const next = lines.findIndex((line, i) => i > start && line.startsWith("## "));
  const section = lines.slice(start + 1, next < 0 ? undefined : next).join("\n").trim();
  if (!section) throw new Error(`The "## ${version}" section of assets/changelog.md is empty.`);
  return section;
}

/**
 * The GitHub release notes for a tag, after checking it against the packaged version and the changelog.
 * @param {string} tag
 * @param {string} changelog
 * @param {string} [version] the version scripts/manifest.mjs packages
 */
export function releaseNotes(tag, changelog, version = VERSION) {
  const tagged = tagVersion(tag);
  if (tagged !== version) throw new Error(`${tag} doesn't match VERSION ${version} in scripts/manifest.mjs. Raise VERSION, or tag v${version}.`);
  const vsix = `xrayviewer-${version}.vsix`;
  return `${changelogSection(changelog, version)}

## Install

- **VS Code:** search for **X-RayViewer** in the Extensions view, or run \`code --install-extension aliqaryan.xrayviewer\`.
- **Cursor:** download \`${vsix}\` below, then run \`cursor --install-extension ${vsix}\`, or **Extensions: Install from VSIX…**.

\`SHA256SUMS\` has the package's checksum. To check that this repository's release workflow built it: \`gh attestation verify ${vsix} -R ${REPOSITORY}\`.
`;
}

async function main() {
  const tag = process.argv[2];
  if (!tag) throw new Error("Usage: node scripts/release.mjs <tag>, such as v0.5.1");
  const changelog = await readFile(path.join(root, "assets", "changelog.md"), "utf8");
  process.stdout.write(releaseNotes(tag, changelog));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
