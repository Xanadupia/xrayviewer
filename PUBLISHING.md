# Publishing X-RayView

The package is ready for both galleries. These are the steps that still need a person, because each one needs an account.

The extension id is `aliqaryan.xrayview`. The publisher id is part of that id forever, so the publisher created below has to be named `aliqaryan`.

The repository is public. Both galleries link the listing, the pictures in the guide, and the issues page to `https://github.com/Xanadupia/xrayviewer`. The user guide is at `https://xanadupia.github.io/xrayviewer`.

The listing stays marked **Preview** while `preview` is true in `scripts/manifest.mjs`. Set it to false when the release should drop that label, then package again.

## Before either gallery

From a clean checkout of `main`:

```sh
npm install
npm test
npm run typecheck
npm run package
```

`npm run package` writes `build/xrayview-0.4.1.vsix`. Raise `VERSION` in `scripts/manifest.mjs` before every later release, then package that new file. Publish the same file to both galleries.

## Visual Studio Marketplace

This is the gallery VS Code searches.

1. Create a publisher named `aliqaryan` at [marketplace.visualstudio.com/manage](https://marketplace.visualstudio.com/manage). A verified publisher needs a domain. The extension can be published before that.
2. Create a publish credential. Microsoft is retiring global personal access tokens for this gallery. The [publishing guide](https://code.visualstudio.com/api/working-with-extensions/publishing-extension) describes the Entra ID and OIDC options.
3. Publish the file:

```sh
npx vsce login aliqaryan
npx vsce publish --packagePath build/xrayview-0.4.1.vsix
```

The management page can also take an upload of that file.

## Open VSX, which Cursor searches

1. Create an Eclipse account that uses the same GitHub username, sign the Open VSX Publisher Agreement, and create an access token. The steps are in the [Open VSX publishing guide](https://github.com/eclipse-openvsx/openvsx/wiki/Publishing-Extensions).
2. Create the namespace once, then publish the same file:

```sh
npx ovsx create-namespace aliqaryan -p "$OVSX_PAT"
npx ovsx publish build/xrayview-0.4.1.vsix -p "$OVSX_PAT"
```

3. Submit it at [cursor.com/marketplace/publish](https://cursor.com/marketplace/publish). Cursor reviews the publisher and the code before the extension shows up in search.

## What the package already contains

`scripts/manifest.mjs` sets the publisher, the version, the MIT license, the 256×256 icon, the repository, the issues page, the user-guide homepage, a license badge, and the Preview flag. The extension root ships `readme.md`, `changelog.md`, and `LICENSE.txt`. The user guide's pictures ship in `docs/`. The website HTML stays in this repository and is not inside the package.
