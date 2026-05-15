import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const measuredRoot = root;
const mockRoot = path.join(root, "cloudleadboard_data", "mock_raw_results");

const families = ["cloud_payload_search", "cloud_multi_tenant_search"];
const phases = ["concurrent_qps", "serial_recall"];
const phasesByFamily = {
  cloud_payload_search: phases,
  cloud_multi_tenant_search: ["concurrent_qps"],
};
const supportedPayloads = new Set(["ids_only", "vector"]);
const targetProducts = {
  cloud_payload_search: [
    "zilliz_cloud_capacity_12cu",
    "zilliz_cloud_tiered_4cu",
    "pinecone_serverless",
    "turbopuffer_pinned",
    "turbopuffer_unpinned",
  ],
  cloud_multi_tenant_search: [
    "zilliz_cloud_capacity_2cu",
    "zilliz_cloud_tiered_1cu",
    "turbopuffer",
    "pinecone_serverless",
  ],
};

const payloadBytes = {
  ids_only: 2000,
  vector: 309200,
};

const payloadQpsFactor = {
  ids_only: 1,
  vector: 0.48,
};

const payloadLatencyFactor = {
  ids_only: 1,
  vector: 1.35,
};

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

function pathMeta(file) {
  const rel = path.relative(root, file).split(path.sep);
  const family = families.find((name) => rel.includes(name));
  const rawIndex = rel.indexOf("raw_results");
  if (!family || rawIndex < 0) return null;
  return {
    family,
    product: rel[rawIndex + 1],
    filterType: rel[rawIndex + 2],
    filterRate: rel[rawIndex + 3],
    payload: rel[rawIndex + 4],
    phase: rel[rawIndex + 5],
  };
}

function key(meta) {
  return [meta.family, meta.product, meta.filterType, meta.filterRate, meta.payload, meta.phase].join("|");
}

function comboKey(meta) {
  return [meta.family, meta.filterType, meta.filterRate, meta.payload].join("|");
}

function filterProfile(filterType, filterRate) {
  if (filterType === "unfiltered") return "unfiltered";
  if (["50p", "0_5p"].includes(filterRate)) return "0.5";
  if (["10p"].includes(filterRate)) return "0.9";
  if (["1p"].includes(filterRate)) return "0.99";
  if (["0_1p", "99_9p"].includes(filterRate)) return "0.999";
  if (["90p"].includes(filterRate)) return "0.9";
  if (["99p"].includes(filterRate)) return "0.99";
  return "0.99";
}

function profileFor(family, product, filterType, filterRate, payload) {
  const profile = filterProfile(filterType, filterRate);
  const qpsPayload = payloadQpsFactor[payload] ?? 1;
  const latencyPayload = payloadLatencyFactor[payload] ?? 1;

  if (family === "cloud_payload_search" && product === "turbopuffer_unpinned") {
    const base = {
      unfiltered: { qps: 598.9, p99: 1.187, serialP99: 0.0572, recall: 0.9001, ndcg: 0.9081 },
      "0.5": { qps: 359.2, p99: 1.099, serialP99: 0.060, recall: 0.9270, ndcg: 0.9335 },
      "0.9": { qps: 382.8, p99: 1.302, serialP99: 0.060, recall: 0.8702, ndcg: 0.8842 },
      "0.99": { qps: 415.3, p99: 2.494, serialP99: 0.051, recall: 0.6660, ndcg: 0.7056 },
      "0.999": { qps: 87.9, p99: 2.331, serialP99: 0.087, recall: 0.9136, ndcg: 0.9280 },
    }[profile];
    return scaleProfile(base, qpsPayload, latencyPayload);
  }

  if (family === "cloud_payload_search" && product === "turbopuffer_pinned") {
    const base = {
      unfiltered: { qps: 73.8404, p99: 3.086, serialP99: 0.0450, recall: 0.9001, ndcg: 0.9081 },
      "0.5": { qps: 42.1268, p99: 3.928, serialP99: 0.0501, recall: 0.9270, ndcg: 0.9335 },
      "0.9": { qps: 61.9519, p99: 2.503, serialP99: 0.0428, recall: 0.8702, ndcg: 0.8842 },
      "0.99": { qps: 106.0816, p99: 1.981, serialP99: 0.0412, recall: 0.6660, ndcg: 0.7056 },
      "0.999": { qps: 72.4537, p99: 2.331, serialP99: 0.0883, recall: 0.9136, ndcg: 0.9280 },
    }[profile];
    return scaleProfile(base, qpsPayload, latencyPayload);
  }

  if (product === "pinecone_serverless") {
    const singleBase = {
      ids_only: { qps: 4.5642, p99: 4.8496, serialP99: 1.0901 },
      vector: { qps: 4.4830, p99: 2.6097, serialP99: 0.8447 },
    }[payload] ?? { qps: 4.5, p99: 4.0, serialP99: 1.0 };
    const filterFactor = { unfiltered: 1, "0.5": 0.95, "0.9": 0.9, "0.99": 0.82, "0.999": 0.72 }[profile] ?? 0.82;
    if (family === "cloud_multi_tenant_search") {
      const multiBase = { ids_only: 95, vector: 54 }[payload] ?? 90;
      return {
        qps: multiBase * filterFactor,
        p99: (0.92 / filterFactor) * latencyPayload,
        serialP99: 0.42 * latencyPayload,
        recall: 0.9609,
        ndcg: 0.9690,
      };
    }
    return {
      qps: singleBase.qps * filterFactor,
      p99: singleBase.p99 / filterFactor,
      serialP99: singleBase.serialP99,
      recall: 0.9609,
      ndcg: 0.9690,
    };
  }

  if (family === "cloud_multi_tenant_search" && product === "turbopuffer") {
    const baseRecall = {
      unfiltered: 0.9001,
      "0.5": 0.9270,
      "0.9": 0.8702,
      "0.99": 0.6660,
      "0.999": 0.9136,
    }[profile] ?? 0.8702;
    return { qps: 0, p99: 0, serialP99: 0.0704, recall: baseRecall, ndcg: Math.min(0.94, baseRecall + 0.008) };
  }

  if (product.includes("capacity")) {
    return { qps: 0, p99: 0, serialP99: 0.030, recall: 0.9723, ndcg: 0.9750 };
  }

  if (product.includes("tiered")) {
    return { qps: 0, p99: 0, serialP99: 0.090, recall: 0.9510, ndcg: 0.9617 };
  }

  return { qps: 0, p99: 0, serialP99: 0.1, recall: 0.95, ndcg: 0.96 };
}

function scaleProfile(base, qpsFactor, latencyFactor) {
  return {
    qps: base.qps * qpsFactor,
    p99: base.p99 * latencyFactor,
    serialP99: base.serialP99 * latencyFactor,
    recall: base.recall,
    ndcg: base.ndcg,
  };
}

function resultJson({ family, product, filterType, filterRate, payload, phase, metrics }) {
  const isConcurrent = phase === "concurrent_qps";
  const label = `mocked_output_${family}_${product}_${filterType}_${filterRate}_${payload}_${phase}`;
  return {
    mocked_output: true,
    source_note: "Generated fill for missing cloud leaderboard search matrix cells. Measured raw JSON files remain the source of truth.",
    results: [
      {
        label,
        metrics: {
          max_load_count: 0,
          insert_duration: 0.0,
          optimize_duration: 0.0,
          load_duration: 0.0,
          qps: isConcurrent ? round(metrics.qps) : 0.0,
          serial_latency_p99: isConcurrent ? 0.0 : round(metrics.serialP99, 4),
          serial_latency_p95: isConcurrent ? 0.0 : round(metrics.serialP99 * 0.78, 4),
          recall: isConcurrent ? 0.0 : round(metrics.recall, 4),
          ndcg: isConcurrent ? 0.0 : round(metrics.ndcg, 4),
          conc_num_list: isConcurrent ? [60, 80] : [],
          conc_qps_list: isConcurrent ? [round(metrics.qps * 0.88), round(metrics.qps)] : [],
          conc_latency_p99_list: isConcurrent ? [round(metrics.p99 * 0.86, 4), round(metrics.p99, 4)] : [],
          conc_latency_p95_list: isConcurrent ? [round(metrics.p99 * 0.70, 4), round(metrics.p99 * 0.82, 4)] : [],
          conc_latency_avg_list: isConcurrent ? [round(metrics.p99 * 0.42, 4), round(metrics.p99 * 0.50, 4)] : [],
          payload_profile: payload,
          payload_estimated_bytes_per_query: payloadBytes[payload] ?? 2000,
          st_ideal_insert_duration: 0,
          st_search_stage_list: [],
          st_search_time_list: [],
          st_max_qps_list_list: [],
          st_recall_list: [],
          st_ndcg_list: [],
          st_serial_latency_p99_list: [],
          st_serial_latency_p95_list: [],
          st_conc_failed_rate_list: [],
          st_conc_num_list_list: [],
          st_conc_qps_list_list: [],
          st_conc_latency_p99_list_list: [],
          st_conc_latency_p95_list_list: [],
          st_conc_latency_avg_list_list: [],
        },
        task_config: {
          db_config: {
            db_label: `${product}_${filterType}_${filterRate}_${payload}_${phase}_mocked_output`,
            version: "",
            note: "mocked matrix fill",
            uri: "**********",
            user: "",
            password: "**********",
            token: "**********",
            collection_name: family === "cloud_multi_tenant_search" ? "cohere_10m_multitenant" : "laion100m",
          },
          case_config: {
            case_id: family === "cloud_multi_tenant_search" ? 800 : 500,
            custom_case: {
              payload_profile: payload,
            },
            k: family === "cloud_multi_tenant_search" ? 50 : 100,
            concurrency_search_config: {
              num_concurrency: isConcurrent ? [60, 80] : [1],
              concurrency_duration: 30,
              concurrency_timeout: 3600,
            },
          },
          load_concurrency: null,
        },
      },
    ],
  };
}

function round(value, digits = 4) {
  return Number(Number(value || 0).toFixed(digits));
}

const measuredFiles = (await Promise.all(families.map((family) => walk(path.join(measuredRoot, family))))).flat();
const measuredKeys = new Set();
const combos = new Map();

for (const file of measuredFiles) {
  const meta = pathMeta(file);
  if (!meta || !phases.includes(meta.phase)) continue;
  if (!supportedPayloads.has(meta.payload)) continue;
  measuredKeys.add(key(meta));
  combos.set(comboKey(meta), meta);
}

for (const family of families) {
  await rm(path.join(mockRoot, family), { recursive: true, force: true });
}

let written = 0;
for (const combo of combos.values()) {
  for (const product of targetProducts[combo.family]) {
    if (!supportedPayloads.has(combo.payload)) continue;
    for (const phase of phasesByFamily[combo.family]) {
      const meta = { ...combo, product, phase };
      if (measuredKeys.has(key(meta))) continue;
      const metrics = profileFor(combo.family, product, combo.filterType, combo.filterRate, combo.payload);
      const outDir = path.join(
        mockRoot,
        combo.family,
        "raw_results",
        product,
        combo.filterType,
        combo.filterRate,
        combo.payload,
        phase,
      );
      await mkdir(outDir, { recursive: true });
      const file = path.join(outDir, `result_mocked_output_${product}_${combo.filterType}_${combo.filterRate}_${combo.payload}_${phase}.json`);
      await writeFile(file, `${JSON.stringify(resultJson({ ...meta, metrics }), null, 2)}\n`);
      written += 1;
    }
  }
}

console.log(`Wrote ${written} mocked search matrix result files`);
