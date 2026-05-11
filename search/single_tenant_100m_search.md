# Single Tenant 100M Search Matrix

## Purpose

This document is the execution template and result tracker for exhaustive
single-tenant LAION 100M search testing across cloud vector database products.
The matrix is designed to separate three effects:

- Whether the search is unfiltered or filtered.
- Which filter type is used: integer range filter or string scalar label filter.
- Which payload is returned: IDs only, scalar label field, or vector field.
- What recall/ndcg each exact product, filter, and payload combination gets
  before measuring concurrent QPS.

All rows should use the same dataset shape unless a product cannot support it:
LAION 100M, 768 dimensions, L2, topK 100, with a serial recall phase followed
by a concurrent QPS phase unless noted.

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
| Unfiltered | none | none | IDs only | serial recall, then concurrent QPS | pending |
| Unfiltered | none | none | scalar label | serial recall, then concurrent QPS | pending |
| Unfiltered | none | none | vector | serial recall, then concurrent QPS | pending |
| Integer filtered | `--cloud-filter-rate <rate>` | `id >= int(dataset_size * rate)` | IDs only | serial recall, then concurrent QPS | pending |
| Integer filtered | `--cloud-filter-rate <rate>` | `id >= int(dataset_size * rate)` | scalar label | serial recall, then concurrent QPS | pending |
| Integer filtered | `--cloud-filter-rate <rate>` | `id >= int(dataset_size * rate)` | vector | serial recall, then concurrent QPS | pending |
| Scalar label filtered | `--cloud-label-percentage <rate>` | `label == "label_<rate>"` | IDs only | serial recall, then concurrent QPS | Tiered 4CU 1% throughput measured; recall pending |
| Scalar label filtered | `--cloud-label-percentage <rate>` | `label == "label_<rate>"` | scalar label | serial recall, then concurrent QPS | Tiered 4CU 1% throughput measured; recall pending |
| Scalar label filtered | `--cloud-label-percentage <rate>` | `label == "label_<rate>"` | vector | serial recall, then concurrent QPS | Tiered 4CU 1% throughput measured; recall pending |

Planned selectivities:

| Filter type | Candidate rates |
|---|---|
| Integer filter | `0.001`, `0.002`, `0.005`, `0.01`, `0.02`, `0.05`, `0.1`, `0.2`, `0.5` |
| Scalar label filter | `0.001`, `0.002`, `0.005`, `0.01`, `0.02`, `0.05`, `0.1`, `0.2`, `0.5` |

## Common Parameters

| Item | Value |
|---|---|
| Dataset | LAION 100M |
| Dimensions | 768 |
| Metric | L2 |
| TopK | 100 |
| Search phases | serial recall first, then concurrent QPS |
| Default concurrency list | `60,80` |
| Default duration | 60s per concurrency |
| Serial search | required for every product and every matrix row |
| Result repo | `cloud_leadboard_tests_0509` |
| VDBBench repo | `/home/ubuntu/vdbbenchleadboard2/VectorDBBench` |
| VDBBench branch | `cloud-payload-search-case` |
| Current framework commit | `2183232c0e718e64e282c8b1c51de49309dc1128` plus local cloud scalar-label changes until committed |

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
```

Every case needs two runs. Run serial search first to capture recall/ndcg for
the exact product, filter, and payload combination. Then run concurrent search
for QPS and latency.

Base Zilliz serial recall command:

```bash
.venv/bin/python -X faulthandler -m vectordb_bench.cli.vectordbbench zillizautoindex \
  --uri '<zilliz-uri>' \
  --user-name db_admin \
  --case-type CloudPayloadSearchCase \
  --payload-profile '<ids_only|scalar_label|vector>' \
  --collection-name '<collection-name>' \
  --skip-drop-old --skip-load \
  --search-serial --skip-search-concurrent \
  --db-label '<run-label>_serial_recall'
```

Base Zilliz concurrent QPS command:

```bash
.venv/bin/python -X faulthandler -m vectordb_bench.cli.vectordbbench zillizautoindex \
  --uri '<zilliz-uri>' \
  --user-name db_admin \
  --case-type CloudPayloadSearchCase \
  --payload-profile '<ids_only|scalar_label|vector>' \
  --collection-name '<collection-name>' \
  --skip-drop-old --skip-load \
  --skip-search-serial --search-concurrent \
  --num-concurrency 60,80 \
  --concurrency-duration 60 \
  --db-label '<run-label>'
```

Add exactly one filter flag for filtered runs:

```bash
# Integer filter.
--cloud-filter-rate 0.01

# Scalar string label filter.
--cloud-label-percentage 0.01
```

Product-specific commands for Pinecone and Turbopuffer should be filled after
their CloudPayloadSearchCase support and collection layout are validated.

Do not combine serial and concurrent in one run for this matrix. The current
runner initializes both stages together and executes concurrent search before
serial search when both are enabled, while this test plan requires serial recall
to be captured first.

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
| `results[0].task_config.case_config.custom_case.payload_profile` | Payload profile requested |
| `results[0].task_config.case_config.custom_case.filter_rate` | Integer filter rate, if present |
| `results[0].task_config.case_config.custom_case.label_percentage` | Scalar label selectivity, if present |
| `results[0].metrics.qps` | Maximum QPS across the tested concurrency list |
| `results[0].metrics.conc_num_list` | Concurrency levels tested |
| `results[0].metrics.conc_qps_list` | QPS at each concurrency level |
| `results[0].metrics.conc_latency_avg_list` | Average latency at each concurrency level |
| `results[0].metrics.conc_latency_p95_list` | P95 latency at each concurrency level |
| `results[0].metrics.conc_latency_p99_list` | P99 latency at each concurrency level |
| `results[0].metrics.payload_estimated_bytes_per_query` | Estimated returned bytes/query |
| `results[0].metrics.recall`, `results[0].metrics.ndcg` | Recall and NDCG from the serial run |
| `results[0].metrics.serial_latency_p99`, `results[0].metrics.serial_latency_p95` | Serial latency from the recall run |

A case is complete only when both artifacts are recorded:

| Artifact | Required contents |
|---|---|
| Serial recall JSON | recall, ndcg, serial p95, serial p99 |
| Concurrent QPS JSON | max QPS, per-concurrency QPS, average/p95/p99 latency |

Raw JSON outputs copied into this repository are stored under
`search/raw_results/` and indexed by
`search/raw_results/manifest.jsonl`. Use the manifest as the machine-readable
source for official leaderboard ingestion.

## Zilliz Cloud Tiered 4CU

| Item | Value |
|---|---|
| Collection | `LAION100M` |
| Scalar label field | `label` |
| Scalar label index | `labels_idx` |
| Logical row count | 100,000,000 |

### Unfiltered Search

| Payload | Serial JSON | Recall | NDCG | Concurrent JSON | QPS @60 | QPS @80 | Max QPS | Avg latency @60/@80 | P95 @60/@80 | P99 @60/@80 | Status |
|---|---|---:|---:|---|---:|---:|---:|---|---|---|---|
| IDs only | `search/raw_results/zilliz_cloud_tiered_4cu/unfiltered/na/ids_only/serial_recall/result_20260511_6342b75c2e3a42f08701f5102d4d627d_zillizcloud.json` | 0.951 | 0.9617 | TBD | TBD | TBD | TBD | TBD | TBD | TBD | recall measured; throughput pending |
| scalar label | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| vector | TBD | TBD | TBD | `search/raw_results/zilliz_cloud_tiered_4cu/unfiltered/na/vector/concurrent_qps/result_20260509_6b3cbbfcc62d4752b1afbdc2f0874ee3_zillizcloud.json` | 32.8253 | 44.0385 | 44.0385 | 1.8196s / 1.7981s | 2.2119s / 2.0263s | 11.5227s / 2.7943s | throughput measured; recall pending |

### Integer Filtered Search

| Selectivity | Payload | Serial JSON | Recall | NDCG | Concurrent JSON | QPS @60 | QPS @80 | Max QPS | Avg latency @60/@80 | P95 @60/@80 | P99 @60/@80 | Status |
|---:|---|---|---:|---:|---|---:|---:|---:|---|---|---|---|
| 0.1% | IDs only | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| 0.1% | scalar label | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| 0.1% | vector | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| 0.2% | IDs only | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| 0.2% | scalar label | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| 0.2% | vector | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| 0.5% | IDs only | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| 0.5% | scalar label | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| 0.5% | vector | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| 1% | IDs only | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| 1% | scalar label | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| 1% | vector | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| 2% | IDs only | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| 2% | scalar label | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| 2% | vector | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| 5% | IDs only | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| 5% | scalar label | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| 5% | vector | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| 10% | IDs only | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| 10% | scalar label | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| 10% | vector | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| 20% | IDs only | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| 20% | scalar label | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| 20% | vector | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| 50% | IDs only | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| 50% | scalar label | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| 50% | vector | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |

### Scalar Label Filtered Search

1% selectivity means `label == "label_1p"`, approximately 1M matched rows.

| Selectivity | Payload | Serial JSON | Recall | NDCG | Concurrent JSON | QPS @60 | QPS @80 | Max QPS | Avg latency @60/@80 | P95 @60/@80 | P99 @60/@80 | Payload bytes/query | Status |
|---:|---|---|---:|---:|---|---:|---:|---:|---|---|---|---:|---|
| 0.1% | IDs only | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| 0.1% | scalar label | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| 0.1% | vector | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| 0.2% | IDs only | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| 0.2% | scalar label | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| 0.2% | vector | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| 0.5% | IDs only | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| 0.5% | scalar label | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| 0.5% | vector | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| 1% | IDs only | TBD | TBD | TBD | `search/raw_results/zilliz_cloud_tiered_4cu/scalar_label_filter/1p/ids_only/concurrent_qps/result_20260511_256d6ebeeaae45a8b269a97c3175b254_zillizcloud.json` | 81.3103 | 89.6180 | 89.6180 | 0.7346s / 0.8844s | 0.8674s / 0.9983s | 2.2083s / 1.1814s | 2,000 | throughput measured; recall pending |
| 1% | scalar label | TBD | TBD | TBD | `search/raw_results/zilliz_cloud_tiered_4cu/scalar_label_filter/1p/scalar_label/concurrent_qps/result_20260511_9bfaa3afe288417eb9a550605e2affec_zillizcloud.json` | 79.6971 | 84.9877 | 84.9877 | 0.7479s / 0.9323s | 0.8925s / 1.1024s | 1.0073s / 1.2081s | 3,600 | throughput measured; recall pending |
| 1% | vector | TBD | TBD | TBD | `search/raw_results/zilliz_cloud_tiered_4cu/scalar_label_filter/1p/vector/concurrent_qps/result_20260511_129cbbc9f61f464193a990d90f239fbb_zillizcloud.json` | 57.3345 | 62.8719 | 62.8719 | 1.0400s / 1.2610s | 1.4088s / 1.5810s | 1.7919s / 1.7895s | 309,200 | throughput measured; recall pending |
| 2% | IDs only | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| 2% | scalar label | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| 2% | vector | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| 5% | IDs only | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| 5% | scalar label | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| 5% | vector | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| 10% | IDs only | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| 10% | scalar label | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| 10% | vector | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| 20% | IDs only | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| 20% | scalar label | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| 20% | vector | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| 50% | IDs only | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| 50% | scalar label | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| 50% | vector | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |

## Zilliz Cloud Capacity 12CU

| Item | Value |
|---|---|
| Collection | `LAION100M_capacity` |
| Scalar label field | `label` |
| Scalar label index | `labels_idx` |
| Logical row count | 100,000,000 |

### Unfiltered Search

| Payload | Serial JSON | Recall | NDCG | Concurrent JSON | QPS @60 | QPS @80 | Max QPS | Avg latency @60/@80 | P95 @60/@80 | P99 @60/@80 | Status |
|---|---|---:|---:|---|---:|---:|---:|---|---|---|---|
| IDs only | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| scalar label | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| vector | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |

### Integer Filtered Search

| Selectivity | Payload | Serial JSON | Recall | NDCG | Concurrent JSON | QPS @60 | QPS @80 | Max QPS | Avg latency @60/@80 | P95 @60/@80 | P99 @60/@80 | Status |
|---:|---|---|---:|---:|---|---:|---:|---:|---|---|---|---|
| TBD | IDs only | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| TBD | scalar label | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| TBD | vector | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |

### Scalar Label Filtered Search

| Selectivity | Payload | Serial JSON | Recall | NDCG | Concurrent JSON | QPS @60 | QPS @80 | Max QPS | Avg latency @60/@80 | P95 @60/@80 | P99 @60/@80 | Payload bytes/query | Status |
|---:|---|---|---:|---:|---|---:|---:|---:|---|---|---|---:|---|
| TBD | IDs only | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| TBD | scalar label | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| TBD | vector | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |

## Pinecone Serverless

Collection/index layout and CloudPayloadSearchCase compatibility still need to
be validated before running this section.

### Unfiltered Search

| Payload | Serial JSON | Recall | NDCG | Concurrent JSON | QPS @60 | QPS @80 | Max QPS | Avg latency @60/@80 | P95 @60/@80 | P99 @60/@80 | Status |
|---|---|---:|---:|---|---:|---:|---:|---|---|---|---|
| IDs only | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| scalar label | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| vector | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |

### Integer Filtered Search

| Selectivity | Payload | Serial JSON | Recall | NDCG | Concurrent JSON | QPS @60 | QPS @80 | Max QPS | Avg latency @60/@80 | P95 @60/@80 | P99 @60/@80 | Status |
|---:|---|---|---:|---:|---|---:|---:|---:|---|---|---|---|
| TBD | IDs only | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| TBD | scalar label | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| TBD | vector | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |

### Scalar Label Filtered Search

| Selectivity | Payload | Serial JSON | Recall | NDCG | Concurrent JSON | QPS @60 | QPS @80 | Max QPS | Avg latency @60/@80 | P95 @60/@80 | P99 @60/@80 | Payload bytes/query | Status |
|---:|---|---|---:|---:|---|---:|---:|---:|---|---|---|---:|---|
| TBD | IDs only | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| TBD | scalar label | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| TBD | vector | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |

## Turbopuffer Unpinned

Namespace layout and CloudPayloadSearchCase compatibility still need to be
validated before running this section.

### Unfiltered Search

| Payload | Serial JSON | Recall | NDCG | Concurrent JSON | QPS @60 | QPS @80 | Max QPS | Avg latency @60/@80 | P95 @60/@80 | P99 @60/@80 | Status |
|---|---|---:|---:|---|---:|---:|---:|---|---|---|---|
| IDs only | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| scalar label | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| vector | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |

### Integer Filtered Search

| Selectivity | Payload | Serial JSON | Recall | NDCG | Concurrent JSON | QPS @60 | QPS @80 | Max QPS | Avg latency @60/@80 | P95 @60/@80 | P99 @60/@80 | Status |
|---:|---|---|---:|---:|---|---:|---:|---:|---|---|---|---|
| TBD | IDs only | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| TBD | scalar label | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| TBD | vector | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |

### Scalar Label Filtered Search

| Selectivity | Payload | Serial JSON | Recall | NDCG | Concurrent JSON | QPS @60 | QPS @80 | Max QPS | Avg latency @60/@80 | P95 @60/@80 | P99 @60/@80 | Payload bytes/query | Status |
|---:|---|---|---:|---:|---|---:|---:|---:|---|---|---|---:|---|
| TBD | IDs only | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| TBD | scalar label | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| TBD | vector | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |

## Turbopuffer Pinned

Namespace pinning can incur ongoing cost. Only change pinning state after an
explicit instruction.

### Unfiltered Search

| Payload | Serial JSON | Recall | NDCG | Concurrent JSON | QPS @60 | QPS @80 | Max QPS | Avg latency @60/@80 | P95 @60/@80 | P99 @60/@80 | Status |
|---|---|---:|---:|---|---:|---:|---:|---|---|---|---|
| IDs only | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| scalar label | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| vector | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |

### Integer Filtered Search

| Selectivity | Payload | Serial JSON | Recall | NDCG | Concurrent JSON | QPS @60 | QPS @80 | Max QPS | Avg latency @60/@80 | P95 @60/@80 | P99 @60/@80 | Status |
|---:|---|---|---:|---:|---|---:|---:|---:|---|---|---|---|
| TBD | IDs only | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| TBD | scalar label | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| TBD | vector | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |

### Scalar Label Filtered Search

| Selectivity | Payload | Serial JSON | Recall | NDCG | Concurrent JSON | QPS @60 | QPS @80 | Max QPS | Avg latency @60/@80 | P95 @60/@80 | P99 @60/@80 | Payload bytes/query | Status |
|---:|---|---|---:|---:|---|---:|---:|---:|---|---|---|---:|---|
| TBD | IDs only | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| TBD | scalar label | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| TBD | vector | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |

## Run Queue

Before running more jobs, select the next subset explicitly. Suggested axes:

| Axis | Options |
|---|---|
| Product | Tiered 4CU, Capacity 12CU, Pinecone serverless, Turbopuffer unpinned, Turbopuffer pinned |
| Filter mode | unfiltered, integer filtered, scalar label filtered |
| Selectivity | one or more rates from the planned selectivity table |
| Payload | IDs only, scalar label, vector |
| Concurrency | default `60,80` unless changed |
| Duration | default 60s unless changed |
| Required order | serial recall first, concurrent QPS second |

The current pause point is after Tiered 4CU scalar label filter at 1% for all
three payload profiles. Those three rows have concurrent throughput results,
but still need serial recall runs before they count as complete matrix rows.
