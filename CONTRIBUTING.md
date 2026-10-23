# Contributing

Issues and pull requests are welcome at [github.com/Xanadupia/xrayviewer](https://github.com/Xanadupia/xrayviewer/issues).

```sh
npm install
npm test
npm run typecheck
```

CI runs the type check, the tests, and packaging on Linux and macOS for every pull request.

A change to the user guide in `assets/readme.md` also needs `npm run site`, which rewrites `docs/index.html`. The test fails when that page is behind the guide.

The extension is the bundle in `vendor/base/` plus a small set of edits. `vendor/base/` stays as it is; the build checks it against `vendor/base.sha256`. New behavior goes in `src/` or in an anchor in `scripts/patches.mjs`. Each anchor has to match the vendor file exactly once.

Keep both copyright lines in `LICENSE`.
