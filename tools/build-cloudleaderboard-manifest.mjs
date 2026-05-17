import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const resultRoot = root;
const mockRoot = path.join(root, "cloudleadboard_data", "mock_raw_results");
const outputPath = path.join(root, "cloudleadboard_data", "results_manifest.json");

const caseFolders = [
  "cloud_insert",
  "cloud_payload_search",
  "cloud_multi_tenant_search",
  "cloud_cold_latency",
];

async function walk(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walk(full));
    } else if (/^result_.*\.json$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

async function readCaseId(file) {
  try {
    const json = JSON.parse(await readFile(file, "utf8"));
    return json?.results?.[0]?.task_config?.case_config?.case_id ?? null;
  } catch {
    return null;
  }
}

async function isUsableMeasured(file, family) {
  if (family !== "cloud_cold_latency") return true;
  try {
    const json = JSON.parse(await readFile(file, "utf8"));
    const metrics = json?.results?.[0]?.metrics?.cold_latency || {};
    return Number(metrics.cold_stats?.first_query_latency) > 0
      && Number(metrics.warm_stats?.p99_latency) > 0;
  } catch {
    return false;
  }
}

function canonicalKey(file, family, sourceRoot) {
  const rel = path.relative(sourceRoot, file).split(path.sep);
  if (family === "cloud_cold_latency") {
    const offset = rel[0] === "raw_results" ? 1 : 0;
    return [family, rel[offset], rel[offset + 1]].join("|");
  }
  const rawIndex = rel.indexOf("raw_results");
  if (rawIndex >= 0) {
    return [family, ...rel.slice(rawIndex + 1, -1)].join("|");
  }
  return [family, rel.slice(0, -1).join("/")].join("|");
}

const entries = [];
const measuredKeys = new Set();
for (const folder of caseFolders) {
  const sourceRoot = path.join(resultRoot, folder);
  const files = await walk(sourceRoot);
  for (const file of files) {
    const rel = path.relative(root, file).split(path.sep).join("/");
    if (await isUsableMeasured(file, folder)) {
      measuredKeys.add(canonicalKey(file, folder, sourceRoot));
    }
    entries.push({
      path: rel,
      family: folder,
      case_id: await readCaseId(file),
      source: "measured",
    });
  }
}

for (const folder of caseFolders) {
  const sourceRoot = path.join(mockRoot, folder);
  const files = await walk(sourceRoot);
  for (const file of files) {
    if (measuredKeys.has(canonicalKey(file, folder, sourceRoot))) continue;
    const rel = path.relative(root, file).split(path.sep).join("/");
    entries.push({
      path: rel,
      family: folder,
      case_id: await readCaseId(file),
      source: "mocked",
    });
  }
}

entries.sort((a, b) => a.family.localeCompare(b.family) || a.path.localeCompare(b.path));

const counts = entries.reduce((acc, entry) => {
  const key = `${entry.family}:${entry.source}`;
  acc[key] = (acc[key] || 0) + 1;
  return acc;
}, {});

await writeFile(outputPath, `${JSON.stringify({
  generated_at: new Date().toISOString(),
  entries,
  counts,
}, null, 2)}\n`);

console.log(`Wrote ${outputPath}`);
console.log(counts);
