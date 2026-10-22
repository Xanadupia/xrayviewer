import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import { transformManifest, VERSION } from "./manifest.mjs";
import { applyPatches, UI_ADDED_NAMES, UI_PATCHES } from "./patches.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const vendor = path.join(root, "vendor", "base");
const assets = path.join(root, "assets");
export const outDir = path.join(root, "build", "extension");
export const vsixPath = path.join(root, "build", `xrayviewer-${VERSION}.vsix`);


async function verifyVendor() {
  const sums = await readFile(path.join(root, "vendor", "base.sha256"), "utf8");
  for (const line of sums.trim().split("\n")) {
    const [expected, file] = line.split(/\s+/, 2);
    const actual = createHash("sha256").update(await readFile(path.join(vendor, file))).digest("hex");
    if (actual !== expected) throw new Error(`vendor/base/${file} changed: sha256 ${actual}, expected ${expected}.`);
  }
}

async function rewrite(file, transform) {
  await writeFile(file, transform(await readFile(file, "utf8")), "utf8");
}

export async function buildExtension(target = outDir) {
  await verifyVendor();
  await rm(target, { recursive: true, force: true });
  await mkdir(path.dirname(target), { recursive: true });
  await cp(vendor, target, { recursive: true });
  await cp(assets, target, { recursive: true });
  await cp(path.join(root, "docs"), path.join(target, "docs"), {
    recursive: true,
    filter: (src) => !["index.html", "guide.css", ".nojekyll"].includes(path.basename(src)),
  });

  await rewrite(path.join(target, "dist", "extension.cjs"), (text) => applyPatches(text));
  await rewrite(path.join(target, "media", "ui", "app.js"), (text) => applyPatches(text, UI_PATCHES, UI_ADDED_NAMES));
  const appleUi = await readFile(path.join(root, "scripts", "apple-ui.css"), "utf8");
  await rewrite(path.join(target, "media", "ui", "styles.css"), (text) => `${text}\n${appleUi}`);
  await rewrite(path.join(target, "package.json"), (text) => `${JSON.stringify(transformManifest(JSON.parse(text)), null, 2)}\n`);

  await build({
    entryPoints: [path.join(root, "src", "index.ts")],
    outfile: path.join(target, "dist", "cursor-harness.cjs"),
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node20",
    logLevel: "warning",
  });

  for (const file of ["dist/extension.cjs", "dist/cursor-harness.cjs"]) {
    execFileSync(process.execPath, ["--check", path.join(target, file)]);
  }
  return target;
}

export function packageExtension() {
  execFileSync(
    path.join(root, "node_modules", ".bin", "vsce"),
    ["package", "--no-dependencies", "--out", vsixPath],
    { cwd: outDir, stdio: "inherit" },
  );
  return vsixPath;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await buildExtension();
  console.log(`Built ${path.relative(root, outDir)}`);
  if (process.argv.includes("--package")) console.log(`Packaged ${path.relative(root, packageExtension())}`);
}
