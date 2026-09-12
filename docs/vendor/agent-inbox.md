# Agent Inbox landing page provenance

`public/agent-inbox/index.html` is vendored byte-for-byte from the Agent Inbox
repository. It must remain unchanged so its source can be verified
deterministically.

The machine-readable source commit, source path, and SHA-256 live in
`vendor/agent-inbox-landing.json`.

`.github/workflows/sync-agent-inbox-landing.yml` checks hourly for the newest
commit on Agent Inbox `main` that changed `marketing/index.html`. When the
source bytes or provenance change, it opens one normal blog-site pull request.
That pull request still runs CI, deploys a preview, receives both AI reviews,
and requires a human merge before production changes.

To check or refresh the vendored page locally:

```sh
npm run sync:agent-inbox-landing
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
