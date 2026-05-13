# Multitenant Search Matrix

## Purpose

This document is the execution template and result tracker for multitenant
search testing across cloud vector database products. The matrix is designed to
separate three effects:

- Which multitenant isolation model is used by the product.
- Whether the search is unfiltered or filtered.
- Which filter type is used: integer range filter or string scalar label filter.
- Which payload is returned: IDs only, scalar label field, or vector field.
- What QPS and latency each exact product, tenant layout, and payload
  combination gets.

All rows should use the same dataset shape unless a product cannot support it:
Cohere 10M, 768 dimensions, cosine metric, topK 100, with deterministic tenant
routing across 1,000 tenants. This report does not include an accuracy phase or
accuracy columns.

## Table of Contents

- [Execution Matrix](#execution-matrix)
- [Common Parameters](#common-parameters)
- [VDBBench Invocation](#vdbbench-invocation)
- [Result JSON Interpretation](#result-json-interpretation)
- [Zilliz Cloud Tiered 4CU](#zilliz-cloud-tiered-4cu)
- [Zilliz Cloud Capacity 12CU](#zilliz-cloud-capacity-12cu)
- [Pinecone Serverless](#pinecone-serverless)
- [Turbopuffer Unpinned](#turbopuffer-unpinned)
- [Turbopuffer Pinned](#turbopuffer-pinned)
- [Run Queue](#run-queue)

## Execution Matrix

Each product section should eventually contain this full matrix.

| Search mode | Filter flag | Filter expression | Payload profile | Required phases | Status |
|---|---|---|---|---|---|
| Unfiltered | none | tenant routing only | IDs only | concurrent QPS | pending |
| Unfiltered | none | tenant routing only | scalar label | concurrent QPS | pending |
| Unfiltered | none | tenant routing only | vector | concurrent QPS | pending |
| Integer filtered | `--cloud-filter-rate <rate>` | tenant routing plus `id >= int(dataset_size * rate)` | IDs only | concurrent QPS | pending |
| Integer filtered | `--cloud-filter-rate <rate>` | tenant routing plus `id >= int(dataset_size * rate)` | scalar label | concurrent QPS | pending |
| Integer filtered | `--cloud-filter-rate <rate>` | tenant routing plus `id >= int(dataset_size * rate)` | vector | concurrent QPS | pending |
| Scalar label filtered | `--cloud-label-percentage <rate>` | tenant routing plus `label == "label_<rate>"` | IDs only | concurrent QPS | pending |
| Scalar label filtered | `--cloud-label-percentage <rate>` | tenant routing plus `label == "label_<rate>"` | scalar label | concurrent QPS | pending |
| Scalar label filtered | `--cloud-label-percentage <rate>` | tenant routing plus `label == "label_<rate>"` | vector | concurrent QPS | pending |

Planned selectivities:

| Filter type | Candidate rates |
|---|---|
| Integer filter | `0.001`, `0.01`, `0.1`, `0.5` |
| Scalar label filter | `0.001`, `0.002`, `0.005`, `0.01`, `0.02`, `0.05`, `0.1`, `0.2`, `0.5` |

Product tenant mappings:

| Product | Tenant mapping |
|---|---|
| Zilliz Cloud | partition key on tenant label |
| Pinecone Serverless | namespace per tenant |
| Turbopuffer | namespace per tenant |

## Common Parameters

| Item | Value |
|---|---|
| Dataset | `Large Cohere (768dim, 10M)` |
| Dimensions | 768 |
| Metric | cosine |
| TopK | 100 |
| Tenant count | 1,000 |
| Tenant label format | `tenant_0000` through `tenant_0999` |
| Tenant assignment | `tenant_id = row_id % tenant_count` |
| Search phases | concurrent QPS and latency only |
| Default concurrency list | `60,80` |
| Default duration | 60s per concurrency |
| Result repo | `cloud_leadboard_tests_0509` |
| VDBBench repo | `/home/ubuntu/vdbbenchleadboard2/VectorDBBench` |
| VDBBench branch | `multitenant-vdbbench` |
| Current framework commits | `69da895` multitenant case, `5caecbc` payload support |

Payload estimates currently emitted by VDBBench:

| Payload profile | Meaning | Estimated bytes/query at topK 100 |
|---|---|---:|
| `ids_only` | primary key plus distance | 2,000 |
| `scalar_label` | primary key, distance, and label string | 3,600 |
| `vector` | primary key, distance, and 768D float vector | 309,200 |

## VDBBench Invocation

Set credentials outside the repository. Do not commit credentials or private
service URLs.

```bash
export DATASET_LOCAL_DIR=/mnt/instance/vectordb_bench/dataset
export ZILLIZ_PASSWORD='<password>'
export ZILLIZ_TOKEN='<token>'
export PINECONE_API_KEY='<api-key>'
export TURBOPUFFER_API_KEY='<api-key>'
```

This report tracks measured search rows only. The target collection or index
must already be loaded and verified for the same tenant layout and payload
schema before running these commands.

Base Zilliz concurrent QPS command:

```bash
.venv/bin/python -X faulthandler -m vectordb_bench.cli.vectordbbench zillizautoindex \
  --uri '<zilliz-uri>' \
  --user-name db_admin \
  --case-type MultiTenantPerformanceCase \
  --dataset-with-size-type 'Large Cohere (768dim, 10M)' \
  --tenant-count 1000 \
  --tenant-prefix tenant_ \
  --tenant-id-width 4 \
  --payload-profile '<ids_only|scalar_label|vector>' \
  --collection-name '<collection-name>' \
  --skip-drop-old --skip-load \
  --skip-search-serial --search-concurrent \
  --num-concurrency 60,80 \
  --concurrency-duration 60 \
  --db-label '<run-label>'
```

Add exactly one filter flag for filtered rows:

```bash
# Integer filter.
--cloud-filter-rate 0.01

# Scalar string label filter.
--cloud-label-percentage 0.01
```

For Zilliz Cloud and Milvus-compatible clients, run this case only with the
partition-key collection configuration enabled. The task runner rejects
multitenant Zilliz/Milvus runs without partition-key tenant isolation.

Base Pinecone concurrent QPS command:

```bash
.venv/bin/python -X faulthandler -m vectordb_bench.cli.vectordbbench pinecone \
  --api-key "$PINECONE_API_KEY" \
  --index-name '<index-name>' \
  --case-type MultiTenantPerformanceCase \
  --dataset-with-size-type 'Large Cohere (768dim, 10M)' \
  --tenant-count 1000 \
  --tenant-prefix tenant_ \
  --tenant-id-width 4 \
  --payload-profile '<ids_only|scalar_label|vector>' \
  --skip-drop-old --skip-load \
  --skip-search-serial --search-concurrent \
  --num-concurrency 60,80 \
  --concurrency-duration 60 \
  --db-label '<run-label>'
```

Base Turbopuffer concurrent QPS command:

```bash
.venv/bin/python -X faulthandler -m vectordb_bench.cli.vectordbbench turbopuffer \
  --api-key "$TURBOPUFFER_API_KEY" \
  --region '<region>' \
  --namespace '<base-namespace>' \
  --case-type MultiTenantPerformanceCase \
  --dataset-with-size-type 'Large Cohere (768dim, 10M)' \
  --tenant-count 1000 \
  --tenant-prefix tenant_ \
  --tenant-id-width 4 \
  --payload-profile '<ids_only|scalar_label|vector>' \
  --skip-drop-old --skip-load \
  --skip-search-serial --search-concurrent \
  --num-concurrency 60,80 \
  --concurrency-duration 60 \
  --db-label '<run-label>'
```

## Result JSON Interpretation

Each run produces a JSON file under:

```text
vectordb_bench/results/<Product>/result_<date>_<run_id>_<product>.json
```

Read these fields:

| JSON path | Meaning |
|---|---|
| `run_id` | Unique run id used in the result filename |
| `results[0].task_config.db_config.db_label` | Human-readable run label |
| `results[0].task_config.case_config.custom_case.dataset_with_size_type` | Dataset requested |
| `results[0].task_config.case_config.custom_case.tenant_count` | Tenant count requested |
| `results[0].task_config.case_config.custom_case.tenant_prefix` | Tenant label prefix |
| `results[0].task_config.case_config.custom_case.tenant_id_width` | Zero-padding width for tenant IDs |
| `results[0].task_config.case_config.custom_case.payload_profile` | Payload profile requested |
| `results[0].task_config.case_config.custom_case.filter_rate` | Integer filter rate, if present |
| `results[0].task_config.case_config.custom_case.label_percentage` | Scalar label selectivity, if present |
| `results[0].metrics.qps` | Maximum QPS across the tested concurrency list |
| `results[0].metrics.conc_num_list` | Concurrency levels tested |
| `results[0].metrics.conc_qps_list` | QPS at each concurrency level |
| `results[0].metrics.conc_latency_avg_list` | Average latency at each concurrency level |
| `results[0].metrics.conc_latency_p95_list` | P95 latency at each concurrency level |
| `results[0].metrics.conc_latency_p99_list` | P99 latency at each concurrency level |
| `results[0].metrics.payload_profile` | Payload profile recorded by the metrics object |
| `results[0].metrics.payload_estimated_bytes_per_query` | Estimated returned bytes/query |

A case is complete when this artifact is recorded:

| Artifact | Required contents |
|---|---|
| Concurrent QPS JSON | max QPS, per-concurrency QPS, average/p95/p99 latency, payload bytes/query |

Raw JSON outputs copied into this repository should be stored under
`search/raw_results/` and indexed by
`search/raw_results/manifest.jsonl`. Use the manifest as the machine-readable
source for official leaderboard ingestion. In the result tables, the `Max QPS`
cell should link to the concurrent throughput JSON when that artifact is
present.

## Zilliz Cloud Tiered 4CU

| Item | Value |
|---|---|
| Collection | `TBD` |
| Tenant field | `label` |
| Tenant isolation | partition key |
| Logical row count | 10,000,000 |
| Tenant count | 1,000 |
| Rows per tenant | approximately 10,000 |

### Unfiltered Search

| Payload | QPS @60 | QPS @80 | Max QPS | Avg latency @60/@80 | P95 @60/@80 | P99 @60/@80 | Payload bytes/query | Status |
|---|---:|---:|---:|---|---|---|---:|---|
| IDs only | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| scalar label | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| vector | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |

### Integer Filtered Search

| Selectivity | Payload | QPS @60 | QPS @80 | Max QPS | Avg latency @60/@80 | P95 @60/@80 | P99 @60/@80 | Payload bytes/query | Status |
|---:|---|---:|---:|---:|---|---|---|---:|---|
| TBD | IDs only | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| TBD | scalar label | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| TBD | vector | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |

### Scalar Label Filtered Search

| Selectivity | Payload | QPS @60 | QPS @80 | Max QPS | Avg latency @60/@80 | P95 @60/@80 | P99 @60/@80 | Payload bytes/query | Status |
|---:|---|---:|---:|---:|---|---|---|---:|---|
| TBD | IDs only | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| TBD | scalar label | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| TBD | vector | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |

## Zilliz Cloud Capacity 12CU

| Item | Value |
|---|---|
| Collection | `TBD` |
| Tenant field | `label` |
| Tenant isolation | partition key |
| Logical row count | 10,000,000 |
| Tenant count | 1,000 |
| Rows per tenant | approximately 10,000 |

### Unfiltered Search

| Payload | QPS @60 | QPS @80 | Max QPS | Avg latency @60/@80 | P95 @60/@80 | P99 @60/@80 | Payload bytes/query | Status |
|---|---:|---:|---:|---|---|---|---:|---|
| IDs only | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| scalar label | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| vector | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |

### Integer Filtered Search

| Selectivity | Payload | QPS @60 | QPS @80 | Max QPS | Avg latency @60/@80 | P95 @60/@80 | P99 @60/@80 | Payload bytes/query | Status |
|---:|---|---:|---:|---:|---|---|---|---:|---|
| TBD | IDs only | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| TBD | scalar label | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| TBD | vector | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |

### Scalar Label Filtered Search

| Selectivity | Payload | QPS @60 | QPS @80 | Max QPS | Avg latency @60/@80 | P95 @60/@80 | P99 @60/@80 | Payload bytes/query | Status |
|---:|---|---:|---:|---:|---|---|---|---:|---|
| TBD | IDs only | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| TBD | scalar label | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| TBD | vector | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |

## Pinecone Serverless

| Item | Value |
|---|---|
| Index | `TBD` |
| Tenant isolation | namespace per tenant |
| Namespace prefix | `vdbbench_mt_` |
| Logical row count | 10,000,000 |
| Tenant count | 1,000 |
| Rows per tenant | approximately 10,000 |

### Unfiltered Search

Pinecone serverless may need a lower concurrency list if the service returns
rate-limit responses at `60,80`. Record the actual concurrency list in the row
if it differs from the default.

| Payload | QPS @60 | QPS @80 | Max QPS | Avg latency @60/@80 | P95 @60/@80 | P99 @60/@80 | Payload bytes/query | Status |
|---|---:|---:|---:|---|---|---|---:|---|
| IDs only | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| scalar label | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| vector | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |

### Integer Filtered Search

| Selectivity | Payload | QPS @60 | QPS @80 | Max QPS | Avg latency @60/@80 | P95 @60/@80 | P99 @60/@80 | Payload bytes/query | Status |
|---:|---|---:|---:|---:|---|---|---|---:|---|
| TBD | IDs only | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| TBD | scalar label | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| TBD | vector | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |

### Scalar Label Filtered Search

| Selectivity | Payload | QPS @60 | QPS @80 | Max QPS | Avg latency @60/@80 | P95 @60/@80 | P99 @60/@80 | Payload bytes/query | Status |
|---:|---|---:|---:|---:|---|---|---|---:|---|
| TBD | IDs only | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| TBD | scalar label | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| TBD | vector | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |

## Turbopuffer Unpinned

| Item | Value |
|---|---|
| Base namespace | `TBD` |
| Tenant isolation | namespace per tenant |
| Namespace prefix | `vdbbench_mt_` |
| Pinning state | unpinned |
| Logical row count | 10,000,000 |
| Tenant count | 1,000 |
| Rows per tenant | approximately 10,000 |

### Unfiltered Search

| Payload | QPS @60 | QPS @80 | Max QPS | Avg latency @60/@80 | P95 @60/@80 | P99 @60/@80 | Payload bytes/query | Status |
|---|---:|---:|---:|---|---|---|---:|---|
| IDs only | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| scalar label | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| vector | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |

### Integer Filtered Search

| Selectivity | Payload | QPS @60 | QPS @80 | Max QPS | Avg latency @60/@80 | P95 @60/@80 | P99 @60/@80 | Payload bytes/query | Status |
|---:|---|---:|---:|---:|---|---|---|---:|---|
| TBD | IDs only | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| TBD | scalar label | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| TBD | vector | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |

### Scalar Label Filtered Search

| Selectivity | Payload | QPS @60 | QPS @80 | Max QPS | Avg latency @60/@80 | P95 @60/@80 | P99 @60/@80 | Payload bytes/query | Status |
|---:|---|---:|---:|---:|---|---|---|---:|---|
| TBD | IDs only | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| TBD | scalar label | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| TBD | vector | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |

## Turbopuffer Pinned

Namespace pinning can incur ongoing cost. Only change pinning state after an
explicit instruction.

| Item | Value |
|---|---|
| Base namespace | `TBD` |
| Tenant isolation | namespace per tenant |
| Namespace prefix | `vdbbench_mt_` |
| Pinning state | pinned |
| Logical row count | 10,000,000 |
| Tenant count | 1,000 |
| Rows per tenant | approximately 10,000 |

### Unfiltered Search

| Payload | QPS @60 | QPS @80 | Max QPS | Avg latency @60/@80 | P95 @60/@80 | P99 @60/@80 | Payload bytes/query | Status |
|---|---:|---:|---:|---|---|---|---:|---|
| IDs only | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| scalar label | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| vector | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |

### Integer Filtered Search

| Selectivity | Payload | QPS @60 | QPS @80 | Max QPS | Avg latency @60/@80 | P95 @60/@80 | P99 @60/@80 | Payload bytes/query | Status |
|---:|---|---:|---:|---:|---|---|---|---:|---|
| TBD | IDs only | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| TBD | scalar label | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| TBD | vector | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |

### Scalar Label Filtered Search

| Selectivity | Payload | QPS @60 | QPS @80 | Max QPS | Avg latency @60/@80 | P95 @60/@80 | P99 @60/@80 | Payload bytes/query | Status |
|---:|---|---:|---:|---:|---|---|---|---:|---|
| TBD | IDs only | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| TBD | scalar label | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| TBD | vector | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |

## Run Queue

Before running more jobs, select the next subset explicitly. Suggested axes:

| Axis | Options |
|---|---|
| Product | Tiered 4CU, Capacity 12CU, Pinecone serverless, Turbopuffer unpinned, Turbopuffer pinned |
| Search mode | unfiltered, integer filtered, scalar label filtered |
| Selectivity | one or more rates from the planned selectivity table |
| Payload | IDs only, scalar label, vector |
| Tenant count | default `1000` unless changed |
| Concurrency | default `60,80` unless changed |
| Duration | default 60s unless changed |
| Required artifact | concurrent QPS JSON |

The current pause point is before the first official multitenant result is
recorded. Start with one product, one search mode, and one payload profile to
validate the raw JSON layout and manifest path before filling the whole matrix.
