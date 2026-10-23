# Publishing X-RayViewer

A release is a version tag. Pushing `v0.5.1` runs `.github/workflows/release.yml`: it builds and tests that commit, creates the GitHub release with the package, then publishes the same file to the Visual Studio Marketplace and Open VSX once you approve.

The extension id is `aliqaryan.xrayviewer`. The publisher id is part of that id forever, so the publisher in both galleries is `aliqaryan`.

The repository is public. Both galleries link the listing, the pictures in the guide, and the issues page to `https://github.com/Xanadupia/xrayviewer`. The user guide is at `https://xanadupia.github.io/xrayviewer`.

The listing stays marked **Preview** while `preview` is true in `scripts/manifest.mjs`. Set it to false when a release should drop that label.

## Cut a release

1. Raise `VERSION` in `scripts/manifest.mjs`.
2. Add a `## 0.5.1` section at the top of `assets/CHANGELOG.md`. It becomes the release notes.
3. Commit to `main`, and wait for CI to pass.
4. Tag that commit and push the tag:

```sh
git tag -a v0.5.1 -m "X-RayViewer 0.5.1"
git push origin v0.5.1
```

5. Open the run under **Actions → Release**, press **Review deployments**, and approve `marketplace`. Both galleries publish from there.

The workflow stops before building when the tag doesn't match `VERSION` or the changelog has no section for it. Rerunning a failed job reuses the same package: the GitHub release's files are replaced, and a gallery that already has the version skips it.

Each release has `xrayviewer-0.5.1.vsix`, `SHA256SUMS`, and a build provenance attestation. Anyone can check that this workflow built the package:

```sh
gh attestation verify xrayviewer-0.5.1.vsix -R Xanadupia/xrayviewer
```

## One-time setup

The two publish jobs run in the `marketplace` environment under **Settings → Environments**. It waits for a required reviewer, and only `v*` tags can deploy to it. Each gallery's credential lives there. A gallery without one is skipped with a warning on the run, and its package is still on the GitHub release to upload by hand.

### Visual Studio Marketplace

Use one of these. Microsoft's [publishing guide](https://code.visualstudio.com/api/working-with-extensions/publishing-extension) has the details.

- **Microsoft Entra ID**, which doesn't expire. In a tenant you own, create a user-assigned managed identity or an app registration. Give it a federated credential for GitHub Actions with the subject `repo:Xanadupia/xrayviewer:environment:marketplace`. Add the identity to the `aliqaryan` publisher at [marketplace.visualstudio.com/manage](https://marketplace.visualstudio.com/manage/publishers/aliqaryan) with the Contributor role. Then set the environment variables `AZURE_CLIENT_ID` and `AZURE_TENANT_ID`. The job signs in with `azure/login` and publishes with `vsce publish --azure-credential`.
- **A personal access token**, until December 1, 2026, when Azure DevOps retires global tokens. Create one for **All accessible organizations** with the **Marketplace (Manage)** scope, and save it as the environment secret `VSCE_PAT`.

When both are set, Entra ID is used.

### Open VSX, which Cursor searches

1. Create an Eclipse account that uses the same GitHub username, sign the Open VSX Publisher Agreement, and create an access token. The steps are in the [Open VSX publishing guide](https://github.com/eclipse-openvsx/openvsx/wiki/Publishing-Extensions).
2. Create the namespace once: `npx ovsx create-namespace aliqaryan -p <token>`.
3. Save the token as the environment secret `OVSX_PAT`. The next release publishes there.
4. Submit the extension at [cursor.com/marketplace/publish](https://cursor.com/marketplace/publish). Cursor reviews the publisher and the code before it shows up in search.

To drop the token after the first version is live, claim the namespace, then add a trusted publisher under **Settings → Trusted Publishers** on open-vsx.org: owner `Xanadupia`, repository `xrayviewer`, workflow `release.yml`, environment `marketplace`. Set the environment variable `OPEN_VSX_TRUSTED_PUBLISHING` to `true` and delete `OVSX_PAT`, since a token takes precedence. The [trusted publishing guide](https://github.com/eclipse-openvsx/openvsx/wiki/Trusted-Publishing) has the requirements.

## By hand

When the workflow can't publish, download the package from the GitHub release, or build it from a clean checkout of the tag:

```sh
npm ci
npm test
npm run package
```

Then upload `build/xrayviewer-0.5.1.vsix` at the Marketplace management page, and run `npx ovsx publish build/xrayviewer-0.5.1.vsix -p <token>` for Open VSX.

## What the package already contains

`scripts/manifest.mjs` sets the publisher, the version, the MIT license, the 256×256 icon, the repository, the issues page, the user-guide homepage, a license badge, and the Preview flag. The extension root ships `readme.md`, `changelog.md`, and `LICENSE.txt`. The user guide's pictures and website stay in `docs/` in this repository and are not inside the package. `vsce` points the readme's pictures at their GitHub copies on `main`, so a picture the Marketplace page shows must stay there until a release that no longer uses it.
