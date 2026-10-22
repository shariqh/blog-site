import { createHash, randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  opendir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { gunzipSync } from "node:zlib";

const SOURCE_REPOSITORY = "shariqh/agent-inbox";
const SOURCE_REPOSITORY_URL = `https://github.com/${SOURCE_REPOSITORY}`;
const SOURCE_DIRECTORY = "marketing";
const SOURCE_PATH = `${SOURCE_DIRECTORY}/index.html`;
const SOURCE_MANIFEST_PATH = `${SOURCE_DIRECTORY}/vendor/manifest.json`;
const SOURCE_REF = "main";
const SOURCE_LICENSE_PATH = "LICENSE";
const EXPECTED_LICENSE = "MIT";
const LANDING_DIRECTORY = "public/agent-inbox";
const LANDING_PATH = `${LANDING_DIRECTORY}/index.html`;
const ASSET_DIRECTORY = `${LANDING_DIRECTORY}/vendor`;
const METADATA_PATH = "vendor/agent-inbox-landing.json";
const FULL_SHA = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;
// Relative to the page in both repositories: a script, stylesheet or license at
// most three folders below vendor/. Every segment starts with a letter or digit,
// so no path can climb out of the vendor directory.
const ASSET_PATH =
  /^vendor(?:\/[A-Za-z0-9][A-Za-z0-9._-]*){0,3}\/(?:LICENSE|[A-Za-z0-9][A-Za-z0-9._-]*\.(?:js|mjs|css))$/;
// Names that test runners collect, such as x.test.js, x.bench.js or vitest's
// x.test-d.js type tests, are never vendored.
const TEST_NAME = /\.(?:test|spec|bench(?:mark)?)(?:-d)?\./i;
const MAX_ASSETS = 16;
// The only npm package the landing vendors, and the file in its tarball behind
// each vendored name. Vendoring anything else needs a reviewed change here.
const NPM_REGISTRY = "https://registry.npmjs.org";
const NPM_PACKAGE = "three";
const NPM_FILES: Readonly<Record<string, string>> = {
  "three.core.js": "package/build/three.core.js",
  "three.module.js": "package/build/three.module.js",
  LICENSE: "package/LICENSE",
};
const NPM_INTEGRITY = /^sha512-[A-Za-z0-9+/]{86}==$/;
const MAX_TARBALL_BYTES = 32_000_000;
const MAX_UNPACKED_BYTES = 128_000_000;
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_API_BYTES = 1_000_000;
const MAX_LANDING_BYTES = 1_000_000;
const MAX_ASSET_BYTES = 5_000_000;

export interface VendorAsset {
  path: string;
  sha256: string;
}

// An npm release whose tarball matched the registry and held every vendored file.
export interface NpmSource {
  package: string;
  integrity: string;
}

interface ManifestSource {
  directory: string;
  package: string;
  version: string;
  integrity: string;
}

export interface VendorMetadata {
  repository: string;
  sourcePath: string;
  sourceRef: string;
  commit: string;
  sha256: string;
  license: string;
  assets?: VendorAsset[];
}

export interface SyncResult {
  changed: boolean;
  commit: string;
  sha256: string;
  assets: VendorAsset[];
  npm: NpmSource[];
  files: string[];
}

export interface SourceInspection {
  commit: string;
  sha256: string;
  license: string;
  assets: VendorAsset[];
  npm: NpmSource[];
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
  // The landing is index.html plus its vendored files, so any change under
  // marketing/ is a new revision.
  url.searchParams.set("path", SOURCE_DIRECTORY);
  url.searchParams.set("per_page", "1");
  return url;
}

function rawSourceUrl(commit: string, sourcePath = SOURCE_PATH): URL {
  const path = sourcePath.split("/").map(encodeURIComponent).join("/");
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

async function send(
  fetchImpl: typeof fetch,
  url: URL,
  headers: HeadersInit,
  purpose: string,
): Promise<Response> {
  try {
    return await fetchImpl(url, {
      headers,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new Error(`Failed to ${purpose} from ${url.toString()}`, {
      cause: error,
    });
  }
}

function requireOk(response: Response, url: URL, purpose: string): Response {
  if (!response.ok) {
    throw new Error(
      `Failed to ${purpose} from ${url.toString()}: HTTP ${response.status}`,
    );
  }
  return response;
}

async function request(
  fetchImpl: typeof fetch,
  url: URL,
  token: string | undefined,
  purpose: string,
): Promise<Response> {
  return requireOk(
    await send(fetchImpl, url, requestHeaders(token), purpose),
    url,
    purpose,
  );
}

// The npm registry never receives the GitHub token.
async function requestNpm(
  fetchImpl: typeof fetch,
  url: URL,
  purpose: string,
): Promise<Response> {
  return requireOk(
    await send(
      fetchImpl,
      url,
      { "User-Agent": "shariqh-blog-site-agent-inbox-sync" },
      purpose,
    ),
    url,
    purpose,
  );
}

// Resolves to undefined for HTTP 404, how GitHub reports a path a commit lacks.
async function requestOptional(
  fetchImpl: typeof fetch,
  url: URL,
  token: string | undefined,
  purpose: string,
): Promise<Response | undefined> {
  const response = await send(fetchImpl, url, requestHeaders(token), purpose);
  if (response.status === 404) {
    await response.body?.cancel();
    return undefined;
  }
  return requireOk(response, url, purpose);
}

async function readLimitedBytes(
  response: Response,
  maximum: number,
  purpose: string,
): Promise<Uint8Array> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maximum) {
    const sizeError = new Error(
      `Refusing ${purpose}: declared response size ${declaredLength} exceeds ${maximum} bytes`,
    );
    if (response.body) {
      try {
        await response.body.cancel(sizeError);
      } catch (cancelError) {
        throw new AggregateError(
          [sizeError, cancelError],
          `Failed to cancel oversized response while attempting to ${purpose}`,
        );
      }
    }
    throw sizeError;
  }
  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > maximum) {
      throw new Error(`Refusing ${purpose}: response exceeds ${maximum} bytes`);
    }
    return bytes;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximum) {
        throw new Error(
          `Refusing ${purpose}: response exceeds ${maximum} bytes`,
        );
      }
      chunks.push(value);
    }
  } catch (error) {
    try {
      await reader.cancel(error);
    } catch (cancelError) {
      throw new AggregateError(
        [error, cancelError],
        `Failed to cancel response while attempting to ${purpose}`,
      );
    }
    throw error;
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function readJson(response: Response, purpose: string): Promise<unknown> {
  const bytes = await readLimitedBytes(response, MAX_API_BYTES, purpose);
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch (error) {
    throw new Error(
      `GitHub returned invalid JSON while attempting to ${purpose}`,
      {
        cause: error,
      },
    );
  }
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
  const payload = await readJson(
    response,
    "resolve the latest Agent Inbox landing commit",
  );
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
  return readLimitedBytes(
    response,
    MAX_LANDING_BYTES,
    "download the Agent Inbox landing page",
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function npmTarballUrl(version: string): string {
  return `${NPM_REGISTRY}/${NPM_PACKAGE}/-/${NPM_PACKAGE}-${version}.tgz`;
}

function parseVendorManifest(bytes: Uint8Array): {
  assets: VendorAsset[];
  sources: Map<string, ManifestSource>;
} {
  let payload: unknown;
  try {
    payload = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    );
  } catch (error) {
    throw new Error("The Agent Inbox vendor manifest is not valid JSON", {
      cause: error,
    });
  }
  if (
    !isRecord(payload) ||
    !Array.isArray(payload.files) ||
    payload.files.length === 0 ||
    payload.files.length > MAX_ASSETS
  ) {
    throw new Error(
      `The Agent Inbox vendor manifest must list 1 to ${MAX_ASSETS} files`,
    );
  }
  const assets = payload.files.map((entry: unknown, index: number) => {
    if (
      !isRecord(entry) ||
      typeof entry.path !== "string" ||
      !ASSET_PATH.test(entry.path) ||
      TEST_NAME.test(entry.path) ||
      typeof entry.sha256 !== "string" ||
      !SHA256.test(entry.sha256)
    ) {
      throw new Error(
        `The Agent Inbox vendor manifest has an invalid file entry at index ${index}`,
      );
    }
    return { path: entry.path, sha256: entry.sha256 };
  });
  // Paths that differ only in case, or a file that is also another file's
  // folder, cannot all be written.
  const folded = assets.map(({ path }) => path.toLowerCase());
  const conflict = folded.find(
    (path, index) =>
      folded.indexOf(path) !== index ||
      folded.some((other) => other.startsWith(`${path}/`)),
  );
  if (conflict !== undefined) {
    throw new Error(
      `The Agent Inbox vendor manifest lists conflicting paths at ${conflict}`,
    );
  }

  // Each folder names the npm release its files come from.
  const sources = new Map<string, ManifestSource>();
  const listedSources: unknown[] = Array.isArray(payload.sources)
    ? payload.sources
    : [];
  listedSources.forEach((entry, index) => {
    const version =
      isRecord(entry) && typeof entry.package === "string"
        ? /^three@(\d+\.\d+\.\d+)$/.exec(entry.package)?.[1]
        : undefined;
    const directory = `vendor/${NPM_PACKAGE}-${version}`;
    if (
      !isRecord(entry) ||
      version === undefined ||
      entry.directory !== directory ||
      entry.tarball !== npmTarballUrl(version) ||
      typeof entry.integrity !== "string" ||
      !NPM_INTEGRITY.test(entry.integrity) ||
      sources.has(directory)
    ) {
      throw new Error(
        `The Agent Inbox vendor manifest has an invalid npm source at index ${index}`,
      );
    }
    sources.set(directory, {
      directory,
      package: `${NPM_PACKAGE}@${version}`,
      version,
      integrity: entry.integrity,
    });
  });
  for (const { path } of assets) {
    const slash = path.lastIndexOf("/");
    if (
      !sources.has(path.slice(0, slash)) ||
      !Object.hasOwn(NPM_FILES, path.slice(slash + 1))
    ) {
      throw new Error(
        `Agent Inbox vendored file ${path} is not a ${NPM_PACKAGE} release file the sync can check against npm`,
      );
    }
  }
  return {
    assets: assets.sort((a, b) =>
      a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
    ),
    sources,
  };
}

// Reads the wanted files from a tar archive by their header names. Each must
// be a plain file listed once, because tar tools disagree about which of two
// copies wins. Headers that rename the next entry (PAX, GNU long names) are not
// read, so a file named only through one is never found and the check fails.
function readTarFiles(
  archive: Uint8Array,
  wanted: ReadonlySet<string>,
): Map<string, Uint8Array> {
  const decoder = new TextDecoder();
  const files = new Map<string, Uint8Array>();
  let offset = 0;
  while (offset + 512 <= archive.length) {
    const header = archive.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const text = (start: number, length: number) => {
      const field = header.subarray(start, start + length);
      const end = field.indexOf(0);
      return decoder.decode(end === -1 ? field : field.subarray(0, end));
    };
    const size = Number.parseInt(text(124, 12).trim() || "0", 8);
    const start = offset + 512;
    if (!Number.isSafeInteger(size) || start + size > archive.length) {
      throw new Error("The npm tarball has a damaged entry");
    }
    const prefix = text(345, 155);
    const name = prefix ? `${prefix}/${text(0, 100)}` : text(0, 100);
    if (wanted.has(name)) {
      if ((text(156, 1) || "0") !== "0" || files.has(name)) {
        throw new Error(
          `The npm tarball holds ${name} more than once or not as a plain file`,
        );
      }
      files.set(name, archive.subarray(start, start + size));
    }
    offset = start + Math.ceil(size / 512) * 512;
  }
  return files;
}

// Requires each vendored file to equal the same file in the npm release its
// folder names, after checking that release's tarball against the registry.
async function verifyNpmSources(
  downloads: Array<VendorAsset & { bytes: Uint8Array }>,
  sources: ReadonlyMap<string, ManifestSource>,
  fetchImpl: typeof fetch,
): Promise<NpmSource[]> {
  const verified: NpmSource[] = [];
  for (const source of sources.values()) {
    const assets = downloads.filter(({ path }) =>
      path.startsWith(`${source.directory}/`),
    );
    if (assets.length === 0) continue;
    const purpose = `check the vendored files against npm ${source.package}`;
    const release = await readJson(
      await requestNpm(
        fetchImpl,
        new URL(`${NPM_REGISTRY}/${NPM_PACKAGE}/${source.version}`),
        purpose,
      ),
      purpose,
    );
    const dist =
      isRecord(release) && isRecord(release.dist) ? release.dist : undefined;
    if (
      !isRecord(release) ||
      release.name !== NPM_PACKAGE ||
      release.version !== source.version ||
      dist?.tarball !== npmTarballUrl(source.version) ||
      dist.integrity !== source.integrity
    ) {
      throw new Error(
        `The npm registry does not list ${source.package} with the vendor manifest's tarball and integrity`,
      );
    }
    const tarball = await readLimitedBytes(
      await requestNpm(
        fetchImpl,
        new URL(npmTarballUrl(source.version)),
        purpose,
      ),
      MAX_TARBALL_BYTES,
      purpose,
    );
    const integrity = `sha512-${createHash("sha512").update(tarball).digest("base64")}`;
    if (integrity !== source.integrity) {
      throw new Error(
        `The npm tarball for ${source.package} does not match the registry's integrity`,
      );
    }
    const files = readTarFiles(
      gunzipSync(tarball, { maxOutputLength: MAX_UNPACKED_BYTES }),
      new Set(Object.values(NPM_FILES)),
    );
    for (const asset of assets) {
      const member = NPM_FILES[asset.path.slice(source.directory.length + 1)]!;
      const bytes = files.get(member);
      if (!bytes || sha256(bytes) !== asset.sha256) {
        throw new Error(
          `Agent Inbox vendored file ${asset.path} does not match ${member} in npm ${source.package}`,
        );
      }
    }
    verified.push({ package: source.package, integrity: source.integrity });
  }
  return verified;
}

// Downloads each file the source commit's vendor manifest lists, checks it
// against the manifest's SHA-256, then against the npm release it names.
async function fetchSourceAssets(
  commit: string,
  fetchImpl: typeof fetch,
  token: string | undefined,
): Promise<{
  downloads: Array<VendorAsset & { bytes: Uint8Array }>;
  npm: NpmSource[];
}> {
  const purpose = "download the Agent Inbox vendor manifest";
  const manifest = await requestOptional(
    fetchImpl,
    rawSourceUrl(commit, SOURCE_MANIFEST_PATH),
    token,
    purpose,
  );
  // A revision from before the landing vendored any files is index.html alone.
  if (!manifest) return { downloads: [], npm: [] };
  const { assets: listed, sources } = parseVendorManifest(
    await readLimitedBytes(manifest, MAX_API_BYTES, purpose),
  );
  const downloads: Array<VendorAsset & { bytes: Uint8Array }> = [];
  for (const asset of listed) {
    const assetPurpose = `download the Agent Inbox vendored file ${asset.path}`;
    const response = await request(
      fetchImpl,
      rawSourceUrl(commit, `${SOURCE_DIRECTORY}/${asset.path}`),
      token,
      assetPurpose,
    );
    const bytes = await readLimitedBytes(
      response,
      MAX_ASSET_BYTES,
      assetPurpose,
    );
    if (sha256(bytes) !== asset.sha256) {
      throw new Error(
        `Agent Inbox vendored file ${asset.path} does not match its manifest SHA-256`,
      );
    }
    downloads.push({ ...asset, bytes });
  }
  return {
    downloads,
    npm: await verifyNpmSources(downloads, sources, fetchImpl),
  };
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
  const payload = await readJson(
    response,
    "verify the Agent Inbox source license",
  );
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
    if (isMissing(error)) {
      return undefined;
    }
    throw error;
  }
}

function isMissing(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

// A landing folder must be a real directory, never a link to somewhere else.
async function requireDirectory(
  rootDir: string,
  relativePath: string,
): Promise<void> {
  try {
    if (!(await lstat(resolve(rootDir, relativePath))).isDirectory()) {
      throw new Error(`${relativePath} must be a directory`);
    }
  } catch (error) {
    if (!isMissing(error)) throw error;
  }
}

// Whether the vendored folder already holds exactly these files, as plain
// files. It reads no entry but a plain file of the expected size, and stops
// after more entries than a synced folder can have.
async function vendorMatches(
  rootDir: string,
  downloads: Array<VendorAsset & { bytes: Uint8Array }>,
): Promise<boolean> {
  const target = resolve(rootDir, ASSET_DIRECTORY);
  const expected = new Map(
    downloads.map(({ path, bytes }) => [
      resolve(rootDir, LANDING_DIRECTORY, path),
      bytes,
    ]),
  );
  try {
    if (!(await lstat(target)).isDirectory()) return false;
  } catch (error) {
    if (isMissing(error)) return expected.size === 0;
    throw error;
  }
  const pending = [target];
  let entries = 0;
  let matched = 0;
  for (let directory = pending.pop(); directory; directory = pending.pop()) {
    // opendir() reads entries as it goes, so the limit bounds the work.
    for await (const entry of await opendir(directory)) {
      entries += 1;
      if (entries > 4 * MAX_ASSETS) return false;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        pending.push(path);
        continue;
      }
      const bytes = expected.get(path);
      if (!entry.isFile() || !bytes) return false;
      if ((await lstat(path)).size !== bytes.byteLength) return false;
      if (!equalBytes(await readFile(path), bytes)) return false;
      matched += 1;
    }
  }
  return matched === expected.size;
}

interface VendorSwap {
  apply(): Promise<void>;
  undo(): Promise<void>;
  removeBackup(): Promise<void>;
  removeStage(): Promise<void>;
}

// Writes the vendored files into a new folder that then replaces the vendored
// folder by rename. Nothing is written through an existing path, and files a
// revision no longer lists leave with the old folder.
async function stageVendor(
  rootDir: string,
  downloads: Array<VendorAsset & { bytes: Uint8Array }>,
): Promise<VendorSwap> {
  const landing = resolve(rootDir, LANDING_DIRECTORY);
  const target = resolve(rootDir, ASSET_DIRECTORY);
  const id = `${process.pid}.${randomUUID()}`;
  const staged = join(landing, `.vendor.${id}.tmp`);
  const backup = join(landing, `.vendor.${id}.old`);
  await mkdir(landing, { recursive: true });
  if (downloads.length > 0) {
    await mkdir(staged);
    try {
      for (const { path, bytes } of downloads) {
        const file = join(staged, relative("vendor", path));
        await mkdir(dirname(file), { recursive: true });
        await writeFile(file, bytes, { flag: "wx" });
      }
    } catch (error) {
      await rm(staged, { recursive: true, force: true });
      throw error;
    }
  }
  let movedAside = false;
  let placed = false;
  return {
    async apply() {
      try {
        await rename(target, backup);
        movedAside = true;
      } catch (error) {
        if (!isMissing(error)) throw error;
      }
      if (downloads.length > 0) {
        await rename(staged, target);
        placed = true;
      }
    },
    async undo() {
      if (placed) {
        await rm(target, { recursive: true, force: true });
        placed = false;
      }
      if (movedAside) {
        await rename(backup, target);
        movedAside = false;
      }
    },
    async removeBackup() {
      if (movedAside) await rm(backup, { recursive: true, force: true });
    },
    async removeStage() {
      await rm(staged, { recursive: true, force: true });
    },
  };
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
  try {
    await writeFile(temporary, write.bytes);
    return temporary;
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
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

async function loadSourceRevision(
  commit: string,
  fetchImpl: typeof fetch,
  token: string | undefined,
): Promise<
  SourceInspection & {
    landing: Uint8Array;
    downloads: Array<VendorAsset & { bytes: Uint8Array }>;
  }
> {
  const license = await verifySourceLicense(commit, fetchImpl, token);
  const landing = await fetchSourceBytes(commit, fetchImpl, token);
  const { downloads, npm } = await fetchSourceAssets(commit, fetchImpl, token);
  return {
    commit,
    sha256: sha256(landing),
    license,
    assets: downloads.map(({ path, sha256: digest }) => ({
      path,
      sha256: digest,
    })),
    npm,
    landing,
    downloads,
  };
}

export async function inspectSourceCommit(
  commit: string,
  fetchImpl: typeof fetch = fetch,
  token = process.env.GITHUB_TOKEN,
): Promise<SourceInspection> {
  const {
    landing: _landing,
    downloads: _downloads,
    ...inspection
  } = await loadSourceRevision(commit, fetchImpl, token);
  return inspection;
}

export async function syncAgentInboxLanding({
  rootDir = process.cwd(),
  fetchImpl = fetch,
  token = process.env.GITHUB_TOKEN,
}: SyncOptions = {}): Promise<SyncResult> {
  const commit = await resolveSourceCommit(fetchImpl, token);
  const {
    landing,
    license,
    sha256: digest,
    assets,
    npm,
    downloads,
  } = await loadSourceRevision(commit, fetchImpl, token);
  const metadata: VendorMetadata = {
    repository: SOURCE_REPOSITORY_URL,
    sourcePath: SOURCE_PATH,
    sourceRef: SOURCE_REF,
    commit,
    sha256: digest,
    license,
    // A source without vendored files keeps the original metadata shape.
    ...(assets.length > 0 ? { assets } : {}),
  };
  const metadataBytes = new TextEncoder().encode(
    `${JSON.stringify(metadata, null, 2)}\n`,
  );
  const candidates = [
    { relativePath: LANDING_PATH, bytes: landing },
    { relativePath: METADATA_PATH, bytes: metadataBytes },
  ];
  const writes: PlannedWrite[] = [];

  await requireDirectory(rootDir, "public");
  await requireDirectory(rootDir, LANDING_DIRECTORY);
  for (const candidate of candidates) {
    const path = resolve(rootDir, candidate.relativePath);
    const current = await readOptional(path);
    if (!equalBytes(current, candidate.bytes)) {
      writes.push({ ...candidate, path, current });
    }
  }
  const vendor = (await vendorMatches(rootDir, downloads))
    ? undefined
    : await stageVendor(rootDir, downloads);
  try {
    await vendor?.apply();
    await replaceWrites(writes);
  } catch (error) {
    const cleanupErrors: unknown[] = [];
    for (const step of [() => vendor?.undo(), () => vendor?.removeStage()]) {
      try {
        await step();
      } catch (cleanupError) {
        cleanupErrors.push(cleanupError);
      }
    }
    if (cleanupErrors.length > 0) {
      throw new AggregateError(
        [error, ...cleanupErrors],
        "Failed to update and roll back the Agent Inbox landing files",
      );
    }
    throw error;
  }
  await vendor?.removeStage();
  await vendor?.removeBackup();

  const files = [
    ...writes.map(({ relativePath }) => relativePath),
    ...(vendor ? [ASSET_DIRECTORY] : []),
  ].sort();
  return {
    changed: files.length > 0,
    commit,
    sha256: digest,
    assets,
    npm,
    files,
  };
}

function isMainModule(): boolean {
  return Boolean(
    process.argv[1] &&
    import.meta.url === pathToFileURL(resolve(process.argv[1])).href,
  );
}

if (isMainModule()) {
  const inspectIndex = process.argv.indexOf("--inspect");
  const operation =
    inspectIndex >= 0
      ? inspectSourceCommit(process.argv[inspectIndex + 1] ?? "")
      : syncAgentInboxLanding();
  operation
    .then((result) => {
      if (process.argv.includes("--json")) {
        console.log(JSON.stringify(result));
        return;
      }
      if ("changed" in result) {
        console.log(
          result.changed
            ? `Updated Agent Inbox landing from ${result.commit}`
            : `Agent Inbox landing already matches ${result.commit}`,
        );
      } else {
        console.log(
          `Agent Inbox landing ${result.commit} is ${result.license} with SHA-256 ${result.sha256}`,
        );
        for (const asset of result.assets) {
          console.log(`Vendored ${asset.path} has SHA-256 ${asset.sha256}`);
        }
        for (const source of result.npm) {
          console.log(
            `Every vendored file matches npm ${source.package} (${source.integrity})`,
          );
        }
      }
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
