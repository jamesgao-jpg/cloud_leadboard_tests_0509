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

const entries = [];
for (const folder of caseFolders) {
  const files = await walk(path.join(resultRoot, folder));
  for (const file of files) {
    const rel = path.relative(root, file).split(path.sep).join("/");
    entries.push({
      path: rel,
      family: folder,
      case_id: await readCaseId(file),
      source: "measured",
    });
  }
}

for (const folder of caseFolders) {
  const files = await walk(path.join(mockRoot, folder));
  for (const file of files) {
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
