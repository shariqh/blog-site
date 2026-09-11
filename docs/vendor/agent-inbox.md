# Agent Inbox landing page provenance

`public/agent-inbox/index.html` is vendored byte-for-byte from the Agent Inbox
repository. It must remain unchanged so its source can be verified
deterministically.

- Repository: <https://github.com/shariqh/agent-inbox>
- Source path: `marketing/index.html`
- Commit: `a924a78e5539c63c92b110b6201d4245ff5e8c98`
- SHA-256: `0105c90e8555fe219e43bcdf87382add01141030b85f23abaf648750eb717dcf`

To update it, choose and review a new upstream commit, then copy the pinned Git
object rather than the upstream worktree:

```sh
git -C /path/to/agent-inbox show <commit>:marketing/index.html > public/agent-inbox/index.html
shasum -a 256 public/agent-inbox/index.html
```

Update the commit and hash here and in
`src/lib/agent-inbox-landing.test.ts` in the same change.

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
