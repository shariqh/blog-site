import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const SOURCE_REPOSITORY = "shariqh/agent-inbox";
const SOURCE_REPOSITORY_URL = `https://github.com/${SOURCE_REPOSITORY}`;
const SOURCE_PATH = "marketing/index.html";
const SOURCE_REF = "main";
const LICENSE = "MIT";
const LANDING_PATH = "public/agent-inbox/index.html";
const METADATA_PATH = "vendor/agent-inbox-landing.json";
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

async function writeIfChanged(
  rootDir: string,
  relativePath: string,
  bytes: Uint8Array,
): Promise<boolean> {
  const path = resolve(rootDir, relativePath);
  const current = await readOptional(path);
  if (
    current &&
    current.byteLength === bytes.byteLength &&
    current.every((value, index) => value === bytes[index])
  ) {
    return false;
  }
  await writeAtomic(path, bytes);
  return true;
}

export async function syncAgentInboxLanding({
  rootDir = process.cwd(),
  fetchImpl = fetch,
  token = process.env.GITHUB_TOKEN,
}: SyncOptions = {}): Promise<SyncResult> {
  const commit = await resolveSourceCommit(fetchImpl, token);
  const landing = await fetchSourceBytes(commit, fetchImpl, token);
  const digest = sha256(landing);
  const metadata: VendorMetadata = {
    repository: SOURCE_REPOSITORY_URL,
    sourcePath: SOURCE_PATH,
    sourceRef: SOURCE_REF,
    commit,
    sha256: digest,
    license: LICENSE,
  };
  const metadataBytes = new TextEncoder().encode(
    `${JSON.stringify(metadata, null, 2)}\n`,
  );
  const files: string[] = [];

  if (await writeIfChanged(rootDir, LANDING_PATH, landing)) {
    files.push(LANDING_PATH);
  }
  if (await writeIfChanged(rootDir, METADATA_PATH, metadataBytes)) {
    files.push(METADATA_PATH);
  }

  return { changed: files.length > 0, commit, sha256: digest, files };
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
