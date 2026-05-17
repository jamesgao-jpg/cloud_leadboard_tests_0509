#!/usr/bin/env node

import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const manifestPath = path.join(root, "cloudleadboard_data", "results_manifest.json");
const caseFamilies = new Set([
  "cloud_insert",
  "cloud_payload_search",
  "cloud_multi_tenant_search",
  "cloud_cold_latency",
]);

const expectedCaseId = {
  cloud_payload_search: 500,
  cloud_insert: 600,
  cloud_cold_latency: 700,
  cloud_multi_tenant_search: 800,
};

const supportedSearchPhases = new Set(["concurrent_qps", "serial_recall"]);
const supportedSearchPayloads = new Set(["ids_only", "vector", "scalar_label"]);

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
    if (entry.isDirectory()) files.push(...await walk(full));
    else if (/^result_.*\.json$/.test(entry.name)) files.push(full);
  }
  return files;
}

function toPosix(file) {
  return path.relative(root, file).split(path.sep).join("/");
}

function familyFromPath(rawPath) {
  const parts = rawPath.split("/");
  return [...caseFamilies].find((family) => parts.includes(family));
}

function pathMeta(rawPath) {
  const parts = rawPath.split("/");
  const family = familyFromPath(rawPath);
  if (!family) return { family: null };

  if (family === "cloud_payload_search" || family === "cloud_multi_tenant_search") {
    const rawIndex = parts.indexOf("raw_results");
    return {
      family,
      rawIndex,
      product: parts[rawIndex + 1],
      filterType: parts[rawIndex + 2],
      filterRate: parts[rawIndex + 3],
      payload: parts[rawIndex + 4],
      phase: parts[rawIndex + 5],
    };
  }

  if (family === "cloud_cold_latency") {
    const familyIndex = parts.indexOf(family);
    const offset = parts[familyIndex + 1] === "raw_results" ? 2 : 1;
    const product = parts[familyIndex + offset];
    const filterFolder = parts[familyIndex + offset + 1];
    return {
      family,
      product,
      filterType: filterFolder?.startsWith("int_filter") ? "int_filter" : "unfiltered",
      filterRate: filterFolder?.startsWith("int_filter") ? filterFolder.replace("int_filter_", "") : "na",
    };
  }

  if (family === "cloud_insert") {
    const rawIndex = parts.indexOf("raw_results");
    return {
      family,
      rawIndex,
      product: parts[rawIndex + 1],
    };
  }

  return { family };
}

function extractResults(json, entry) {
  const results = json.mocked_output ? json.results : [json.results?.[0]].filter(Boolean);
  return results.map((result) => ({
    entry,
    mocked: entry.source === "mocked" || Boolean(json.mocked_output),
    path: entry.path,
    meta: pathMeta(entry.path),
    metrics: result.metrics || {},
    task: result.task_config || {},
    label: result.label,
  }));
}

function canonicalKey(rawPath) {
  const meta = pathMeta(rawPath);
  if (meta.family === "cloud_payload_search" || meta.family === "cloud_multi_tenant_search") {
    return [meta.family, meta.product, meta.filterType, meta.filterRate, meta.payload, meta.phase].join("|");
  }
  if (meta.family === "cloud_cold_latency") {
    return [meta.family, meta.product, meta.filterType, meta.filterRate].join("|");
  }
  if (meta.family === "cloud_insert") {
    const parts = rawPath.split("/");
    const rawIndex = parts.indexOf("raw_results");
    return [meta.family, ...parts.slice(rawIndex + 1, -1)].join("|");
  }
  return rawPath;
}

function addIssue(issues, severity, message, detail = {}) {
  issues.push({ severity, message, ...detail });
}

function sameCounts(left = {}, right = {}) {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) {
    if ((left[key] || 0) !== (right[key] || 0)) return false;
  }
  return true;
}

function resultCaseId(row) {
  return row?.task?.case_config?.case_id ?? null;
}

function validateEntryShape(entry, issues) {
  if (!caseFamilies.has(entry.family)) {
    addIssue(issues, "error", "manifest entry has unknown family", { path: entry.path, family: entry.family });
  }
  const inferred = familyFromPath(entry.path);
  if (inferred !== entry.family) {
    addIssue(issues, "error", "manifest family does not match path", {
      path: entry.path,
      family: entry.family,
      inferred_family: inferred,
    });
  }

  const meta = pathMeta(entry.path);
  if (entry.family === "cloud_payload_search" || entry.family === "cloud_multi_tenant_search") {
    if (meta.rawIndex < 0 || !meta.product || !meta.filterType || !meta.filterRate || !meta.payload || !meta.phase) {
      addIssue(issues, "error", "search path cannot be parsed by leaderboard intake", { path: entry.path });
    }
    if (!supportedSearchPayloads.has(meta.payload)) {
      addIssue(issues, "error", "search path has unsupported payload", { path: entry.path, payload: meta.payload });
    }
    if (!supportedSearchPhases.has(meta.phase)) {
      addIssue(issues, "error", "search path has unsupported phase", { path: entry.path, phase: meta.phase });
    }
  }

  if (entry.family === "cloud_cold_latency") {
    if (!meta.product || !["int_filter", "unfiltered"].includes(meta.filterType) || !meta.filterRate) {
      addIssue(issues, "error", "cold-latency path cannot be parsed by leaderboard intake", { path: entry.path });
    }
  }

  if (entry.family === "cloud_insert") {
    if (meta.rawIndex < 0 || !meta.product) {
      addIssue(issues, "error", "insert path cannot be parsed by leaderboard intake", { path: entry.path });
    }
  }
}

function validateMetrics(row, issues) {
  if (row.entry.family === "cloud_insert") {
    const metrics = row.metrics;
    for (const field of ["insert_completion_seconds", "searchable_after_insert_seconds", "indexed_after_searchable_seconds"]) {
      if (!Number.isFinite(Number(metrics[field]))) {
        addIssue(issues, "error", "insert row is missing timing metric consumed by leaderboard", {
          path: row.path,
          metric: field,
        });
      }
    }
  }

  if (row.entry.family === "cloud_payload_search" || row.entry.family === "cloud_multi_tenant_search") {
    if (row.meta.phase === "concurrent_qps" && !Number.isFinite(Number(row.metrics.qps))) {
      addIssue(issues, "error", "concurrent_qps row is missing qps metric consumed by leaderboard", { path: row.path });
    }
    if (row.meta.phase === "serial_recall" && !Number.isFinite(Number(row.metrics.recall))) {
      addIssue(issues, "error", "serial_recall row is missing recall metric consumed by leaderboard", { path: row.path });
    }
  }

  if (row.entry.family === "cloud_cold_latency") {
    const cold = row.metrics.cold_latency || {};
    if (!Number.isFinite(Number(cold.cold_stats?.first_query_latency))) {
      addIssue(issues, "error", "cold-latency row is missing first cold query latency", { path: row.path });
    }
    if (!Number.isFinite(Number(cold.warm_stats?.p99_latency))) {
      addIssue(issues, "error", "cold-latency row is missing warm p99 latency", { path: row.path });
    }
  }
}

async function main() {
  const issues = [];
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const entries = manifest.entries || [];
  const manifestPaths = new Set();
  const duplicatePaths = new Set();

  for (const entry of entries) {
    if (manifestPaths.has(entry.path)) duplicatePaths.add(entry.path);
    manifestPaths.add(entry.path);
  }
  for (const duplicate of duplicatePaths) {
    addIssue(issues, "error", "manifest contains duplicate path", { path: duplicate });
  }

  const actualCounts = entries.reduce((acc, entry) => {
    const key = `${entry.family}:${entry.source}`;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  if (!sameCounts(actualCounts, manifest.counts || {})) {
    addIssue(issues, "error", "manifest counts do not match entries", {
      manifest_counts: manifest.counts || {},
      actual_counts: actualCounts,
    });
  }

  for (const entry of entries) {
    validateEntryShape(entry, issues);
    const fullPath = path.join(root, entry.path);
    if (!existsSync(fullPath)) {
      addIssue(issues, "error", "manifest points to a missing raw result", { path: entry.path });
      continue;
    }

    let json;
    try {
      json = JSON.parse(await readFile(fullPath, "utf8"));
    } catch (error) {
      addIssue(issues, "error", "manifest raw result is not valid JSON", { path: entry.path, error: error.message });
      continue;
    }

    const rows = extractResults(json, entry);
    if (!rows.length) {
      addIssue(issues, "error", "raw result has no extractable results[0] row", { path: entry.path });
      continue;
    }

    const caseId = resultCaseId(rows[0]);
    if (entry.case_id !== caseId) {
      addIssue(issues, "error", "manifest case_id does not match raw result case_id", {
        path: entry.path,
        manifest_case_id: entry.case_id,
        raw_case_id: caseId,
      });
    }
    if (expectedCaseId[entry.family] !== caseId) {
      addIssue(issues, "error", "raw result case_id does not match family", {
        path: entry.path,
        family: entry.family,
        expected_case_id: expectedCaseId[entry.family],
        raw_case_id: caseId,
      });
    }

    for (const row of rows) validateMetrics(row, issues);
  }

  const rawFiles = [];
  for (const family of caseFamilies) {
    rawFiles.push(...await walk(path.join(root, family)));
  }
  rawFiles.push(...await walk(path.join(root, "cloudleadboard_data", "mock_raw_results")));
  const rawPaths = new Set(rawFiles.map(toPosix));
  const measuredKeys = new Set(entries
    .filter((entry) => entry.source === "measured")
    .map((entry) => canonicalKey(entry.path)));

  let shadowedMockFiles = 0;
  for (const rawPath of rawPaths) {
    const isShadowedMock = rawPath.startsWith("cloudleadboard_data/mock_raw_results/")
      && measuredKeys.has(canonicalKey(rawPath));
    if (isShadowedMock) {
      shadowedMockFiles += 1;
      continue;
    }
    if (!manifestPaths.has(rawPath)) {
      addIssue(issues, "error", "raw result exists but is not included in leaderboard manifest", { path: rawPath });
    }
  }
  for (const entryPath of manifestPaths) {
    if (!rawPaths.has(entryPath)) {
      addIssue(issues, "error", "manifest includes path that is not in raw result scan", { path: entryPath });
    }
  }

  const errors = issues.filter((issue) => issue.severity === "error");
  const warnings = issues.filter((issue) => issue.severity === "warning");
  const summary = {
    manifest_entries: entries.length,
    raw_result_files: rawPaths.size,
    shadowed_mock_files: shadowedMockFiles,
    counts: actualCounts,
    errors: errors.length,
    warnings: warnings.length,
  };

  console.log(JSON.stringify(summary, null, 2));
  for (const issue of issues.slice(0, 200)) {
    console.log(`[${issue.severity}] ${issue.message}: ${issue.path || ""}`);
    const detail = { ...issue };
    delete detail.severity;
    delete detail.message;
    delete detail.path;
    if (Object.keys(detail).length) console.log(`  ${JSON.stringify(detail)}`);
  }
  if (issues.length > 200) console.log(`... ${issues.length - 200} more issues omitted`);

  if (errors.length) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
