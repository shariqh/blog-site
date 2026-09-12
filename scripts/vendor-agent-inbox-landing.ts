import { createHash, randomUUID } from "node:crypto";
import {
  mkdir,
  open,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const SOURCE_REPOSITORY = "shariqh/agent-inbox";
const SOURCE_REPOSITORY_URL = `https://github.com/${SOURCE_REPOSITORY}`;
const SOURCE_PATH = "marketing/index.html";
const SOURCE_REF = "main";
const SOURCE_LICENSE_PATH = "LICENSE";
const EXPECTED_LICENSE = "MIT";
const LANDING_PATH = "public/agent-inbox/index.html";
const METADATA_PATH = "vendor/agent-inbox-landing.json";
const LOCK_PATH = ".agent-inbox-landing-sync.lock";
const STALE_LOCK_MS = 30 * 60 * 1000;
const FULL_SHA = /^[a-f0-9]{40}$/;

export interface VendorMetadata {
  repository: string;
  sourcePath: string;
  sourceRef: string;
  commit: string;
  sha256: string;
  license: string;
}

export interface SyncResult {
  changed: boolean;
  commit: string;
  sha256: string;
  files: string[];
}

interface SyncOptions {
  rootDir?: string;
  fetchImpl?: typeof fetch;
  token?: string;
}

interface PlannedWrite {
  relativePath: string;
  path: string;
  bytes: Uint8Array;
  current?: Uint8Array;
}

function commitApiUrl(): URL {
  const url = new URL(
    `https://api.github.com/repos/${SOURCE_REPOSITORY}/commits`,
  );
  url.searchParams.set("sha", SOURCE_REF);
  url.searchParams.set("path", SOURCE_PATH);
  url.searchParams.set("per_page", "1");
  return url;
}

function rawSourceUrl(commit: string): URL {
  const path = SOURCE_PATH.split("/").map(encodeURIComponent).join("/");
  return new URL(
    `https://raw.githubusercontent.com/${SOURCE_REPOSITORY}/${commit}/${path}`,
  );
}

function licenseApiUrl(commit: string): URL {
  const url = new URL(
    `https://api.github.com/repos/${SOURCE_REPOSITORY}/license`,
  );
  url.searchParams.set("ref", commit);
  return url;
}

function requestHeaders(token?: string): HeadersInit {
  return {
    Accept: "application/vnd.github+json",
    "User-Agent": "shariqh-blog-site-agent-inbox-sync",
    "X-GitHub-Api-Version": "2022-11-28",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function request(
  fetchImpl: typeof fetch,
  url: URL,
  token: string | undefined,
  purpose: string,
): Promise<Response> {
  let response: Response;
  try {
    response = await fetchImpl(url, { headers: requestHeaders(token) });
  } catch (error) {
    throw new Error(`Failed to ${purpose} from ${url.toString()}`, {
      cause: error,
    });
  }
  if (!response.ok) {
    throw new Error(
      `Failed to ${purpose} from ${url.toString()}: HTTP ${response.status}`,
    );
  }
  return response;
}

export async function resolveSourceCommit(
  fetchImpl: typeof fetch = fetch,
  token = process.env.GITHUB_TOKEN,
): Promise<string> {
  const response = await request(
    fetchImpl,
    commitApiUrl(),
    token,
    "resolve the latest Agent Inbox landing commit",
  );
  const payload: unknown = await response.json();
  if (
    !Array.isArray(payload) ||
    payload.length !== 1 ||
    typeof payload[0] !== "object" ||
    payload[0] === null ||
    !("sha" in payload[0]) ||
    typeof payload[0].sha !== "string" ||
    !FULL_SHA.test(payload[0].sha)
  ) {
    throw new Error(
      "GitHub did not return one valid commit for the Agent Inbox landing page",
    );
  }
  return payload[0].sha;
}

export async function fetchSourceBytes(
  commit: string,
  fetchImpl: typeof fetch = fetch,
  token = process.env.GITHUB_TOKEN,
): Promise<Uint8Array> {
  if (!FULL_SHA.test(commit)) {
    throw new Error(`Invalid Agent Inbox source commit: ${commit}`);
  }
  const response = await request(
    fetchImpl,
    rawSourceUrl(commit),
    token,
    "download the Agent Inbox landing page",
  );
  return new Uint8Array(await response.arrayBuffer());
}

export async function verifySourceLicense(
  commit: string,
  fetchImpl: typeof fetch = fetch,
  token = process.env.GITHUB_TOKEN,
): Promise<string> {
  if (!FULL_SHA.test(commit)) {
    throw new Error(`Invalid Agent Inbox source commit: ${commit}`);
  }
  const response = await request(
    fetchImpl,
    licenseApiUrl(commit),
    token,
    "verify the Agent Inbox source license",
  );
  const payload: unknown = await response.json();
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("path" in payload) ||
    payload.path !== SOURCE_LICENSE_PATH ||
    !("license" in payload) ||
    typeof payload.license !== "object" ||
    payload.license === null ||
    !("spdx_id" in payload.license) ||
    payload.license.spdx_id !== EXPECTED_LICENSE
  ) {
    throw new Error(
      `Agent Inbox commit ${commit} is not published under the expected ${EXPECTED_LICENSE} license`,
    );
  }
  return EXPECTED_LICENSE;
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function readOptional(path: string): Promise<Uint8Array | undefined> {
  try {
    return await readFile(path);
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return undefined;
    }
    throw error;
  }
}

async function writeAtomic(path: string, bytes: Uint8Array): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, bytes);
    await rename(temporary, path);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

function equalBytes(
  current: Uint8Array | undefined,
  next: Uint8Array,
): boolean {
  return Boolean(
    current &&
    current.byteLength === next.byteLength &&
    current.every((value, index) => value === next[index]),
  );
}

async function stageWrite(write: PlannedWrite): Promise<string> {
  await mkdir(dirname(write.path), { recursive: true });
  const temporary = `${write.path}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, write.bytes);
  return temporary;
}

async function replaceWrites(writes: PlannedWrite[]): Promise<void> {
  const staged: Array<{ write: PlannedWrite; temporary: string }> = [];
  try {
    for (const write of writes) {
      staged.push({ write, temporary: await stageWrite(write) });
    }
  } catch (error) {
    await Promise.all(
      staged.map(({ temporary }) => rm(temporary, { force: true })),
    );
    throw error;
  }

  const replaced: PlannedWrite[] = [];
  try {
    for (const { write, temporary } of staged) {
      await rename(temporary, write.path);
      replaced.push(write);
    }
  } catch (error) {
    const rollbackErrors: unknown[] = [];
    for (const write of replaced.reverse()) {
      try {
        if (write.current) {
          await writeAtomic(write.path, write.current);
        } else {
          await rm(write.path, { force: true });
        }
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    }
    if (rollbackErrors.length > 0) {
      throw new AggregateError(
        [error, ...rollbackErrors],
        "Failed to update and roll back the Agent Inbox landing files",
      );
    }
    throw error;
  } finally {
    await Promise.all(
      staged.map(({ temporary }) => rm(temporary, { force: true })),
    );
  }
}

async function withSyncLock<T>(
  rootDir: string,
  operation: () => Promise<T>,
): Promise<T> {
  await mkdir(rootDir, { recursive: true });
  const lockPath = resolve(rootDir, LOCK_PATH);
  let lock;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      lock = await open(lockPath, "wx");
      break;
    } catch (error) {
      if (
        typeof error !== "object" ||
        error === null ||
        !("code" in error) ||
        error.code !== "EEXIST"
      ) {
        throw error;
      }
      if (attempt === 0 && (await staleLock(lockPath))) {
        await rm(lockPath, { force: true });
        continue;
      }
      throw new Error(
        `Another Agent Inbox landing sync is already running (${lockPath})`,
      );
    }
  }
  if (!lock) throw new Error(`Failed to acquire sync lock: ${lockPath}`);

  try {
    await lock.writeFile(
      `${JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() })}\n`,
    );
    return await operation();
  } finally {
    await lock.close();
    await rm(lockPath, { force: true });
  }
}

async function staleLock(lockPath: string): Promise<boolean> {
  let modifiedAt: number;
  let content: string;
  try {
    const [details, bytes] = await Promise.all([
      stat(lockPath),
      readFile(lockPath, "utf8"),
    ]);
    modifiedAt = details.mtimeMs;
    content = bytes;
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return true;
    }
    throw error;
  }

  const fileAge = Date.now() - modifiedAt;
  let owner: unknown;
  try {
    owner = JSON.parse(content);
  } catch {
    return fileAge >= STALE_LOCK_MS;
  }
  if (
    typeof owner !== "object" ||
    owner === null ||
    !("pid" in owner) ||
    !Number.isSafeInteger(owner.pid) ||
    typeof owner.pid !== "number" ||
    owner.pid <= 0 ||
    !("startedAt" in owner) ||
    typeof owner.startedAt !== "string"
  ) {
    return fileAge >= STALE_LOCK_MS;
  }

  const startedAt = Date.parse(owner.startedAt);
  if (Number.isFinite(startedAt) && Date.now() - startedAt >= STALE_LOCK_MS) {
    return true;
  }
  try {
    process.kill(owner.pid, 0);
    return false;
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ESRCH"
    ) {
      return true;
    }
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "EPERM"
    ) {
      return false;
    }
    throw error;
  }
}

export async function syncAgentInboxLanding({
  rootDir = process.cwd(),
  fetchImpl = fetch,
  token = process.env.GITHUB_TOKEN,
}: SyncOptions = {}): Promise<SyncResult> {
  return withSyncLock(rootDir, async () => {
    const commit = await resolveSourceCommit(fetchImpl, token);
    const license = await verifySourceLicense(commit, fetchImpl, token);
    const landing = await fetchSourceBytes(commit, fetchImpl, token);
    const digest = sha256(landing);
    const metadata: VendorMetadata = {
      repository: SOURCE_REPOSITORY_URL,
      sourcePath: SOURCE_PATH,
      sourceRef: SOURCE_REF,
      commit,
      sha256: digest,
      license,
    };
    const metadataBytes = new TextEncoder().encode(
      `${JSON.stringify(metadata, null, 2)}\n`,
    );
    const candidates = [
      { relativePath: LANDING_PATH, bytes: landing },
      { relativePath: METADATA_PATH, bytes: metadataBytes },
    ];
    const writes: PlannedWrite[] = [];

    for (const candidate of candidates) {
      const path = resolve(rootDir, candidate.relativePath);
      const current = await readOptional(path);
      if (!equalBytes(current, candidate.bytes)) {
        writes.push({ ...candidate, path, current });
      }
    }
    await replaceWrites(writes);

    return {
      changed: writes.length > 0,
      commit,
      sha256: digest,
      files: writes.map(({ relativePath }) => relativePath),
    };
  });
}

function isMainModule(): boolean {
  return Boolean(
    process.argv[1] &&
    import.meta.url === pathToFileURL(resolve(process.argv[1])).href,
  );
}

if (isMainModule()) {
  syncAgentInboxLanding()
    .then((result) => {
      if (process.argv.includes("--json")) {
        console.log(JSON.stringify(result));
        return;
      }
      console.log(
        result.changed
          ? `Updated Agent Inbox landing from ${result.commit}`
          : `Agent Inbox landing already matches ${result.commit}`,
      );
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
