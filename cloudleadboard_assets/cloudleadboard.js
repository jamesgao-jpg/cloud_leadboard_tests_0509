const CASE_NAMES = {
  500: "CloudPayloadSearchCase",
  600: "CloudInsertCase",
  700: "CloudColdLatencyCase",
  800: "CloudMultiTenantSearchCase",
};

const PRODUCT_LABELS = {
  zilliz_cloud_tiered_4cu: "Zilliz Cloud Tiered 4CU",
  zilliz_cloud_capacity_12cu: "Zilliz Cloud Capacity 12CU",
  zilliz_cloud_tiered_1cu: "Zilliz Cloud Tiered 1CU",
  zilliz_cloud_capacity_2cu: "Zilliz Cloud Capacity 2CU",
  zilliz_cloud_cap_12cu: "Zilliz Cloud Capacity 12CU",
  zillz_cloud_cap_12cu: "Zilliz Cloud Capacity 12CU",
  pinecone: "Pinecone Serverless",
  pinecone_serverless: "Pinecone Serverless",
  turbopuffer: "Turbopuffer",
  turbopuffer_bp_on: "Turbopuffer Backpressure On",
  turbopuffer_bp_off: "Turbopuffer Backpressure Off",
  turbopuffer_pinned: "Turbopuffer Pinned Mode",
  turbopuffer_unpinned: "Turbopuffer Unpinned Mode",
};

const FILTER_LABELS = {
  "unfiltered/na": "unfiltered",
  "int_filter/0.9": "int filter 90%",
  "int_filter/0_1p": "int filter, 0.1% candidates",
  "int_filter/1p": "int filter, 1% candidates",
  "int_filter/10p": "int filter, 10% candidates",
  "int_filter/99_9p": "int filter, 0.1% candidates",
  "int_filter/99p": "int filter, 1% candidates",
  "int_filter/90p": "int filter, 10% candidates",
  "int_filter/50p": "int filter, 50% candidates",
  "scalar_label_filter/0_1p": "label filter 0.1%",
  "scalar_label_filter/0_2p": "label filter 0.2%",
  "scalar_label_filter/0_5p": "label filter 0.5%",
  "scalar_label_filter/1p": "label filter 1%",
  "scalar_label_filter/2p": "label filter 2%",
  "scalar_label_filter/5p": "label filter 5%",
  "scalar_label_filter/10p": "label filter 10%",
  "scalar_label_filter/20p": "label filter 20%",
  "scalar_label_filter/50p": "label filter 50%",
};

const DEFAULTS = {
  single: { filterKey: "unfiltered/na", payload: "ids_only" },
  multi: { filterKey: "int_filter/99p", payload: "vector" },
};

const MONTHLY_HOURS = 730;
const BUILD_ID = "20260518-insert-cost-toggle";

const state = {
  raw: [],
  insert: [],
  payload: [],
  multi: [],
  cold: [],
  cost: null,
  insertBackpressure: "off",
  insertShowCost: false,
};

const $ = (id) => document.getElementById(id);

function groupBy(items, keyFn) {
  const groups = new Map();
  for (const item of items) {
    const key = keyFn(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return groups;
}

function fmtNumber(value, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(value)) return "n/a";
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: digits });
}

function fmtSeconds(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "n/a";
  if (value < 1) return `${(value * 1000).toFixed(0)} ms`;
  if (value < 60) return `${value.toFixed(2)} s`;
  if (value < 3600) return `${(value / 60).toFixed(1)} min`;
  return `${(value / 3600).toFixed(1)} hr`;
}

function productLabel(product) {
  return PRODUCT_LABELS[product] || product
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function productClass(label) {
  const lower = label.toLowerCase();
  if (lower.includes("zilliz")) return "product-zilliz";
  if (lower.includes("turbo")) return "product-turbo";
  if (lower.includes("pine")) return "product-pine";
  return "product-neutral";
}

function productColor(label) {
  const lower = label.toLowerCase();
  if (lower.includes("zilliz") && lower.includes("tier")) return "var(--c-zilliz-tier)";
  if (lower.includes("zilliz") && lower.includes("capacity")) return "var(--c-zilliz-capacity)";
  if (lower.includes("zilliz")) return "var(--c-zilliz-srv)";
  if (lower.includes("turbo") && lower.includes("pinned")) return "var(--c-turbo-pinned)";
  if (lower.includes("turbo")) return "var(--c-turbo)";
  if (lower.includes("pine")) return "var(--c-pinecone)";
  return "var(--c-neutral)";
}

function productWarmColor(label) {
  const lower = label.toLowerCase();
  if (lower.includes("zilliz") && lower.includes("tier")) return "#5eead4";
  if (lower.includes("zilliz")) return "#67e8f9";
  if (lower.includes("turbo")) return "#fdba74";
  if (lower.includes("pine")) return "#f9a8d4";
  return "#cbd5e1";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function payloadLabel(payload) {
  if (payload === "ids_only") return "ids only";
  if (payload === "vector") return "ids + vector";
  if (payload === "scalar_label") return "ids + scalar label";
  return payload.replaceAll("_", " ");
}

async function fetchJson(path) {
  const url = `${path}${path.includes("?") ? "&" : "?"}v=${BUILD_ID}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return res.json();
}

function pathMeta(path) {
  const parts = path.split("/");
  const family = caseFamilyFromPath(parts);
  if (family === "cloud_payload_search" || family === "cloud_multi_tenant_search") {
    const i = parts.indexOf("raw_results");
    return {
      family,
      product: parts[i + 1],
      filterType: parts[i + 2],
      filterRate: parts[i + 3],
      filterKey: `${parts[i + 2]}/${parts[i + 3]}`,
      payload: parts[i + 4],
      phase: parts[i + 5],
    };
  }
  if (family === "cloud_cold_latency") {
    const i = parts.indexOf(family);
    const offset = parts[i + 1] === "raw_results" ? 2 : 1;
    const filterFolder = parts[i + offset + 1];
    return {
      family,
      product: parts[i + offset],
      filterType: filterFolder?.startsWith("int_filter") ? "int_filter" : "unfiltered",
      filterRate: filterFolder?.startsWith("int_filter") ? filterFolder.replace("int_filter_", "") : "na",
    };
  }
  if (family === "cloud_insert") {
    const i = parts.indexOf("raw_results");
    return { family, product: parts[i + 1] };
  }
  return { family };
}

function caseFamilyFromPath(parts) {
  return [
    "cloud_insert",
    "cloud_payload_search",
    "cloud_multi_tenant_search",
    "cloud_cold_latency",
  ].find((family) => parts.includes(family)) || parts[1] || parts[0];
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

function normalizeInsert(row) {
  const custom = row.task.case_config?.custom_case || {};
  const label = row.task.db_config?.db_label || row.path;
  let product = row.meta.product;
  if (label.includes("zilliz_cloud_capacity") || label.includes("zillz_cloud_cap")) product = "zilliz_cloud_cap_12cu";
  else if (label.includes("zilliz") || label.includes("tiered")) product = "zilliz_cloud_tiered_4cu";
  else if (label.includes("turbopuffer_bp_on")) product = "turbopuffer_bp_on";
  else if (label.includes("turbopuffer_bp_off")) product = "turbopuffer_bp_off";
  else if (label.includes("turbopuffer")) product = "turbopuffer";
  else if (label.includes("pinecone")) product = "pinecone";

  return {
    product,
    productLabel: productLabel(product),
    dataset: custom.dataset_with_size_type || "unknown dataset",
    batchSize: Number(custom.batch_size || 0),
    loadConcurrency: row.task.load_concurrency || 0,
    insertedCount: row.metrics.inserted_count,
    insertSeconds: row.metrics.insert_completion_seconds,
    searchableSeconds: row.metrics.searchable_after_insert_seconds,
    indexedSeconds: row.metrics.indexed_after_searchable_seconds,
    rowsPerSecond: row.metrics.insert_rows_per_second,
    mocked: row.mocked,
    path: row.path,
  };
}

function normalizeSearch(row) {
  return {
    ...row.meta,
    productLabel: productLabel(row.meta.product),
    qps: row.metrics.qps,
    maxQps: Math.max(row.metrics.qps || 0, ...(row.metrics.conc_qps_list || [0])),
    recall: row.metrics.recall,
    ndcg: row.metrics.ndcg,
    p99: Math.max(row.metrics.serial_latency_p99 || 0, ...(row.metrics.conc_latency_p99_list || [0])),
    p95: Math.max(row.metrics.serial_latency_p95 || 0, ...(row.metrics.conc_latency_p95_list || [0])),
    payloadBytes: row.metrics.payload_estimated_bytes_per_query,
    mocked: row.mocked,
    path: row.path,
  };
}

function normalizeCold(row) {
  const cold = row.metrics.cold_latency?.cold_stats || {};
  const warm = row.metrics.cold_latency?.warm_stats || {};
  const ratio = row.metrics.cold_latency?.cold_warm_ratio || row.metrics.cold_latency?.ratios || {};
  return {
    product: row.meta.product,
    productLabel: productLabel(row.meta.product),
    filterKey: `${row.meta.filterType}/${row.meta.filterRate}`,
    filter: row.meta.filterRate === "na" ? "unfiltered" : `int filter ${row.meta.filterRate}`,
    first: cold.first_query_latency,
    coldP99: cold.p99_latency,
    coldP95: cold.p95_latency,
    coldAvg: cold.avg_latency,
    warmFirst: warm.first_query_latency,
    warmP99: warm.p99_latency,
    warmP95: warm.p95_latency,
    warmAvg: warm.avg_latency,
    firstRatio: ratio.first_query_latency_ratio ?? ratio.first_query_latency,
    p99Ratio: ratio.p99_latency_ratio ?? ratio.p99_latency,
    mocked: row.mocked,
    path: row.path,
  };
}

async function loadAll() {
  const manifest = await fetchJson("cloudleadboard_data/results_manifest.json");
  const cost = await fetchJson("cloudleadboard_data/cost_model.json");
  const loaded = await Promise.all(manifest.entries.map(async (entry) => {
    try {
      return extractResults(await fetchJson(entry.path), entry);
    } catch (error) {
      console.warn(error);
      return [];
    }
  }));

  state.raw = loaded.flat();
  state.cost = cost;
  state.insert = state.raw.filter((r) => r.entry.case_id === 600).map(normalizeInsert);
  state.payload = state.raw.filter((r) => r.entry.case_id === 500).map(normalizeSearch);
  state.multi = state.raw.filter((r) => r.entry.case_id === 800).map(normalizeSearch);
  state.cold = state.raw.filter((r) => r.entry.case_id === 700).map(normalizeCold);

  const measured = Object.entries(manifest.counts)
    .filter(([key]) => key.endsWith(":measured"))
    .reduce((sum, [, value]) => sum + value, 0);
  if ($("load-status")) $("load-status").textContent = "Loaded raw result index";
  if ($("result-counts")) $("result-counts").textContent = `${measured} measured rows`;
}

function renderInsertControls() {
  const costToggle = $("insert-cost-toggle");
  if (costToggle) {
    costToggle.setAttribute("aria-checked", state.insertShowCost ? "true" : "false");
    costToggle.addEventListener("click", () => {
      state.insertShowCost = !state.insertShowCost;
      costToggle.setAttribute("aria-checked", state.insertShowCost ? "true" : "false");
      renderInsert();
    });
  }
  renderInsert();
}

function attachInsertBackpressureToggle() {
  const toggle = $("insert-backpressure-toggle");
  if (!toggle) return;
  toggle.setAttribute("aria-checked", state.insertBackpressure === "on" ? "true" : "false");
  toggle.addEventListener("click", () => {
    state.insertBackpressure = state.insertBackpressure === "on" ? "off" : "on";
    renderInsert();
  });
}

function insertDisplayProduct(row) {
  if (row.product === "turbopuffer_bp_on" || row.product === "turbopuffer_bp_off") return "Turbopuffer";
  return row.productLabel;
}

function insertMotionKey(row, phase) {
  const product = row.product === "turbopuffer_bp_on" || row.product === "turbopuffer_bp_off"
    ? "turbopuffer"
    : row.product;
  return `${product}|${row.batchSize}|${phase}`;
}

function captureInsertMotion() {
  const snapshot = new Map();
  document.querySelectorAll("#insert-chart [data-insert-motion-key]").forEach((element) => {
    snapshot.set(element.dataset.insertMotionKey, { width: element.style.width });
  });
  return snapshot;
}

function animateInsertMotion(previous) {
  if (!previous?.size || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  document.querySelectorAll("#insert-chart [data-insert-motion-key]").forEach((element) => {
    const from = previous.get(element.dataset.insertMotionKey);
    if (!from?.width) return;
    const to = element.style.width;
    element.classList.add("insert-bar-motion");
    element.style.transition = "none";
    element.style.width = from.width;
    element.getBoundingClientRect();
    requestAnimationFrame(() => {
      element.style.transition = "";
      element.style.width = to;
    });
  });
}

function insertScenarioShape() {
  const scenario = state.cost?.pricing?.scenarios?.single || {};
  const recordCount = Number(scenario.record_count || 0);
  const vectorDataGb = Number(scenario.vector_data_gb || 0);
  if (!recordCount || !vectorDataGb) return null;
  return {
    recordCount,
    vectorDataGb,
    bytesPerRecord: (vectorDataGb * 1e9) / recordCount,
  };
}

function zillizInsertHourlyRate(row) {
  const points = state.cost?.scenarios?.single?.points || [];
  const lowerProduct = row.product.toLowerCase();
  const target = lowerProduct.includes("tiered") ? "tiered" : "capacity";
  const point = points.find((item) => {
    const lower = item.product.toLowerCase();
    return lower.includes("zilliz") && lower.includes(target);
  });
  return Number(point?.search_cost_hr || 0);
}

function insertWriteCost(row) {
  const totalSeconds = row.insertSeconds + row.searchableSeconds + row.indexedSeconds;
  const family = productCostFamily(row.productLabel);
  if (family === "zilliz") return (totalSeconds / 3600) * zillizInsertHourlyRate(row);

  const shape = insertScenarioShape();
  if (!shape) return 0;
  const batchSize = Math.max(1, Number(row.batchSize || 1));
  const recordCount = Number(row.insertedCount || shape.recordCount);
  const requestBytes = batchSize * shape.bytesPerRecord;
  const requests = recordCount / batchSize;

  if (family === "pinecone") {
    const pricing = state.cost?.pricing?.pinecone || {};
    const unitBytes = pricing.write_unit_bytes || 1024;
    const pricePerMillion = pricing.write_usd_per_million_wu || 0;
    const totalWu = Math.ceil((recordCount * shape.bytesPerRecord) / unitBytes);
    return (totalWu / 1e6) * pricePerMillion;
  }

  if (family === "turbopuffer") {
    const pricing = state.cost?.pricing?.turbopuffer || {};
    const minKb = pricing.min_write_kb_per_request || 10;
    const pricePerGb = pricing.write_usd_per_logical_gb || 0;
    const requestKb = requestBytes / 1000;
    const billableKb = Math.max(requestKb, minKb);
    const discount = turbopufferBatchDiscount(billableKb);
    const billableGb = (requests * billableKb * (1 - discount)) / 1e6;
    return billableGb * pricePerGb;
  }

  return 0;
}

function renderInsert() {
  const previousMotion = captureInsertMotion();
  const dataset = "LAION 100M";
  const productRank = (product) => {
    if (product.includes("Zilliz Cloud Capacity")) return 0;
    if (product.includes("Zilliz Cloud Tiered")) return 1;
    if (product.includes("Turbopuffer")) return 2;
    if (product.includes("Pinecone")) return 4;
    return 5;
  };
  const scaleRows = state.insert
    .filter((r) => r.dataset === dataset)
    .filter((r) => [r.insertSeconds, r.searchableSeconds, r.indexedSeconds].every((v) => typeof v === "number"));
  const complete = scaleRows.filter((r) => {
    if (r.product === "turbopuffer_bp_on") return state.insertBackpressure === "on";
    if (r.product === "turbopuffer_bp_off") return state.insertBackpressure === "off";
    return true;
  });
  const totals = complete.map((r) => r.insertSeconds + r.searchableSeconds + r.indexedSeconds).sort((a, b) => a - b);
  const maxTotal = Math.max(1, ...totals);
  const costByPath = new Map(scaleRows.map((row) => [row.path, insertWriteCost(row)]));
  const maxInsertCost = Math.max(1, ...costByPath.values());
  const phaseMax = {
    insert: Math.max(1, ...scaleRows.map((r) => r.insertSeconds)),
    searchable: Math.max(1, ...scaleRows.map((r) => r.searchableSeconds)),
    indexed: Math.max(1, ...scaleRows.map((r) => r.indexedSeconds)),
  };
  const byProduct = groupBy(complete, insertDisplayProduct);
  if (!complete.length) {
    $("insert-chart").innerHTML = `<p class="muted">No complete timing rows for this selection.</p>`;
    return;
  }

  const products = [...byProduct.entries()].map(([product, rows]) => ({
    product,
    rows: rows.sort((a, b) => a.batchSize - b.batchSize),
  })).sort((a, b) => productRank(a.product) - productRank(b.product) || a.product.localeCompare(b.product));
  const productCards = products.map((group) => {
    const rows = group.rows.map((row) => {
      const total = row.insertSeconds + row.searchableSeconds + row.indexedSeconds;
      const writeCost = costByPath.get(row.path) || 0;
      const costWidth = Math.max(writeCost > 0 ? 2 : 0, (writeCost / maxInsertCost) * 100);
      const phaseBars = [
        ["inserted", "seg-insert", row.insertSeconds, phaseMax.insert],
        ["searchable", "seg-searchable", row.searchableSeconds, phaseMax.searchable],
        ["indexed", "seg-indexed", row.indexedSeconds, phaseMax.indexed],
      ].map(([label, className, value, max]) => {
        const width = Math.max(value > 0 ? 2 : 0, (value / max) * 100);
        return `<div class="insert-phase ${className}">
          <div class="insert-phase-track">
            <span data-insert-motion-key="${escapeHtml(insertMotionKey(row, label))}" style="width:${width}%"></span>
          </div>
          <strong>${fmtSeconds(value)}</strong>
        </div>`;
      }).join("");
      return `<div class="insert-row">
        <div class="insert-label">
          <strong>batch size = ${row.batchSize}</strong>
        </div>
        <div class="insert-phase-grid">
          ${phaseBars}
          <div class="insert-tooltip" role="tooltip">
            <strong>${escapeHtml(row.productLabel)} · batch size = ${row.batchSize}</strong>
            <table>
              <tr><td>Insertion finished</td><td>${fmtSeconds(row.insertSeconds)}</td></tr>
              <tr><td>Become searchable</td><td>${fmtSeconds(row.searchableSeconds)}</td></tr>
              <tr><td>Fully indexed</td><td>${fmtSeconds(row.indexedSeconds)}</td></tr>
              <tr class="tot"><td>Total readiness</td><td>${fmtSeconds(total)}</td></tr>
              ${state.insertShowCost ? `<tr><td>Write cost</td><td>${fmtCurrency(writeCost)}</td></tr>` : ""}
              <tr><td>Rows/s</td><td>${fmtNumber(row.rowsPerSecond, 0)}</td></tr>
            </table>
          </div>
        </div>
        <div class="insert-total">
          <strong>${fmtSeconds(total)}</strong>
        </div>
        ${state.insertShowCost ? `<div class="insert-cost">
          <div class="insert-cost-track"><span data-insert-motion-key="${escapeHtml(insertMotionKey(row, "cost"))}" style="width:${costWidth}%;background:${productColor(row.productLabel)};"></span></div>
          <strong>${fmtCurrency(writeCost)}</strong>
        </div>` : ""}
      </div>`;
    }).join("");
    return `<div class="insert-product">
      <div class="insert-product-head">
        <strong>${escapeHtml(group.product)}</strong>
        ${group.product === "Turbopuffer" ? `<button id="insert-backpressure-toggle" class="switch-button insert-backpressure-switch" type="button" role="switch" aria-checked="${state.insertBackpressure === "on" ? "true" : "false"}" aria-label="Toggle Turbopuffer backpressure">
          <strong>Backpressure</strong>
          <span class="switch-segments" aria-hidden="true">
            <span class="switch-off">Off</span>
            <span class="switch-on">On</span>
          </span>
        </button>` : ""}
      </div>
      ${rows}
    </div>`;
  }).join("");

  $("insert-chart").innerHTML = `
    <div class="card insert-readiness-card ${state.insertShowCost ? "show-cost" : ""}">
      <div class="card-head"><strong>Readiness Window</strong><span>three independently scaled phases · max total ${fmtSeconds(maxTotal)}${state.insertShowCost ? ` · max write cost ${fmtCurrency(maxInsertCost)}` : ""}</span></div>
      <div class="insert-phase-head">
        <span></span>
        <span>Inserted</span>
        <span>Searchable</span>
        <span>Indexed</span>
        <span>Total</span>
        ${state.insertShowCost ? "<span>Write Cost</span>" : ""}
      </div>
      <div class="insert-groups">${productCards}</div>
    </div>`;
  attachInsertBackpressureToggle();
  animateInsertMotion(previousMotion);
}

function combinedSearchRows(rows) {
  const groups = new Map();
  const preferMeasured = (currentRow, nextRow) => {
    if (!currentRow) return nextRow;
    if (currentRow.mocked && !nextRow.mocked) return nextRow;
    return currentRow;
  };
  for (const row of rows) {
    const key = [row.product, row.filterKey, row.payload].join("|");
    const current = groups.get(key) || { ...row, qpsRow: null, recallRow: null };
    if (row.phase === "concurrent_qps") current.qpsRow = preferMeasured(current.qpsRow, row);
    if (row.phase === "serial_recall") current.recallRow = preferMeasured(current.recallRow, row);
    groups.set(key, current);
  }
  return [...groups.values()].map((group) => ({
    ...group,
    maxQps: group.qpsRow?.maxQps ?? 0,
    p99: group.qpsRow?.p99 ?? 0,
    recall: group.recallRow?.recall ?? null,
    ndcg: group.recallRow?.ndcg ?? null,
    payloadBytes: group.qpsRow?.payloadBytes ?? group.recallRow?.payloadBytes,
    mocked: Boolean(group.qpsRow?.mocked || group.recallRow?.mocked),
  }));
}

function availableSearchRows() {
  const mode = $("search-mode").value;
  const rows = mode === "single" ? combinedSearchRows(state.payload) : combinedSearchRows(state.multi);
  return rows.filter((row) => row.payload !== "scalar_label");
}

function renderSearchControls() {
  $("search-mode").addEventListener("change", () => {
    populateSearchOptions();
    renderSearch();
  });
  $("filter-select").addEventListener("change", renderSearch);
  $("payload-select").addEventListener("change", renderSearch);
  populateSearchOptions();
}

function populateSearchOptions() {
  const mode = $("search-mode").value;
  const rows = availableSearchRows();
  const filters = [...new Set(rows.map((r) => r.filterKey))].sort();
  const payloads = [...new Set(rows.map((r) => r.payload))].sort();
  $("filter-select").innerHTML = filters.map((key) => `<option value="${key}">${FILTER_LABELS[key] || key}</option>`).join("");
  $("payload-select").innerHTML = payloads.map((payload) => `<option value="${payload}">${payloadLabel(payload)}</option>`).join("");
  if (filters.includes(DEFAULTS[mode].filterKey)) $("filter-select").value = DEFAULTS[mode].filterKey;
  if (payloads.includes(DEFAULTS[mode].payload)) $("payload-select").value = DEFAULTS[mode].payload;
}

function renderSearch() {
  const mode = $("search-mode").value;
  const showRecall = mode === "single";
  const filterKey = $("filter-select").value;
  const payload = $("payload-select").value;
  const rows = availableSearchRows()
    .filter((row) => row.filterKey === filterKey && row.payload === payload)
    .sort((a, b) => b.maxQps - a.maxQps);
  const maxQps = Math.max(1, ...rows.map((r) => r.maxQps));
  const maxP99 = Math.max(1, ...rows.map((r) => r.p99 || 0));
  const bestZilliz = rows.find((r) => r.productLabel.includes("Zilliz"));
  const bestOverall = rows[0];

  $("search-note").textContent = mode === "single"
    ? "Single-tenant recall and QPS are merged from serial_recall and concurrent_qps JSON files."
    : "Multi-tenant mode is evaluated on concurrent QPS and P99 latency only.";

  const hasPinecone = rows.some((row) => row.productLabel.includes("Pinecone"));
  const coverageNotes = [];
  if (!hasPinecone) coverageNotes.push("Pinecone rows are not present for this selection yet.");
  $("search-grid").innerHTML = coverageNotes.length
    ? `<div class="coverage-note">${coverageNotes.map((note) => `<span>${note}</span>`).join("")}</div>`
    : "";

  const combinedRows = rows.map((row) => {
    const quality = row.recall === null || row.recall === undefined
      ? `<span class="muted">recall n/a</span>`
      : `<span class="${row.recall >= 0.96 ? "quality-good" : "quality-bad"}">recall ${row.recall.toFixed(4)}</span>`;
    const latencyWidth = ((row.p99 || 0) / maxP99) * 100;
    const qpsWidth = (row.maxQps / maxQps) * 100;
    return `<div class="search-combined-row ${showRecall ? "" : "no-recall"} ${productClass(row.productLabel)}">
      <div class="bar-label">
        <span>${escapeHtml(row.productLabel)}</span>
        <small>${fmtNumber(row.payloadBytes, 0)} bytes/query</small>
      </div>
      <div class="search-diverging-bars">
        <div class="diverge-side diverge-latency">
          <span class="diverge-value">${fmtSeconds(row.p99)}</span>
          <div class="diverge-fill-wrap"><div class="fill" style="width:${latencyWidth}%"></div></div>
        </div>
        <div class="diverge-axis"></div>
        <div class="diverge-side diverge-qps">
          <div class="diverge-fill-wrap"><div class="fill" style="width:${qpsWidth}%"></div></div>
          <span class="diverge-value qps-value" style="left:min(${qpsWidth}%, calc(100% - 2px))">${fmtNumber(row.maxQps, 1)}</span>
        </div>
      </div>
      ${showRecall ? `<div class="search-recall">${quality}</div>` : ""}
    </div>`;
  }).join("");

  $("search-chart").innerHTML = rows.length ? `
    <div class="search-combined-card">
      <div class="search-chart-head">
        <strong>Vector Search Latency and QPS</strong>
        <span>${FILTER_LABELS[filterKey] || filterKey} · ${payloadLabel(payload)}${showRecall ? " · recall shown at row end" : ""}</span>
      </div>
      <div class="search-combined-head ${showRecall ? "" : "no-recall"}">
        <span>Product</span>
        <span class="search-axis-head"><span>P99 Latency (ms)</span><span>QPS</span></span>
        ${showRecall ? "<span>Recall</span>" : ""}
      </div>
      <div class="search-combined-body">${combinedRows}</div>
    </div>` : `<p class="muted">No rows for this selection.</p>`;
}

function renderColdControls() {
  $("cold-filter-select").addEventListener("change", renderCold);
}

function canonicalColdRows(rows) {
  const groups = new Map();
  const isBetterColdRow = (current, next) => {
    if (!current) return true;
    if (current.mocked && !next.mocked) return true;
    if (current.mocked === next.mocked && String(next.path || "").localeCompare(String(current.path || "")) > 0) return true;
    return false;
  };
  for (const row of rows) {
    const key = row.productLabel;
    if (isBetterColdRow(groups.get(key), row)) groups.set(key, row);
  }
  return [...groups.values()].sort((a, b) => a.first - b.first);
}

function renderCold() {
  const selectedFilter = $("cold-filter-select").value;
  const valid = canonicalColdRows(state.cold
    .filter((row) => row.filterKey === selectedFilter)
    .filter((row) => row.first > 0 && row.warmP99 > 0));
  if (!valid.length) {
    $("cold-chart").innerHTML = `<p class="muted">No non-zero cold latency rows for this mode yet.</p>`;
    return;
  }
  const maxCold = Math.max(1, ...valid.map((row) => row.first));
  const maxRatio = Math.max(1, ...valid.map((row) => row.firstRatio || row.first / row.warmFirst));
  const warmColdRows = valid.map((row) => {
    const total = row.warmP99 + row.first;
    const warmShare = Math.max(1, Math.min(99, (row.warmP99 / total) * 100));
    const width = Math.max(1, (row.first / maxCold) * 100);
    const tooltip = [
      `${row.productLabel}`,
      `first cold query: ${fmtSeconds(row.first)}`,
      `warm first query: ${fmtSeconds(row.warmFirst)}`,
      `cold P99: ${fmtSeconds(row.coldP99)}`,
      `warm P99: ${fmtSeconds(row.warmP99)}`,
      `cold avg: ${fmtSeconds(row.coldAvg)}`,
      `warm avg: ${fmtSeconds(row.warmAvg)}`,
      row.mocked ? "source: mocked output" : "source: measured raw output",
    ].join("\n");
    const sourceTag = row.mocked ? `<small class="tag mocked">mocked</small>` : "";
    return `<div class="bar-row">
      <div class="bar-label">${escapeHtml(row.productLabel)}${sourceTag}</div>
      <div class="track" title="${escapeHtml(tooltip)}"><div class="fill" style="width:${width}%;background:linear-gradient(90deg, ${productColor(row.productLabel)} 0 ${warmShare}%, ${productWarmColor(row.productLabel)} ${warmShare}% 100%);"></div></div>
      <div class="bar-val">${fmtMs(row.warmP99)} / ${fmtMs(row.first)} <small>ms</small></div>
    </div>`;
  }).join("");
  const ratioRows = valid
    .map((row) => {
      const ratio = row.firstRatio || row.first / row.warmFirst;
      const sourceTag = row.mocked ? `<small class="tag mocked">mocked</small>` : "";
      return `<div class="bar-row">
        <div class="bar-label">${escapeHtml(row.productLabel)}${sourceTag}</div>
        <div class="track"><div class="fill" style="width:${(ratio / maxRatio) * 100}%;background:${productColor(row.productLabel)};"></div></div>
        <div class="bar-val">${ratio.toFixed(2)}×</div>
      </div>`;
    }).join("");
  $("cold-chart").innerHTML = `
    <div class="grid-2">
      <div class="card">
        <div class="card-head"><strong>Warm P99 / First Cold Query</strong><span>${FILTER_LABELS[selectedFilter] || selectedFilter}</span></div>
        <div class="bars">${warmColdRows}</div>
        <p class="note">Left segment is warm P99, right segment is the first query after the idle cold pass.</p>
      </div>
      <div class="card">
        <div class="card-head"><strong>Cold / Warm Ratio</strong><span>lower is better</span></div>
        <div class="bars">${ratioRows}</div>
        <p class="note">Ratio uses first cold query divided by first warm query from the same unfiltered run.</p>
      </div>
    </div>`;
}

function fmtMs(seconds) {
  if (seconds === null || seconds === undefined || Number.isNaN(seconds)) return "n/a";
  return `${Math.round(seconds * 1000)}`;
}

function renderCostControls() {
  $("cost-scenario").addEventListener("change", () => {
    $("cost-qps-max").value = defaultCostQpsMax($("cost-scenario").value);
    renderCost();
  });
  $("cost-mode").addEventListener("change", () => {
    updateCostWriteControl();
    renderCost();
  });
  $("cost-write-mode")?.addEventListener("change", renderCost);
  $("cost-period-toggle").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-period]");
    if (!button) return;
    $("cost-period-toggle").querySelectorAll("button").forEach((item) => {
      item.classList.toggle("active", item === button);
    });
    renderCost();
  });
  $("cost-qps-max").addEventListener("input", renderCost);
  $("cost-y-max")?.addEventListener("input", renderCost);
  window.addEventListener("resize", renderCost);
  updateCostWriteControl();
}

function selectedCostPeriod() {
  return $("cost-period-toggle").querySelector("button.active")?.dataset.period || "hourly";
}

function costPeriodMultiplier(period) {
  return period === "monthly" ? pricingMonthHours() : 1;
}

function costPeriodUnit(period) {
  return period === "monthly" ? "month" : "hour";
}

function selectedCostWriteMode() {
  return $("cost-write-mode")?.value || "constant";
}

function updateCostWriteControl() {
  const control = $("cost-write-control");
  if (!control) return;
  control.hidden = $("cost-mode").value !== "full";
}

function fmtCurrency(value) {
  const digits = value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `$${fmtNumber(value, digits)}`;
}

function niceStep(rawStep) {
  if (!Number.isFinite(rawStep) || rawStep <= 0) return 1;
  const exponent = Math.floor(Math.log10(rawStep));
  const base = 10 ** exponent;
  const scaled = rawStep / base;
  const factors = [1, 2, 2.5, 5, 10];
  const factor = factors.reduce((best, item) => {
    return Math.abs(item - scaled) < Math.abs(best - scaled) ? item : best;
  }, factors[0]);
  return factor * base;
}

function niceTicks(maxValue, targetIntervals = 5) {
  const safeMax = Math.max(1, maxValue || 1);
  const step = niceStep(safeMax / targetIntervals);
  const top = Math.ceil(safeMax / step) * step;
  const ticks = [];
  for (let value = 0; value <= top + step * 0.25; value += step) ticks.push(value);
  return ticks;
}

function boundedTicks(maxValue, targetIntervals = 5) {
  const ticks = niceTicks(maxValue, targetIntervals).filter((tick) => tick <= maxValue + 1e-9);
  const last = ticks.at(-1);
  if (last === undefined || Math.abs(last - maxValue) > 1e-9) ticks.push(maxValue);
  return ticks;
}

function pricingMonthHours() {
  return state.cost?.pricing?.monthly_hours || MONTHLY_HOURS;
}

function productCostFamily(product) {
  const lower = (product || "").toLowerCase();
  if (lower.includes("zilliz")) return "zilliz";
  if (lower.includes("pinecone")) return "pinecone";
  if (lower.includes("turbo")) return "turbopuffer";
  return "other";
}

function isFixedCostProduct(pointOrGroup) {
  const lower = (pointOrGroup.product || "").toLowerCase();
  return lower.includes("zilliz") || (lower.includes("turbo") && lower.includes("pinned"));
}

function scenarioWriteShape(scenarioId, writeMode) {
  const scenario = state.cost?.pricing?.scenarios?.[scenarioId] || {};
  const recordCount = Number(scenario.record_count || 0);
  const vectorDataGb = Number(scenario.vector_data_gb || 0);
  const monthlyHours = pricingMonthHours();
  if (!recordCount || !vectorDataGb || !monthlyHours) return null;
  const secondsPerMonth = monthlyHours * 3600;
  const constantRps = Number(scenario.constant_write_requests_per_second || 0);
  const batchSize = Number(scenario.batch_size_records || 0);
  const recordsPerRequest = writeMode === "batch" && batchSize > 0
    ? batchSize
    : recordCount / Math.max(1, constantRps * secondsPerMonth);
  const requestsPerMonth = recordCount / Math.max(1, recordsPerRequest);
  const bytesPerRecord = (vectorDataGb * 1e9) / recordCount;
  return {
    recordCount,
    vectorDataGb,
    recordsPerRequest,
    requestsPerMonth,
    requestBytes: recordsPerRequest * bytesPerRecord,
    monthlyHours,
  };
}

function turbopufferBatchDiscount(requestKb) {
  if (!Number.isFinite(requestKb) || requestKb <= 0) return 0;
  const cap = state.cost?.pricing?.turbopuffer?.batch_discount_cap ?? 0.5;
  return Math.max(0, Math.min(cap, (Math.log10(requestKb) - 1) * 0.2));
}

function computedWriteCostHr(point, scenarioId, writeMode) {
  const family = productCostFamily(point.product);
  if (family === "zilliz") return 0;
  const shape = scenarioWriteShape(scenarioId, writeMode);
  if (!shape) return point.write_cost_hr || 0;
  if (family === "turbopuffer") {
    const pricing = state.cost?.pricing?.turbopuffer || {};
    const minKb = pricing.min_write_kb_per_request || 10;
    const pricePerGb = pricing.write_usd_per_logical_gb || 0;
    const requestKb = shape.requestBytes / 1000;
    const billableKb = Math.max(requestKb, minKb);
    const discount = turbopufferBatchDiscount(billableKb);
    const billableGbMonth = (shape.requestsPerMonth * billableKb * (1 - discount)) / 1e6;
    return (billableGbMonth * pricePerGb) / shape.monthlyHours;
  }
  if (family === "pinecone") {
    const pricing = state.cost?.pricing?.pinecone || {};
    const unitBytes = pricing.write_unit_bytes || 1024;
    const minWu = pricing.min_write_units_per_request || 5;
    const pricePerMillion = pricing.write_usd_per_million_wu || 0;
    const wuPerRequest = Math.max(Math.ceil(shape.requestBytes / unitBytes), minWu);
    const wuMonth = shape.requestsPerMonth * wuPerRequest;
    return (wuMonth / 1e6 * pricePerMillion) / shape.monthlyHours;
  }
  return point.write_cost_hr || 0;
}

function writeAddCost(point, mode, multiplier = 1, scenarioId = "single", writeMode = "constant") {
  return mode === "full" ? computedWriteCostHr(point, scenarioId, writeMode) * multiplier : 0;
}

function pointCost(point, mode, multiplier = 1, scenarioId = "single", writeMode = "constant") {
  let cost = point.search_cost_hr;
  if (mode === "search_storage" || mode === "full") cost += point.storage_cost_hr || 0;
  cost += writeAddCost(point, mode, multiplier, scenarioId, writeMode) / multiplier;
  return cost * multiplier;
}

function costAtSegment(pointA, pointB, qps) {
  if (pointA.qps === pointB.qps) return pointA.cost;
  const ratio = (qps - pointA.qps) / (pointB.qps - pointA.qps);
  return pointA.cost + ratio * (pointB.cost - pointA.cost);
}

function lineCrossovers(groups) {
  const crossovers = [];
  for (let i = 0; i < groups.length; i += 1) {
    for (let j = i + 1; j < groups.length; j += 1) {
      const left = groups[i];
      const right = groups[j];
      for (let li = 0; li < left.rows.length - 1; li += 1) {
        const a1 = left.rows[li];
        const a2 = left.rows[li + 1];
        for (let ri = 0; ri < right.rows.length - 1; ri += 1) {
          const b1 = right.rows[ri];
          const b2 = right.rows[ri + 1];
          const minQps = Math.max(Math.min(a1.qps, a2.qps), Math.min(b1.qps, b2.qps));
          const maxQps = Math.min(Math.max(a1.qps, a2.qps), Math.max(b1.qps, b2.qps));
          if (minQps > maxQps) continue;
          const aSlope = a2.qps === a1.qps ? 0 : (a2.cost - a1.cost) / (a2.qps - a1.qps);
          const bSlope = b2.qps === b1.qps ? 0 : (b2.cost - b1.cost) / (b2.qps - b1.qps);
          const denominator = aSlope - bSlope;
          if (Math.abs(denominator) < 1e-9) continue;
          const qps = (b1.cost - a1.cost + aSlope * a1.qps - bSlope * b1.qps) / denominator;
          if (qps < minQps - 1e-6 || qps > maxQps + 1e-6) continue;
          const cost = costAtSegment(a1, a2, qps);
          const key = `${left.product}|${right.product}|${qps.toFixed(2)}`;
          if (crossovers.some((item) => item.key === key)) continue;
          crossovers.push({
            key,
            productA: left.product,
            productB: right.product,
            qps,
            cost,
          });
        }
      }
    }
  }
  return crossovers.sort((a, b) => a.qps - b.qps);
}

function defaultCostQpsMax(scenarioId) {
  return scenarioId === "multi" ? 150 : 50;
}

function costAtQps(rows, qps) {
  const sorted = rows.slice().sort((a, b) => a.qps - b.qps);
  if (!sorted.length) return null;
  if (qps <= sorted[0].qps) return sorted[0].cost;
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const left = sorted[i];
    const right = sorted[i + 1];
    if (qps >= left.qps && qps <= right.qps) return costAtSegment(left, right, qps);
  }
  return sorted[sorted.length - 1].cost;
}

function extrapolatedCostAtQps(rows, qps, mode, multiplier, scenarioId, writeMode) {
  const sorted = rows.slice().sort((a, b) => a.qps - b.qps);
  if (!sorted.length) return null;
  if (qps <= sorted[0].qps) {
    const zero = { ...sorted[0], qps: 0, cost: zeroQpsCost(sorted[0], mode, multiplier, scenarioId, writeMode) };
    return costAtSegment(zero, sorted[0], qps);
  }
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const left = sorted[i];
    const right = sorted[i + 1];
    if (qps >= left.qps && qps <= right.qps) return costAtSegment(left, right, qps);
  }
  if (sorted.length === 1) return sorted[0].cost;
  const left = sorted[sorted.length - 2];
  const right = sorted[sorted.length - 1];
  return costAtSegment(left, right, qps);
}

function zeroQpsCost(point, mode, multiplier = 1, scenarioId = "single", writeMode = "constant") {
  if (isFixedCostProduct(point)) return pointCost(point, mode, multiplier, scenarioId, writeMode);
  let cost = 0;
  if (mode === "search_storage" || mode === "full") cost += point.storage_cost_hr || 0;
  if (mode === "full") cost += computedWriteCostHr(point, scenarioId, writeMode);
  return cost * multiplier;
}

function costProductSearchAliases(product, scenarioId) {
  const lower = product.toLowerCase();
  if (scenarioId === "single") {
    if (lower.includes("tiered")) return ["zilliz_cloud_tiered_4cu"];
    if (lower.includes("capacity")) return ["zilliz_cloud_capacity_12cu", "zilliz_cloud_cap_12cu", "zillz_cloud_cap_12cu"];
    if (lower.includes("pinecone")) return ["pinecone_serverless", "pinecone"];
    if (lower.includes("turbo") && lower.includes("pinned")) return ["turbopuffer_pinned"];
    if (lower.includes("turbo")) return ["turbopuffer_unpinned"];
  }
  if (lower.includes("tiered")) return ["zilliz_cloud_tiered_1cu"];
  if (lower.includes("capacity")) return ["zilliz_cloud_capacity_2cu"];
  if (lower.includes("pinecone")) return ["pinecone_serverless", "pinecone"];
  if (lower.includes("turbo")) return ["turbopuffer"];
  return [];
}

function measuredCostCutoffs(scenarioId) {
  const rows = scenarioId === "single" ? state.payload : state.multi;
  const candidates = rows.filter((row) => {
    return row.phase === "concurrent_qps"
      && row.filterKey === "unfiltered/na"
      && row.payload !== "scalar_label"
      && !row.mocked
      && row.maxQps > 0;
  });
  const cutoffs = new Map();
  for (const point of state.cost.scenarios[scenarioId].points) {
    if (cutoffs.has(point.product)) continue;
    const aliases = costProductSearchAliases(point.product, scenarioId);
    const match = candidates
      .filter((row) => aliases.includes(row.product))
      .sort((a, b) => b.maxQps - a.maxQps)[0];
    if (match) {
      cutoffs.set(point.product, {
        qps: match.maxQps,
        payload: match.payload,
        path: match.path,
      });
    }
  }
  return cutoffs;
}

function applyMeasuredCutoff(rows, cutoffQps, mode, multiplier, scenarioId, writeMode) {
  const sorted = rows.slice().sort((a, b) => a.qps - b.qps);
  if (!sorted.length || !cutoffQps || cutoffQps <= 0) return sorted;
  const result = sorted.filter((row) => row.qps < cutoffQps);
  const exact = sorted.find((row) => Math.abs(row.qps - cutoffQps) < 1e-6);
  if (exact) {
    result.push(exact);
    return result.sort((a, b) => a.qps - b.qps);
  }
  const endpointCost = extrapolatedCostAtQps(sorted, cutoffQps, mode, multiplier, scenarioId, writeMode);
  if (endpointCost === null) return sorted;
  const source = result.at(-1) || sorted[0];
  result.push({
    ...source,
    qps: cutoffQps,
    cost: endpointCost,
    measuredCutoff: true,
  });
  return result.sort((a, b) => a.qps - b.qps);
}

function captureCostMotion() {
  const elements = document.querySelectorAll("#cost-chart [data-motion-key]");
  const snapshot = new Map();
  elements.forEach((element) => {
    snapshot.set(element.dataset.motionKey, {
      left: element.style.left,
      top: element.style.top,
      width: element.style.width,
      transform: element.style.transform,
    });
  });
  return snapshot;
}

function animateCostMotion(previous) {
  if (!previous?.size || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const elements = document.querySelectorAll("#cost-chart [data-motion-key]");
  elements.forEach((element) => {
    const from = previous.get(element.dataset.motionKey);
    if (!from) return;
    const to = {
      left: element.style.left,
      top: element.style.top,
      width: element.style.width,
      transform: element.style.transform,
    };
    element.classList.add("cost-motion");
    element.style.transition = "none";
    if (from.left) element.style.left = from.left;
    if (from.top) element.style.top = from.top;
    if (from.width) element.style.width = from.width;
    if (from.transform) element.style.transform = from.transform;
    element.getBoundingClientRect();
    requestAnimationFrame(() => {
      element.style.transition = "";
      element.style.left = to.left;
      element.style.top = to.top;
      element.style.width = to.width;
      element.style.transform = to.transform;
    });
  });
}

function renderCost() {
  const previousMotion = captureCostMotion();
  const scenarioId = $("cost-scenario").value;
  const mode = $("cost-mode").value;
  const writeMode = selectedCostWriteMode();
  const period = selectedCostPeriod();
  const multiplier = costPeriodMultiplier(period);
  const unit = costPeriodUnit(period);
  const scenario = state.cost.scenarios[scenarioId];
  const points = scenario.points
    .map((point) => ({
      ...point,
      cost: pointCost(point, mode, multiplier, scenarioId, writeMode),
      writeAdd: writeAddCost(point, mode, multiplier, scenarioId, writeMode),
    }))
    .filter((point) => point.qps > 0 && point.cost >= 0);
  const cutoffs = measuredCostCutoffs(scenarioId);
  const availableWidth = $("cost-chart").clientWidth || 1120;
  const plotWidth = Math.max(680, Math.min(1160, availableWidth - 220));
  const plotHeight = 360;
  const absoluteMaxQps = Math.max(1, ...points.map((point) => point.qps), ...[...cutoffs.values()].map((point) => point.qps));
  const requestedMaxQps = Number($("cost-qps-max").value) || defaultCostQpsMax(scenarioId);
  const maxQps = Math.min(Math.max(1, requestedMaxQps), absoluteMaxQps);
  const productGroups = [...groupBy(points, (point) => point.product).entries()]
    .map(([product, rows]) => {
      const cutoff = cutoffs.get(product);
      return {
        product,
        rows: applyMeasuredCutoff(rows, cutoff?.qps, mode, multiplier, scenarioId, writeMode),
        cutoff,
      };
    })
    .sort((a, b) => a.product.localeCompare(b.product));
  const crossovers = lineCrossovers(productGroups);
  const visibleCrossovers = crossovers.filter((point) => point.qps <= maxQps);
  const visibleCutoffs = productGroups
    .filter((group) => group.cutoff?.qps > 0 && group.cutoff.qps < maxQps)
    .map((group) => ({
      product: group.product,
      color: productColor(group.product),
      ...group.cutoff,
      cost: extrapolatedCostAtQps(group.rows, group.cutoff.qps, mode, multiplier, scenarioId, writeMode),
    }));
  const visibleCosts = points
    .filter((point) => point.qps <= maxQps)
    .map((point) => point.cost)
    .concat(visibleCrossovers.map((point) => point.cost));
  productGroups.forEach((group) => {
    const boundaryCost = costAtQps(group.rows, maxQps);
    if (boundaryCost !== null) visibleCosts.push(boundaryCost);
  });
  const requestedMaxCost = Number($("cost-y-max")?.value || 0);
  const autoMaxCost = niceTicks(Math.max(1, ...visibleCosts) * 1.16).at(-1);
  const maxCost = requestedMaxCost > 0 ? requestedMaxCost : autoMaxCost;
  const xTicks = niceTicks(maxQps);
  const yTicks = boundedTicks(maxCost);
  const xPx = (qps) => (qps / maxQps) * plotWidth;
  const yPx = (cost) => plotHeight - (cost / maxCost) * plotHeight;
  const lines = productGroups.map((group) => {
    const color = productColor(group.product);
    const drawRows = group.rows.length
      ? [{ ...group.rows[0], qps: 0, cost: zeroQpsCost(group.rows[0], mode, multiplier, scenarioId, writeMode) }, ...group.rows]
      : [];
    const segments = drawRows.slice(0, -1).map((point, index) => {
      const next = drawRows[index + 1];
      if (point.qps > maxQps) return "";
      const end = next.qps > maxQps
        ? { ...next, qps: maxQps, cost: costAtSegment(point, next, maxQps) }
        : next;
      const x1 = xPx(point.qps);
      const y1 = yPx(point.cost);
      const x2 = xPx(end.qps);
      const y2 = yPx(end.cost);
      const dx = x2 - x1;
      const dy = y2 - y1;
      const length = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx) * 180 / Math.PI;
      if (length < 1) return "";
      const motionKey = `${group.product}|${point.qps}|${end.qps}`;
      const data = `data-product="${escapeHtml(group.product)}" data-qps-start="${point.qps}" data-qps-end="${end.qps}" data-cost-start="${point.cost}" data-cost-end="${end.cost}" data-write-add="${point.writeAdd || 0}" data-unit="${unit}"`;
      return `<span class="cost-line-segment" data-motion-key="segment|${escapeHtml(motionKey)}" style="left:${x1}px;top:${y1 - 1.5}px;width:${length}px;transform:rotate(${angle}deg);background:${color};"></span>
        <span class="cost-line-hit" data-motion-key="hit|${escapeHtml(motionKey)}" ${data} style="left:${x1}px;top:${y1 - 9}px;width:${length}px;transform:rotate(${angle}deg);"></span>`;
    }).join("");
    return `<div class="cost-line-series">${segments}</div>`;
  }).join("");
  const crossoverMarkers = visibleCrossovers.map((point) => {
    const x = xPx(point.qps);
    const y = yPx(point.cost);
    const label = `${point.productA} / ${point.productB}`;
    return `<span class="cost-crossover-point" data-motion-key="crossover|${escapeHtml(point.key)}" style="left:${x}px;top:${y}px;">
      <span class="cost-crossover-tip">
        <strong>${escapeHtml(label)}</strong>
        <span>${fmtNumber(point.qps, 2)} QPS</span>
        <span>${fmtCurrency(point.cost)} / ${unit}</span>
      </span>
    </span>`;
  }).join("");
  const cutoffMarkers = visibleCutoffs.map((point) => {
    const x = xPx(point.qps);
    return `<span class="cost-cutoff-line" data-motion-key="cutoff|${escapeHtml(point.product)}" style="left:${x}px;color:${point.color};">
      <span class="cost-cutoff-tip">
        <strong>${escapeHtml(point.product)}</strong>
        <span>Measured unfiltered cutoff</span>
        <span>${fmtNumber(point.qps, 2)} QPS · ${payloadLabel(point.payload)}</span>
        <span>${fmtCurrency(point.cost)} / ${unit}</span>
      </span>
    </span>`;
  }).join("");
  const xGrid = xTicks.map((tick) => {
    const x = xPx(tick);
    return `<span class="cost-x-grid" style="left:${x}px"></span><span class="cost-x-label" style="left:${x}px">${fmtNumber(tick, tick >= 100 ? 0 : 1)}</span>`;
  }).join("");
  const yGrid = yTicks.map((tick) => {
    const y = yPx(tick);
    return `<span class="cost-y-grid" style="top:${y}px"></span><span class="cost-y-label" style="top:${y}px">${fmtCurrency(tick)}</span>`;
  }).join("");
  const legend = productGroups.map((group) => {
    return `<span><i style="background:${productColor(group.product)}"></i>${escapeHtml(group.product)}</span>`;
  }).join("")
    + (visibleCutoffs.length ? `<span class="cost-cutoff-legend"><i></i> measured QPS cutoff</span>` : "")
    + (visibleCrossovers.length ? `<span class="cost-crossover-legend"><i></i> crossover points</span>` : "");
  const modeLabel = state.cost.modes.find((item) => item.id === mode)?.label || mode;
  const writeLabel = writeMode === "batch" ? "10k batches" : "constant writes";
  const modeSuffix = mode === "full" ? ` · ${writeLabel}` : "";
  $("cost-chart").innerHTML = `
    <div class="card cost-line-card">
      <div class="card-head"><strong>Cost vs. QPS Pareto</strong><span>${modeLabel}${modeSuffix} · lower is better</span></div>
      <div class="cost-legend">${legend}</div>
      <div class="cost-html-chart" role="img" aria-label="Cost versus QPS line chart">
        <div class="cost-y-title">Cost (USD / ${unit})</div>
        <div class="cost-plot" style="--cost-plot-width:${plotWidth}px;--cost-plot-height:${plotHeight}px;">
          ${xGrid}
          ${yGrid}
          ${lines}
          ${cutoffMarkers}
          ${crossoverMarkers}
          <div class="cost-line-tooltip" id="cost-line-tooltip"></div>
        </div>
        <div class="cost-x-title">${escapeHtml(scenario.x_label)}</div>
      </div>
    </div>`;
  $("cost-sources").innerHTML = state.cost.sources.map((source) => {
    if (source.url) return `<span>${source.name}: <a href="${source.url}">${source.url}</a></span>`;
    return `<span>${source.name}: <code>${source.path}</code></span>`;
  }).join("<br>");
  animateCostMotion(previousMotion);
  attachCostLineHover();
}

function attachCostLineHover() {
  const tooltip = $("cost-line-tooltip");
  const plot = document.querySelector(".cost-plot");
  if (!tooltip || !plot) return;
  plot.querySelectorAll(".cost-line-hit").forEach((segment) => {
    segment.addEventListener("mousemove", (event) => {
      const length = Math.max(1, Number(segment.style.width.replace("px", "")) || segment.getBoundingClientRect().width);
      const t = Math.max(0, Math.min(1, event.offsetX / length));
      const qpsStart = Number(segment.dataset.qpsStart);
      const qpsEnd = Number(segment.dataset.qpsEnd);
      const costStart = Number(segment.dataset.costStart);
      const costEnd = Number(segment.dataset.costEnd);
      const writeAdd = Number(segment.dataset.writeAdd || 0);
      const qps = qpsStart + (qpsEnd - qpsStart) * t;
      const cost = costStart + (costEnd - costStart) * t;
      const writeLine = writeAdd > 0
        ? `<span>write add-on ${fmtCurrency(writeAdd)} / ${escapeHtml(segment.dataset.unit)}</span>`
        : "";
      tooltip.innerHTML = `<strong>${escapeHtml(segment.dataset.product)}</strong><span>${fmtNumber(qps, 2)} QPS</span><span>${fmtCurrency(cost)} / ${escapeHtml(segment.dataset.unit)}</span>${writeLine}`;
      const plotRect = plot.getBoundingClientRect();
      tooltip.style.left = `${event.clientX - plotRect.left + 14}px`;
      tooltip.style.top = `${event.clientY - plotRect.top - 14}px`;
      tooltip.classList.add("show");
    });
    segment.addEventListener("mouseleave", () => tooltip.classList.remove("show"));
  });
}

async function main() {
  try {
    await loadAll();
    renderInsertControls();
    renderSearchControls();
    renderColdControls();
    renderCostControls();
    renderInsert();
    renderSearch();
    renderCold();
    renderCost();
  } catch (error) {
    if ($("load-status")) $("load-status").textContent = "Failed to load leaderboard data";
    console.error(error);
  }
}

main();
