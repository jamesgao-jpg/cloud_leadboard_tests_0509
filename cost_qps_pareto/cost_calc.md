# cost_calc.py

`cost_calc.py` builds the cost model for the cloud leaderboard and keeps
a small command-line query-only comparison table.

The calculator is now raw-result driven for measured QPS and recall. It
does not preserve old board display anchors just to match the currently
checked-in `cloudleadboard_data/cost_model.json`.

## CLI Modes

Run these from the repository root:

```bash
python3 cost_qps_pareto/cost_calc.py
python3 cost_qps_pareto/cost_calc.py 1 8 100 400
python3 cost_qps_pareto/cost_calc.py --root . --emit-cost-model
python3 cost_qps_pareto/cost_calc.py --root . --check-cost-model cloudleadboard_data/cost_model.json
```

| Mode | Command | Output | Use |
|---|---|---|---|
| Legacy query-only table | `python3 cost_qps_pareto/cost_calc.py` | Text table for QPS 1, 10, 100 | Quick Turbopuffer vs reachable Zilliz comparison. |
| Custom query-only table | `python3 cost_qps_pareto/cost_calc.py 1 8 100 400` | Text table for supplied QPS targets | Check crossover points or custom QPS intervals. |
| Emit cost model | `python3 cost_qps_pareto/cost_calc.py --root . --emit-cost-model` | Full JSON model on stdout | Generate a current raw-derived cost model. |
| Check cost model | `python3 cost_qps_pareto/cost_calc.py --root . --check-cost-model cloudleadboard_data/cost_model.json` | Exit 0 if generated JSON equals the file, exit 1 otherwise | Detect drift from the checked-in frontend model. |

`--root` points at the repo root containing `cloud_payload_search`,
`cloud_multi_tenant_search`, and `cloudleadboard_data`.

## Cost Modes

The generated JSON declares the frontend's three cost modes:

| Mode id | Label | Cost included |
|---|---|---|
| `search` | Query only | `search_cost_hr` |
| `search_storage` | Query + storage | `search_cost_hr + storage_cost_hr` |
| `full` | Query + storage + write | `search_cost_hr + storage_cost_hr + computed write cost` |

The JSON rows keep `write_cost_hr: 0`. The helper
`point_cost(..., mode="full", write_mode=...)` computes write cost for
Turbopuffer and Pinecone at runtime. Zilliz write cost is modeled as
zero because writes are included in selected CU-hours unless the workload
requires a larger cluster.

Write modes:

| Write mode | Meaning |
|---|---|
| `constant` | Uses the scenario's constant write request rate across the month. |
| `batch` | Uses the scenario batch size, currently 10,000 records/request. |

## Scenarios

| Scenario id | Label | Records | Vector data | X axis |
|---|---:|---:|---:|---|
| `single` | Single tenant LAION 100M | 100,000,000 | 302 GB | Sustained QPS |
| `multi` | Multitenant Cohere 10M | 10,000,000 | 30.2 GB | Aggregate QPS |

Both scenarios use `monthly_hours = 730`.

## Product Models

### Turbopuffer Unpinned

Search cost is computed from queried bytes and returned bytes.

Single-tenant queried namespace:

```text
100,000,000 records * 768 dims * 2 bytes / 1e9 = 153.6 GB
```

`tpuf_cost_per_query()` applies Turbopuffer queried-byte tiering:

```text
0-32 GB: full $1/PB rate
32-128 GB: 80% discount on marginal queried bytes
>128 GB: 96% discount on marginal queried bytes
minimum queried size: 1.28 GB
returned bytes: top_k * 20 bytes, currently 100 * 20
```

The single-tenant endpoint QPS and recall come from:

```text
cloud_payload_search/raw_results/turbopuffer_unpinned/unfiltered/na/ids_only
```

The multitenant endpoint QPS comes from:

```text
cloud_multi_tenant_search/raw_results/turbopuffer/unfiltered/na/ids_only
```

### Turbopuffer Pinned

Pinned mode search cost is the fixed pinning price:

```text
vector_data_gb * 2 replicas * $0.013249/GB-hour
```

For LAION 100M this is `302 * 2 * 0.013249 = $8.002/hr`.
The endpoint QPS and recall are read from the pinned raw ids-only result.

### Pinecone Serverless

Search cost is formula-based:

```text
qps * 3600 * RU_per_query / 1e6 * $16/M RU
```

Single-tenant LAION 100M uses `308 RU/query`. Multitenant uses the
`0.25 RU/query` minimum. Endpoint QPS is read from raw ids-only results.
Single-tenant recall is read when a serial recall result exists.

### Zilliz Cloud Tiered and Capacity

Search cost is fixed CU-hour pricing:

```text
Tiered:   CU * $0.372/hr
Capacity: CU * $0.248/hr
```

Endpoint QPS and recall are read from raw ids-only results for the
configured product folders:

| Scenario | Product | Raw product folder |
|---|---|---|
| single | Zilliz Cloud Tiered 4CU | `zilliz_cloud_tiered_4cu` |
| single | Zilliz Capacity 12CU | `zilliz_cloud_capacity_12cu` |
| single | Zilliz Capacity 32CU | `zilliz_cloud_capacity_32cu` |
| multi | Zilliz Tiered 1CU | `zilliz_cloud_tiered_1cu` |
| multi | Zilliz Capacity 2CU | `zilliz_cloud_capacity_2cu` |

Storage rates are still pricing constants:

```text
Turbopuffer/Pinecone: $0.33/GB-month / 730
Zilliz Tiered:        $0.025/GB-month / 730
Zilliz Capacity:      $0.04/GB-month / 730
```

## Raw Result Inputs

The generated model uses the latest matching `result_*.json` under each
raw result path and reads:

| Phase | Metric |
|---|---|
| `concurrent_qps` | max of top-level `qps` and `conc_qps_list` |
| `serial_recall` | `recall`, or `null` if no serial recall file exists |

Payload basis is ids-only:

```text
cloud_payload_search/raw_results/<product>/unfiltered/na/ids_only
cloud_multi_tenant_search/raw_results/<product>/unfiltered/na/ids_only
```

## Current Reproducibility Status

`--check-cost-model` is expected to pass against the checked-in
`cloudleadboard_data/cost_model.json`. That file should be regenerated
with `--emit-cost-model` whenever the raw result inputs or pricing
formulas change.

Old compatibility/display points such as Turbopuffer 16/400 QPS, Zilliz
Tiered 57.97 QPS, and Zilliz Capacity 12CU 310.47 QPS are no longer
emitted unless those values are present in the raw result files.
