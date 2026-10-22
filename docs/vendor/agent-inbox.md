# Agent Inbox landing page provenance

`public/agent-inbox/index.html` is vendored byte-for-byte from the Agent Inbox
repository. It must remain unchanged so its source can be verified
deterministically.

The page may load files that Agent Inbox vendors next to it: the Three.js
modules behind its hero. Agent Inbox lists them, each with its SHA-256, in
`marketing/vendor/manifest.json`, and names the npm release each folder comes
from. The sync copies exactly the listed files from `marketing/<path>` to
`public/agent-inbox/<path>` and removes vendored files a newer revision no
longer lists. A revision without a manifest syncs `index.html` alone. It
refuses any revision where:

- a listed file's bytes differ from the manifest's SHA-256;
- a path is not a script (`.js`, `.mjs`), stylesheet (`.css`) or `LICENSE` under
  `vendor/`, or has a name test runners collect, such as `x.test.js`;
- a file is not one it can match to npm: only `three.module.js`,
  `three.core.js` and `LICENSE` in a `vendor/three-<version>/` folder whose
  manifest entry names `three@<version>`;
- the npm check fails. The sync fetches that release from
  registry.npmjs.org, requires the registry's `dist.tarball` and
  `dist.integrity` to equal the manifest's, checks the downloaded tarball's
  SHA-512 against that integrity, and requires each vendored file to be
  byte-identical to `package/build/three.module.js`,
  `package/build/three.core.js` or `package/LICENSE` in it.

An Agent Inbox commit therefore cannot change a vendored file and its manifest
hash together: the bytes must still equal the published npm release. Vendoring
any other package or file needs a reviewed change to
`scripts/vendor-agent-inbox-landing.ts`. Each vendored folder carries its own
license, such as Three.js's MIT `LICENSE`. Vitest excludes `public/**`, so
nothing synced there can run as a test.

The machine-readable source commit, source path, and SHA-256 live in
`vendor/agent-inbox-landing.json`, together with an `assets` list of each
vendored file's path and SHA-256 when the revision has any.

`.github/workflows/sync-agent-inbox-landing.yml` checks hourly for the newest
commit on Agent Inbox `main` that changed anything under `marketing/`. When the
source bytes or provenance change, it opens one normal blog-site pull request.
That pull request still runs CI, deploys a preview, receives both AI reviews,
and requires a human merge before production changes. Its body lists each
vendored file's SHA-256 and the npm release they matched.

The workflow keeps the owner token away from synced code. Its `sync` job runs
with a read-only `GITHUB_TOKEN` (`contents: read`, `pull-requests: read`) and
does everything that executes code: the sync script and its npm check,
`npm ci`, the tests, `astro check` and the build. It uploads the synced files
before installing dependencies. Only the `publish` job sees `AGENT_GH_TOKEN`,
and it runs no npm, Node, test or build tooling and no Git hooks
(`core.hooksPath=/dev/null`). It checks the artifact holds exactly the expected
files and their hashes, then commits, pushes the automation branch and opens or
tends the pull request.

Only one generated landing sync PR is active at a time. If Agent Inbox changes
again while one is open, the newer revision waits for the existing PR to be
merged or closed, then receives its own reviewed PR.

To check or refresh the vendored page locally:

```sh
npm run sync:agent-inbox-landing
```

To check any Agent Inbox commit, such as an unmerged pull request's head, without
writing anything, run the following. It downloads the page and every vendored
file, verifies them, and prints their SHA-256s.

```sh
npm run sync:agent-inbox-landing -- --inspect <full commit SHA>
```

Normal Astro builds never fetch Agent Inbox or GitHub. The updater runs only
when invoked directly or by its dedicated workflow.

## Upstream license

MIT License

Copyright (c) 2026 Shariq Hirani

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
