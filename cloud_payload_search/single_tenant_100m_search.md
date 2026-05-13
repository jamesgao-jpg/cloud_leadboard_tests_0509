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
| Integer filter | `0.001`, `0.01`, `0.1`, `0.5` |
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

Every case needs two runs. Run serial search first to capture recall for
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
`cloud_payload_search/raw_results/` and indexed by
`cloud_payload_search/raw_results/manifest.jsonl`. Use the manifest as the machine-readable
source for official leaderboard ingestion. In the result tables, the `Recall`
cell links to the serial recall JSON when that artifact is present; the
`Max QPS` cell links to the concurrent throughput JSON.

## Zilliz Cloud Tiered 4CU

| Item | Value |
|---|---|
| Collection | `LAION100M` |
| Scalar label field | `label` |
| Scalar label index | `labels_idx` |
| Logical row count | 100,000,000 |

### Unfiltered Search

| Payload | Recall | QPS @60 | QPS @80 | Max QPS | Avg latency @60/@80 | P95 @60/@80 | P99 @60/@80 | Status |
|---|---:|---:|---:|---:|---|---|---|---|
| IDs only | [0.951](raw_results/zilliz_cloud_tiered_4cu/unfiltered/na/ids_only/serial_recall/result_20260511_6342b75c2e3a42f08701f5102d4d627d_zillizcloud.json) | 44.8981 | 49.1625 | [49.1625](raw_results/zilliz_cloud_tiered_4cu/unfiltered/na/ids_only/concurrent_qps/result_20260511_f3b2fc7a2a864a91a570bd623c1b57a1_zillizcloud.json) | 1.3286s / 1.6187s | 1.4682s / 1.8900s | 5.5715s / 2.2987s | measured |
| scalar label | [0.951](raw_results/zilliz_cloud_tiered_4cu/unfiltered/na/scalar_label/serial_recall/result_20260511_93415d2ccee247e390e6d75bc720937e_zillizcloud.json) | 49.0737 | 49.8156 | [49.8156](raw_results/zilliz_cloud_tiered_4cu/unfiltered/na/scalar_label/concurrent_qps/result_20260511_37330a1870d54c81af133464d39ae6a1_zillizcloud.json) | 1.2135s / 1.5885s | 1.4760s / 1.9036s | 1.6034s / 2.0174s | measured |
| vector | [0.951](raw_results/zilliz_cloud_tiered_4cu/unfiltered/na/vector/serial_recall/result_20260511_4d7523cc67104f3bb8bf87ecf8252ab3_zillizcloud.json) | 32.8253 | 44.0385 | [44.0385](raw_results/zilliz_cloud_tiered_4cu/unfiltered/na/vector/concurrent_qps/result_20260509_6b3cbbfcc62d4752b1afbdc2f0874ee3_zillizcloud.json) | 1.8196s / 1.7981s | 2.2119s / 2.0263s | 11.5227s / 2.7943s | measured |

### Integer Filtered Search

| Selectivity | Payload | Recall | QPS @60 | QPS @80 | Max QPS | Avg latency @60/@80 | P95 @60/@80 | P99 @60/@80 | Status |
|---:|---|---:|---:|---:|---:|---|---|---|---|
| 0.1% | IDs only | [0.9423](raw_results/zilliz_cloud_tiered_4cu/int_filter/0_1p/ids_only/serial_recall/result_20260511_2c060c4fbfe24d4594bd7fca2939c652_zillizcloud.json) | 783.3761 | 948.9499 | [948.9499](raw_results/zilliz_cloud_tiered_4cu/int_filter/0_1p/ids_only/concurrent_qps/result_20260511_07e226c8a9fc4f5b902c690863036d4f_zillizcloud.json) | 0.0760s / 0.0835s | 0.1022s / 0.1075s | 0.1141s / 0.1562s | measured |
| 0.1% | scalar label | [0.9423](raw_results/zilliz_cloud_tiered_4cu/int_filter/0_1p/scalar_label/serial_recall/result_20260511_f8a47e265ab84ff4b4ee4ab2842dc02b_zillizcloud.json) | 764.5844 | 940.5247 | [940.5247](raw_results/zilliz_cloud_tiered_4cu/int_filter/0_1p/scalar_label/concurrent_qps/result_20260511_c1046be4c1364e29bb617a3688d74517_zillizcloud.json) | 0.0779s / 0.0842s | 0.1029s / 0.1077s | 0.1122s / 0.1375s | measured |
| 0.1% | vector | [0.9423](raw_results/zilliz_cloud_tiered_4cu/int_filter/0_1p/vector/serial_recall/result_20260511_b2e7e9ea3c5b41e58a0617a939df1eb1_zillizcloud.json) | 729.0385 | 955.6522 | [955.6522](raw_results/zilliz_cloud_tiered_4cu/int_filter/0_1p/vector/concurrent_qps/result_20260511_afac95e59d814505ad688cb8e47281e5_zillizcloud.json) | 0.0817s / 0.0828s | 0.1079s / 0.1141s | 0.1198s / 0.1604s | measured |
| 1% | IDs only | [0.9557](raw_results/zilliz_cloud_tiered_4cu/int_filter/1p/ids_only/serial_recall/result_20260511_dc5fc933596e4101b9b17716e859f29c_zillizcloud.json) | 587.7227 | 694.9634 | [694.9634](raw_results/zilliz_cloud_tiered_4cu/int_filter/1p/ids_only/concurrent_qps/result_20260511_0145ffcff3574549a792518f4d608fa5_zillizcloud.json) | 0.1014s / 0.1140s | 0.1645s / 0.1752s | 0.1752s / 0.1856s | measured |
| 1% | scalar label | [0.9557](raw_results/zilliz_cloud_tiered_4cu/int_filter/1p/scalar_label/serial_recall/result_20260511_0b4db8da5a68403cb9cd5aa575ae13db_zillizcloud.json) | 581.9005 | 682.8657 | [682.8657](raw_results/zilliz_cloud_tiered_4cu/int_filter/1p/scalar_label/concurrent_qps/result_20260511_dfa96a509e2c4690a3c149b4ba283dac_zillizcloud.json) | 0.1024s / 0.1160s | 0.1656s / 0.1775s | 0.1750s / 0.1868s | measured |
| 1% | vector | [0.9557](raw_results/zilliz_cloud_tiered_4cu/int_filter/1p/vector/serial_recall/result_20260511_4829a5d39a924000b44e20384a67632d_zillizcloud.json) | 515.7132 | 599.7719 | [599.7719](raw_results/zilliz_cloud_tiered_4cu/int_filter/1p/vector/concurrent_qps/result_20260511_a5fd1f999e94429dbe11a9258bbdeea1_zillizcloud.json) | 0.1155s / 0.1319s | 0.1737s / 0.1862s | 0.1857s / 0.1966s | measured |
| 10% | IDs only | [0.9588](raw_results/zilliz_cloud_tiered_4cu/int_filter/10p/ids_only/serial_recall/result_20260511_e36b784ae6804868a4ab22f6f06c0b4f_zillizcloud.json) | 238.9813 | 255.3548 | [255.3548](raw_results/zilliz_cloud_tiered_4cu/int_filter/10p/ids_only/concurrent_qps/result_20260511_7887083605414527bde0a4389a4361d8_zillizcloud.json) | 0.2496s / 0.3107s | 0.3014s / 0.3878s | 0.3745s / 0.4119s | measured |
| 10% | scalar label | [0.9588](raw_results/zilliz_cloud_tiered_4cu/int_filter/10p/scalar_label/serial_recall/result_20260511_356abac3e78e4ca185b60106fe5c2501_zillizcloud.json) | 236.9028 | 254.5785 | [254.5785](raw_results/zilliz_cloud_tiered_4cu/int_filter/10p/scalar_label/concurrent_qps/result_20260511_2070932950a64b17ac353f7bcf0c2c63_zillizcloud.json) | 0.2519s / 0.3117s | 0.3067s / 0.3925s | 0.3717s / 0.4281s | measured |
| 10% | vector | [0.9588](raw_results/zilliz_cloud_tiered_4cu/int_filter/10p/vector/serial_recall/result_20260511_2209c78629b04b70ae39aa02a07f9dc2_zillizcloud.json) | 186.6812 | 194.9450 | [194.9450](raw_results/zilliz_cloud_tiered_4cu/int_filter/10p/vector/concurrent_qps/result_20260511_55fa8ad673364616a337fed2b86b32f2_zillizcloud.json) | 0.3194s / 0.4070s | 0.3928s / 0.4928s | 0.4613s / 0.5582s | measured |
| 50% | IDs only | [0.9543](raw_results/zilliz_cloud_tiered_4cu/int_filter/50p/ids_only/serial_recall/result_20260511_03d11c6197184f7294a2eb4d2840fc97_zillizcloud.json) | 64.0463 | 65.4981 | [65.4981](raw_results/zilliz_cloud_tiered_4cu/int_filter/50p/ids_only/concurrent_qps/result_20260511_54e51504d1794ad7bcd821945cc3068d_zillizcloud.json) | 0.9328s / 1.2088s | 1.1137s / 1.5151s | 1.2168s / 1.7058s | measured |
| 50% | scalar label | [0.9543](raw_results/zilliz_cloud_tiered_4cu/int_filter/50p/scalar_label/serial_recall/result_20260511_1983c0014ccb4ad1bcc91a1610e773db_zillizcloud.json) | 63.0552 | 63.2795 | [63.2795](raw_results/zilliz_cloud_tiered_4cu/int_filter/50p/scalar_label/concurrent_qps/result_20260511_1077ef7629e147ff8f085b69ed0f3b07_zillizcloud.json) | 0.9478s / 1.2528s | 1.1941s / 1.5682s | 1.2929s / 2.0663s | measured |
| 50% | vector | [0.9543](raw_results/zilliz_cloud_tiered_4cu/int_filter/50p/vector/serial_recall/result_20260511_fb0b5da85bf842b8acaa4afe22c0de31_zillizcloud.json) | 48.8324 | 53.0284 | [53.0284](raw_results/zilliz_cloud_tiered_4cu/int_filter/50p/vector/concurrent_qps/result_20260511_69c3e6abf6644d64b0743a6747da7d28_zillizcloud.json) | 1.2206s / 1.4965s | 1.5709s / 1.9855s | 1.8313s / 2.2144s | measured |

### Scalar Label Filtered Search

1% selectivity means `label == "label_1p"`, approximately 1M matched rows.

| Selectivity | Payload | Recall | QPS @60 | QPS @80 | Max QPS | Avg latency @60/@80 | P95 @60/@80 | P99 @60/@80 | Payload bytes/query | Status |
|---:|---|---:|---:|---:|---:|---|---|---|---:|---|
| 0.1% | IDs only | [0.9742](raw_results/zilliz_cloud_tiered_4cu/scalar_label_filter/0_1p/ids_only/serial_recall/result_20260511_eab166e81d9044cd927ee4ce8e03d70d_zillizcloud.json) | 59.3971 | 62.0450 | [62.0450](raw_results/zilliz_cloud_tiered_4cu/scalar_label_filter/0_1p/ids_only/concurrent_qps/result_20260511_7d8889a1b92a48a3a751f1f86eb70341_zillizcloud.json) | 1.0022s / 1.2755s | 1.1732s / 1.5050s | 1.1977s / 1.7010s | 2,000 | measured |
| 0.1% | scalar label | [0.9742](raw_results/zilliz_cloud_tiered_4cu/scalar_label_filter/0_1p/scalar_label/serial_recall/result_20260511_1299d20babf9439cb01ce617cbcee2c8_zillizcloud.json) | 56.8579 | 59.8387 | [59.8387](raw_results/zilliz_cloud_tiered_4cu/scalar_label_filter/0_1p/scalar_label/concurrent_qps/result_20260511_b25da852b6a549938c7d4c32a7b9c2c8_zillizcloud.json) | 1.0480s / 1.3235s | 1.2133s / 1.5898s | 1.2976s / 1.6870s | 3,600 | measured |
| 0.1% | vector | [0.9742](raw_results/zilliz_cloud_tiered_4cu/scalar_label_filter/0_1p/vector/serial_recall/result_20260511_142cadd59e614dc587ba2881cae77824_zillizcloud.json) | 46.0338 | 48.6365 | [48.6365](raw_results/zilliz_cloud_tiered_4cu/scalar_label_filter/0_1p/vector/concurrent_qps/result_20260511_7f8a9f44e6be40dcb464cdd288a83fae_zillizcloud.json) | 1.2959s / 1.6284s | 1.5145s / 2.1271s | 1.8824s / 2.3751s | 309,200 | measured |
| 0.2% | IDs only | [0.973](raw_results/zilliz_cloud_tiered_4cu/scalar_label_filter/0_2p/ids_only/serial_recall/result_20260511_547830ccd8414df883788927c07471d3_zillizcloud.json) | 65.6970 | 68.3875 | [68.3875](raw_results/zilliz_cloud_tiered_4cu/scalar_label_filter/0_2p/ids_only/concurrent_qps/result_20260511_37a44d4639634c878a6c66e2761a3158_zillizcloud.json) | 0.9097s / 1.1609s | 1.0834s / 1.3947s | 1.1229s / 1.5671s | 2,000 | measured |
| 0.2% | scalar label | [0.973](raw_results/zilliz_cloud_tiered_4cu/scalar_label_filter/0_2p/scalar_label/serial_recall/result_20260511_9b25684fb7e14a90b18dcf6594bebc40_zillizcloud.json) | 62.3662 | 65.4546 | [65.4546](raw_results/zilliz_cloud_tiered_4cu/scalar_label_filter/0_2p/scalar_label/concurrent_qps/result_20260511_dacadba316e44532b6079206577deee9_zillizcloud.json) | 0.9568s / 1.2139s | 1.1139s / 1.4694s | 1.2918s / 1.5123s | 3,600 | measured |
| 0.2% | vector | [0.973](raw_results/zilliz_cloud_tiered_4cu/scalar_label_filter/0_2p/vector/serial_recall/result_20260511_3f44e5dc892e43de8f95389c6ba081de_zillizcloud.json) | 49.6225 | 51.7891 | [51.7891](raw_results/zilliz_cloud_tiered_4cu/scalar_label_filter/0_2p/vector/concurrent_qps/result_20260511_86f921f88a8f4b9294cdd24a45c85fc3_zillizcloud.json) | 1.2026s / 1.5329s | 1.4273s / 1.8922s | 1.7129s / 2.0972s | 309,200 | measured |
| 0.5% | IDs only | [0.9708](raw_results/zilliz_cloud_tiered_4cu/scalar_label_filter/0_5p/ids_only/serial_recall/result_20260511_4be68683c29c4efab313a7841d7efcae_zillizcloud.json) | 74.0725 | 78.6973 | [78.6973](raw_results/zilliz_cloud_tiered_4cu/scalar_label_filter/0_5p/ids_only/concurrent_qps/result_20260511_9f9f835ed31647f581aea649a32f99cc_zillizcloud.json) | 0.8043s / 1.0116s | 0.9615s / 1.1935s | 1.0306s / 1.3992s | 2,000 | measured |
| 0.5% | scalar label | [0.9708](raw_results/zilliz_cloud_tiered_4cu/scalar_label_filter/0_5p/scalar_label/serial_recall/result_20260511_690dec2bf18c4fb9b14c73a55165a62d_zillizcloud.json) | 70.3328 | 74.2955 | [74.2955](raw_results/zilliz_cloud_tiered_4cu/scalar_label_filter/0_5p/scalar_label/concurrent_qps/result_20260511_7af190b061f94f459479ca7a42f22222_zillizcloud.json) | 0.8491s / 1.0686s | 1.0178s / 1.2857s | 1.1645s / 1.4285s | 3,600 | measured |
| 0.5% | vector | [0.9708](raw_results/zilliz_cloud_tiered_4cu/scalar_label_filter/0_5p/vector/serial_recall/result_20260511_10172556b3a54a2bbd22c3279985c373_zillizcloud.json) | 55.5869 | 57.1731 | [57.1731](raw_results/zilliz_cloud_tiered_4cu/scalar_label_filter/0_5p/vector/concurrent_qps/result_20260511_afa468155c99439bacba970bfc508fef_zillizcloud.json) | 1.0731s / 1.3878s | 1.3855s / 1.7128s | 1.5935s / 1.8702s | 309,200 | measured |
| 1% | IDs only | [0.9681](raw_results/zilliz_cloud_tiered_4cu/scalar_label_filter/1p/ids_only/serial_recall/result_20260511_05852f6bdb884aea8f60a9c23bf5741f_zillizcloud.json) | 81.3103 | 89.6180 | [89.6180](raw_results/zilliz_cloud_tiered_4cu/scalar_label_filter/1p/ids_only/concurrent_qps/result_20260511_256d6ebeeaae45a8b269a97c3175b254_zillizcloud.json) | 0.7346s / 0.8844s | 0.8674s / 0.9983s | 2.2083s / 1.1814s | 2,000 | measured |
| 1% | scalar label | [0.9681](raw_results/zilliz_cloud_tiered_4cu/scalar_label_filter/1p/scalar_label/serial_recall/result_20260511_2dabfa94c7254d68add15f165057b7b2_zillizcloud.json) | 79.6971 | 84.9877 | [84.9877](raw_results/zilliz_cloud_tiered_4cu/scalar_label_filter/1p/scalar_label/concurrent_qps/result_20260511_9bfaa3afe288417eb9a550605e2affec_zillizcloud.json) | 0.7479s / 0.9323s | 0.8925s / 1.1024s | 1.0073s / 1.2081s | 3,600 | measured |
| 1% | vector | [0.9681](raw_results/zilliz_cloud_tiered_4cu/scalar_label_filter/1p/vector/serial_recall/result_20260511_c17971d95d8543a69178ed620b6da281_zillizcloud.json) | 57.3345 | 62.8719 | [62.8719](raw_results/zilliz_cloud_tiered_4cu/scalar_label_filter/1p/vector/concurrent_qps/result_20260511_129cbbc9f61f464193a990d90f239fbb_zillizcloud.json) | 1.0400s / 1.2610s | 1.4088s / 1.5810s | 1.7919s / 1.7895s | 309,200 | measured |
| 2% | IDs only | [0.9654](raw_results/zilliz_cloud_tiered_4cu/scalar_label_filter/2p/ids_only/serial_recall/result_20260511_545f6eac916d4b0ea5cee313dce448bf_zillizcloud.json) | 93.0085 | 98.4835 | [98.4835](raw_results/zilliz_cloud_tiered_4cu/scalar_label_filter/2p/ids_only/concurrent_qps/result_20260511_e3a958226588433384af1b4f34847f39_zillizcloud.json) | 0.6426s / 0.8056s | 0.7774s / 0.9207s | 0.9039s / 1.0018s | 2,000 | measured |
| 2% | scalar label | [0.9654](raw_results/zilliz_cloud_tiered_4cu/scalar_label_filter/2p/scalar_label/serial_recall/result_20260511_1faa4de6b15b4287b48d8c39d31bf78f_zillizcloud.json) | 87.8265 | 93.0772 | [93.0772](raw_results/zilliz_cloud_tiered_4cu/scalar_label_filter/2p/scalar_label/concurrent_qps/result_20260511_6b0d386bcc274c2b93753c7053307101_zillizcloud.json) | 0.6793s / 0.8535s | 0.8019s / 1.0197s | 0.9043s / 1.1035s | 3,600 | measured |
| 2% | vector | [0.9654](raw_results/zilliz_cloud_tiered_4cu/scalar_label_filter/2p/vector/serial_recall/result_20260511_b692e11de6164812a09fafb8edc4fbf8_zillizcloud.json) | 62.4006 | 68.0889 | [68.0889](raw_results/zilliz_cloud_tiered_4cu/scalar_label_filter/2p/vector/concurrent_qps/result_20260511_1e8e553e0c804b1ca15360bfb2646313_zillizcloud.json) | 0.9559s / 1.1634s | 1.2744s / 1.5180s | 1.4644s / 1.7076s | 309,200 | measured |
| 5% | IDs only | [0.9637](raw_results/zilliz_cloud_tiered_4cu/scalar_label_filter/5p/ids_only/serial_recall/result_20260511_025bec41d7d94b669dabfbf4e2173ecd_zillizcloud.json) | 78.3911 | 83.4967 | [83.4967](raw_results/zilliz_cloud_tiered_4cu/scalar_label_filter/5p/ids_only/concurrent_qps/result_20260511_7dbb463deb6244a8b065324e5bd1dd23_zillizcloud.json) | 0.7603s / 0.9511s | 0.8941s / 1.1150s | 1.0085s / 1.3020s | 2,000 | measured |
| 5% | scalar label | [0.9637](raw_results/zilliz_cloud_tiered_4cu/scalar_label_filter/5p/scalar_label/serial_recall/result_20260511_807358732bf64658b2c0c9fdeb19afab_zillizcloud.json) | 74.2037 | 79.9345 | [79.9345](raw_results/zilliz_cloud_tiered_4cu/scalar_label_filter/5p/scalar_label/concurrent_qps/result_20260511_eedb3a0041584c108b1b8a95130f03f8_zillizcloud.json) | 0.7841s / 0.9948s | 0.9752s / 1.1840s | 1.0608s / 1.3049s | 3,600 | measured |
| 5% | vector | [0.9637](raw_results/zilliz_cloud_tiered_4cu/scalar_label_filter/5p/vector/serial_recall/result_20260511_beb8df431cec477d96026a1bfd8abd18_zillizcloud.json) | 45.3072 | 49.9419 | [49.9419](raw_results/zilliz_cloud_tiered_4cu/scalar_label_filter/5p/vector/concurrent_qps/result_20260511_b5f825e419a14323866ef10c82a269ab_zillizcloud.json) | 1.3171s / 1.5892s | 1.6811s / 1.8899s | 2.0103s / 2.1834s | 309,200 | measured |
| 10% | IDs only | [0.9607](raw_results/zilliz_cloud_tiered_4cu/scalar_label_filter/10p/ids_only/serial_recall/result_20260511_6b15cb442c2147d393e0006eaf3e1b07_zillizcloud.json) | 44.6276 | 48.9215 | [48.9215](raw_results/zilliz_cloud_tiered_4cu/scalar_label_filter/10p/ids_only/concurrent_qps/result_20260511_3daccea2972848be986c21c0dcf822af_zillizcloud.json) | 1.3387s / 1.6264s | 1.5379s / 2.1119s | 1.8242s / 2.3556s | 2,000 | measured |
| 10% | scalar label | [0.9607](raw_results/zilliz_cloud_tiered_4cu/scalar_label_filter/10p/scalar_label/serial_recall/result_20260511_cccf0aed8a124d9c9c54c2ea191de3ba_zillizcloud.json) | 41.0114 | 42.0981 | [42.0981](raw_results/zilliz_cloud_tiered_4cu/scalar_label_filter/10p/scalar_label/concurrent_qps/result_20260511_b2d38defc7c74e508698e3c47e7cc853_zillizcloud.json) | 1.4503s / 1.8761s | 1.7349s / 2.2248s | 1.9109s / 2.3956s | 3,600 | measured |
| 10% | vector | [0.9607](raw_results/zilliz_cloud_tiered_4cu/scalar_label_filter/10p/vector/serial_recall/result_20260511_8c5160bebdd84ab9958f4ce363f2b812_zillizcloud.json) | 24.8381 | 28.2022 | [28.2022](raw_results/zilliz_cloud_tiered_4cu/scalar_label_filter/10p/vector/concurrent_qps/result_20260511_d806e624d11b49d2b4ba170d483a4d04_zillizcloud.json) | 2.3966s / 2.8057s | 2.8363s / 3.3085s | 3.1741s / 3.8916s | 309,200 | measured |
| 20% | IDs only | [0.9586](raw_results/zilliz_cloud_tiered_4cu/scalar_label_filter/20p/ids_only/serial_recall/result_20260511_f25043323e744de5807128e6a9a03ed2_zillizcloud.json) | 30.6455 | 33.7269 | [33.7269](raw_results/zilliz_cloud_tiered_4cu/scalar_label_filter/20p/ids_only/concurrent_qps/result_20260511_4ebc614f575e4573ab9f4404dc40d544_zillizcloud.json) | 1.9432s / 2.3374s | 2.1765s / 2.6635s | 2.2117s / 2.9054s | 2,000 | measured |
| 20% | scalar label | [0.9586](raw_results/zilliz_cloud_tiered_4cu/scalar_label_filter/20p/scalar_label/serial_recall/result_20260511_a021c5d2083a407e826ca1cc4905a8aa_zillizcloud.json) | 29.9014 | 31.1327 | [31.1327](raw_results/zilliz_cloud_tiered_4cu/scalar_label_filter/20p/scalar_label/concurrent_qps/result_20260511_cc3d108862304a4584185eac6198227e_zillizcloud.json) | 1.9908s / 2.5375s | 2.3567s / 3.0346s | 2.5183s / 3.7292s | 3,600 | measured |
| 20% | vector | [0.9586](raw_results/zilliz_cloud_tiered_4cu/scalar_label_filter/20p/vector/serial_recall/result_20260511_4d53363df031429ca672450312d75be4_zillizcloud.json) | 20.9791 | 22.5249 | [22.5249](raw_results/zilliz_cloud_tiered_4cu/scalar_label_filter/20p/vector/concurrent_qps/result_20260511_42901e633eff44f6a6ebaaa31c16c28e_zillizcloud.json) | 2.8274s / 3.5225s | 3.5156s / 4.2164s | 3.9773s / 4.4819s | 309,200 | measured |
| 50% | IDs only | [0.9551](raw_results/zilliz_cloud_tiered_4cu/scalar_label_filter/50p/ids_only/serial_recall/result_20260511_7dff183d893e40dfa10d3f1bafc361ff_zillizcloud.json) | 21.0573 | 22.7089 | [22.7089](raw_results/zilliz_cloud_tiered_4cu/scalar_label_filter/50p/ids_only/concurrent_qps/result_20260511_007f6d744fef4368b15d9a2bfe9c4954_zillizcloud.json) | 2.8060s / 3.4676s | 3.1068s / 3.7737s | 3.1576s / 3.8198s | 2,000 | measured |
| 50% | scalar label | [0.9551](raw_results/zilliz_cloud_tiered_4cu/scalar_label_filter/50p/scalar_label/serial_recall/result_20260511_b1a564a2b4c94448ba1b9a4d3722feac_zillizcloud.json) | 19.7032 | 21.4209 | [21.4209](raw_results/zilliz_cloud_tiered_4cu/scalar_label_filter/50p/scalar_label/concurrent_qps/result_20260511_aaefdab4fa174d95b19abcb2d1b14ab3_zillizcloud.json) | 3.0089s / 3.6526s | 3.4295s / 4.2006s | 3.6849s / 4.3236s | 3,600 | measured |
| 50% | vector | [0.9551](raw_results/zilliz_cloud_tiered_4cu/scalar_label_filter/50p/vector/serial_recall/result_20260511_5d0e671cfe71462b8d3b05e50405bf0d_zillizcloud.json) | 15.9935 | 16.9123 | [16.9123](raw_results/zilliz_cloud_tiered_4cu/scalar_label_filter/50p/vector/concurrent_qps/result_20260511_310db7d28a5e4f19b1f8fe76fdb94b09_zillizcloud.json) | 3.6905s / 4.6920s | 4.2006s / 5.3905s | 5.1222s / 6.2679s | 309,200 | measured |

## Zilliz Cloud Capacity 12CU

| Item | Value |
|---|---|
| Collection | `LAION100M_capacity` |
| Scalar label field | `label` |
| Scalar label index | `labels_idx` |
| Logical row count | 100,000,000 |

### Unfiltered Search

| Payload | Recall | QPS @60 | QPS @80 | Max QPS | Avg latency @60/@80 | P95 @60/@80 | P99 @60/@80 | Status |
|---|---:|---:|---:|---:|---|---|---|---|
| IDs only | [0.9723](raw_results/zilliz_cloud_capacity_12cu/unfiltered/na/ids_only/serial_recall/result_20260511_17d87c351af745ceab0738d3155af9ac_zillizcloud.json) | 366.5669 | 376.0070 | [376.0070](raw_results/zilliz_cloud_capacity_12cu/unfiltered/na/ids_only/concurrent_qps/result_20260511_8ee5908066ca48f8848b56f01285c6fb_zillizcloud.json) | 0.1626s / 0.2108s | 0.1940s / 0.2748s | 0.2097s / 0.2993s | measured |
| scalar label | [0.9723](raw_results/zilliz_cloud_capacity_12cu/unfiltered/na/scalar_label/serial_recall/result_20260511_220657bd87e148ad95531a7601d23253_zillizcloud.json) | 379.4628 | 370.1937 | [379.4628](raw_results/zilliz_cloud_capacity_12cu/unfiltered/na/scalar_label/concurrent_qps/result_20260511_3ed9191186a84f0d83f5a15b98f1d42e_zillizcloud.json) | 0.1571s / 0.2141s | 0.1940s / 0.2739s | 0.2043s / 0.2929s | measured |
| vector | [0.9723](raw_results/zilliz_cloud_capacity_12cu/unfiltered/na/vector/serial_recall/result_20260511_a7261239b0234060be1d349b9174d4f8_zillizcloud.json) | 219.3919 | 229.4362 | [229.4362](raw_results/zilliz_cloud_capacity_12cu/unfiltered/na/vector/concurrent_qps/result_20260511_259a2d53626a4011bbde5c1cf0d7f82d_zillizcloud.json) | 0.2719s / 0.3455s | 0.3412s / 0.4440s | 0.3889s / 0.4977s | measured |

### Integer Filtered Search

| Selectivity | Payload | Recall | QPS @60 | QPS @80 | Max QPS | Avg latency @60/@80 | P95 @60/@80 | P99 @60/@80 | Status |
|---:|---|---:|---:|---:|---:|---|---|---|---|
| 0.1% | IDs only | [0.9781](raw_results/zilliz_cloud_capacity_12cu/int_filter/0_1p/ids_only/serial_recall/result_20260511_c935770a90e7408c90528fa1bd77b672_zillizcloud.json) | 1210.8837 | 1380.2318 | [1380.2318](raw_results/zilliz_cloud_capacity_12cu/int_filter/0_1p/ids_only/concurrent_qps/result_20260511_cfb93e52a67d480f8c435f6ed76d85e0_zillizcloud.json) | 0.0492s / 0.0574s | 0.0839s / 0.0873s | 0.0912s / 0.0921s | measured |
| 0.1% | scalar label | [0.9781](raw_results/zilliz_cloud_capacity_12cu/int_filter/0_1p/scalar_label/serial_recall/result_20260511_77bff551f0e44f958e3dce5026b461c0_zillizcloud.json) | 1183.8423 | 1338.3295 | [1338.3295](raw_results/zilliz_cloud_capacity_12cu/int_filter/0_1p/scalar_label/concurrent_qps/result_20260511_f32a550f1836499aa466c467b0d1b30d_zillizcloud.json) | 0.0504s / 0.0592s | 0.0826s / 0.0871s | 0.0880s / 0.0926s | measured |
| 0.1% | vector | [0.9781](raw_results/zilliz_cloud_capacity_12cu/int_filter/0_1p/vector/serial_recall/result_20260511_81b48162610c47ecbab8d5984a1c863c_zillizcloud.json) | 861.6848 | 933.0460 | [933.0460](raw_results/zilliz_cloud_capacity_12cu/int_filter/0_1p/vector/concurrent_qps/result_20260511_1d8cddb8d8c2460d9c74fe031cf52223_zillizcloud.json) | 0.0691s / 0.0848s | 0.0975s / 0.1086s | 0.1061s / 0.1182s | measured |
| 1% | IDs only | [0.9809](raw_results/zilliz_cloud_capacity_12cu/int_filter/1p/ids_only/serial_recall/result_20260511_905cb61feb424875910fec08da5bcd5f_zillizcloud.json) | 730.0303 | 792.0219 | [792.0219](raw_results/zilliz_cloud_capacity_12cu/int_filter/1p/ids_only/concurrent_qps/result_20260511_566d53410fdf4a4c8e150cf52f108f22_zillizcloud.json) | 0.0816s / 0.0999s | 0.1026s / 0.1637s | 0.1081s / 0.1702s | measured |
| 1% | scalar label | [0.9809](raw_results/zilliz_cloud_capacity_12cu/int_filter/1p/scalar_label/serial_recall/result_20260511_0c02402812de4d5eaee14ba795a552d0_zillizcloud.json) | 719.5956 | 785.7993 | [785.7993](raw_results/zilliz_cloud_capacity_12cu/int_filter/1p/scalar_label/concurrent_qps/result_20260511_2f29f98a1dad4130bdcf3e7c00e1eee9_zillizcloud.json) | 0.0828s / 0.1008s | 0.1031s / 0.1635s | 0.1090s / 0.1718s | measured |
| 1% | vector | [0.9809](raw_results/zilliz_cloud_capacity_12cu/int_filter/1p/vector/serial_recall/result_20260511_13c0324af6514d31a670c811da3436fb_zillizcloud.json) | 542.7760 | 572.6737 | [572.6737](raw_results/zilliz_cloud_capacity_12cu/int_filter/1p/vector/concurrent_qps/result_20260511_60b35e08ec914ef187a0818c5ec73c1a_zillizcloud.json) | 0.1098s / 0.1382s | 0.1664s / 0.1869s | 0.1764s / 0.1953s | measured |
| 10% | IDs only | [0.9852](raw_results/zilliz_cloud_capacity_12cu/int_filter/10p/ids_only/serial_recall/result_20260511_e130c430a3414dbcb5912636f3ffb91f_zillizcloud.json) | 717.1534 | 820.8570 | [820.8570](raw_results/zilliz_cloud_capacity_12cu/int_filter/10p/ids_only/concurrent_qps/result_20260511_dc8405bde48d4779a9027437bb77dcd8_zillizcloud.json) | 0.0831s / 0.0965s | 0.1012s / 0.1156s | 0.1055s / 0.1635s | measured |
| 10% | scalar label | [0.9852](raw_results/zilliz_cloud_capacity_12cu/int_filter/10p/scalar_label/serial_recall/result_20260511_7bb497b835d8456491d6fe9e585f00a4_zillizcloud.json) | 701.5481 | 756.5890 | [756.5890](raw_results/zilliz_cloud_capacity_12cu/int_filter/10p/scalar_label/concurrent_qps/result_20260511_530f75bd4831409aa6338c2726b1b70a_zillizcloud.json) | 0.0849s / 0.1046s | 0.1029s / 0.1619s | 0.1078s / 0.1706s | measured |
| 10% | vector | [0.9852](raw_results/zilliz_cloud_capacity_12cu/int_filter/10p/vector/serial_recall/result_20260511_cc9cbc49618b4c0dab8336c04e788111_zillizcloud.json) | 488.2515 | 517.2106 | [517.2106](raw_results/zilliz_cloud_capacity_12cu/int_filter/10p/vector/concurrent_qps/result_20260511_676a35c5b8644afaaf31e4865fe4f173_zillizcloud.json) | 0.1220s / 0.1530s | 0.1738s / 0.1939s | 0.1839s / 0.2037s | measured |
| 50% | IDs only | [0.9838](raw_results/zilliz_cloud_capacity_12cu/int_filter/50p/ids_only/serial_recall/result_20260511_9c7de03e08064f0aa58fa9c1aa899818_zillizcloud.json) | 322.8739 | 337.8539 | [337.8539](raw_results/zilliz_cloud_capacity_12cu/int_filter/50p/ids_only/concurrent_qps/result_20260511_a2630a165b35455aaa7090b589a4b865_zillizcloud.json) | 0.1847s / 0.2346s | 0.2065s / 0.2837s | 0.2468s / 0.2978s | measured |
| 50% | scalar label | [0.9838](raw_results/zilliz_cloud_capacity_12cu/int_filter/50p/scalar_label/serial_recall/result_20260511_a75369c0f8284e8ebb3aa4612fbd6101_zillizcloud.json) | 321.8107 | 320.3212 | [321.8107](raw_results/zilliz_cloud_capacity_12cu/int_filter/50p/scalar_label/concurrent_qps/result_20260511_a9cee107c9874ca98126c4a95907ef53_zillizcloud.json) | 0.1852s / 0.2476s | 0.2100s / 0.2917s | 0.2674s / 0.3212s | measured |
| 50% | vector | [0.9838](raw_results/zilliz_cloud_capacity_12cu/int_filter/50p/vector/serial_recall/result_20260511_d186a89459934d4087d1465c35517db1_zillizcloud.json) | 225.2714 | 237.8277 | [237.8277](raw_results/zilliz_cloud_capacity_12cu/int_filter/50p/vector/concurrent_qps/result_20260511_171bf6d177aa469dac317f1780c7faa8_zillizcloud.json) | 0.2647s / 0.3333s | 0.3156s / 0.4080s | 0.3818s / 0.4796s | measured |

### Scalar Label Filtered Search

1% selectivity means `label == "label_1p"`, approximately 1M matched rows.

| Selectivity | Payload | Recall | QPS @60 | QPS @80 | Max QPS | Avg latency @60/@80 | P95 @60/@80 | P99 @60/@80 | Payload bytes/query | Status |
|---:|---|---:|---:|---:|---:|---|---|---|---:|---|
| 0.1% | IDs only | [0.9961](raw_results/zilliz_cloud_capacity_12cu/scalar_label_filter/0_1p/ids_only/serial_recall/result_20260511_7aebda8f83234581a2072876182b71fd_zillizcloud.json) | 316.7608 | 316.7563 | [316.7608](raw_results/zilliz_cloud_capacity_12cu/scalar_label_filter/0_1p/ids_only/concurrent_qps/result_20260511_f08983fa407149569a6aa3d977d93a9d_zillizcloud.json) | 0.1881s / 0.2503s | 0.2129s / 0.2827s | 0.2467s / 0.3607s | 2,000 | measured |
| 0.1% | scalar label | [0.9961](raw_results/zilliz_cloud_capacity_12cu/scalar_label_filter/0_1p/scalar_label/serial_recall/result_20260511_a70e129539844d66b920b52bbf741610_zillizcloud.json) | 316.5333 | 316.6797 | [316.6797](raw_results/zilliz_cloud_capacity_12cu/scalar_label_filter/0_1p/scalar_label/concurrent_qps/result_20260511_979e04175e42419da8a7604f73019bf5_zillizcloud.json) | 0.1884s / 0.2503s | 0.2182s / 0.2884s | 0.2478s / 0.3115s | 3,600 | measured |
| 0.1% | vector | [0.9961](raw_results/zilliz_cloud_capacity_12cu/scalar_label_filter/0_1p/vector/serial_recall/result_20260511_01d9606419ab4e31bcae85b04de67198_zillizcloud.json) | 228.3997 | 237.7134 | [237.7134](raw_results/zilliz_cloud_capacity_12cu/scalar_label_filter/0_1p/vector/concurrent_qps/result_20260511_477b61925e624e6e9f0c5645be490429_zillizcloud.json) | 0.2610s / 0.3333s | 0.3317s / 0.4301s | 0.3870s / 0.4869s | 309,200 | measured |
| 0.2% | IDs only | [0.9957](raw_results/zilliz_cloud_capacity_12cu/scalar_label_filter/0_2p/ids_only/serial_recall/result_20260511_f05dadd6d5b6457d9691ec6e9c076edf_zillizcloud.json) | 303.5832 | 316.3100 | [316.3100](raw_results/zilliz_cloud_capacity_12cu/scalar_label_filter/0_2p/ids_only/concurrent_qps/result_20260511_494ee33cd07e4d7faac1d8648abcbe4c_zillizcloud.json) | 0.1964s / 0.2507s | 0.2236s / 0.2877s | 0.2571s / 0.3357s | 2,000 | measured |
| 0.2% | scalar label | [0.9957](raw_results/zilliz_cloud_capacity_12cu/scalar_label_filter/0_2p/scalar_label/serial_recall/result_20260511_d16edb0d28e9481a9a47bffc4a22401d_zillizcloud.json) | 290.1460 | 317.4258 | [317.4258](raw_results/zilliz_cloud_capacity_12cu/scalar_label_filter/0_2p/scalar_label/concurrent_qps/result_20260511_44e765c33aa840c891e78632faf78360_zillizcloud.json) | 0.2055s / 0.2496s | 0.2367s / 0.2899s | 0.2572s / 0.3212s | 3,600 | measured |
| 0.2% | vector | [0.9957](raw_results/zilliz_cloud_capacity_12cu/scalar_label_filter/0_2p/vector/serial_recall/result_20260511_6a95b1e86f1844f291e22c029aced700_zillizcloud.json) | 206.5308 | 203.0653 | [206.5308](raw_results/zilliz_cloud_capacity_12cu/scalar_label_filter/0_2p/vector/concurrent_qps/result_20260511_6a6a42a5de364ccba4f878b4d2487778_zillizcloud.json) | 0.2887s / 0.3902s | 0.3722s / 0.4919s | 0.4151s / 0.5568s | 309,200 | measured |
| 0.5% | IDs only | [0.9955](raw_results/zilliz_cloud_capacity_12cu/scalar_label_filter/0_5p/ids_only/serial_recall/result_20260511_362836dcab534b7d816aa5815330f663_zillizcloud.json) | 205.0275 | 209.1240 | [209.1240](raw_results/zilliz_cloud_capacity_12cu/scalar_label_filter/0_5p/ids_only/concurrent_qps/result_20260511_9a8478cd09cb4613a0b7c8a954b97ff8_zillizcloud.json) | 0.2908s / 0.3794s | 0.3516s / 0.4547s | 0.3966s / 0.5014s | 2,000 | measured |
| 0.5% | scalar label | [0.9955](raw_results/zilliz_cloud_capacity_12cu/scalar_label_filter/0_5p/scalar_label/serial_recall/result_20260511_955396a103274166ad2c073e5052c81b_zillizcloud.json) | 200.0110 | 208.3996 | [208.3996](raw_results/zilliz_cloud_capacity_12cu/scalar_label_filter/0_5p/scalar_label/concurrent_qps/result_20260511_cefb61cd9ce54b22a331b22808d03e0b_zillizcloud.json) | 0.2982s / 0.3810s | 0.3636s / 0.4526s | 0.3914s / 0.4807s | 3,600 | measured |
| 0.5% | vector | [0.9955](raw_results/zilliz_cloud_capacity_12cu/scalar_label_filter/0_5p/vector/serial_recall/result_20260511_fb924ab82f6c4cd1b2b8426d0dfa463d_zillizcloud.json) | 153.4133 | 153.5717 | [153.5717](raw_results/zilliz_cloud_capacity_12cu/scalar_label_filter/0_5p/vector/concurrent_qps/result_20260511_8c2bcfe3f60a40bbb2cba1e89bd33072_zillizcloud.json) | 0.3890s / 0.5175s | 0.4837s / 0.6282s | 0.5293s / 0.7104s | 309,200 | measured |
| 1% | IDs only | [0.9951](raw_results/zilliz_cloud_capacity_12cu/scalar_label_filter/1p/ids_only/serial_recall/result_20260511_c1863f581a8742e9ba4a408e81cabed5_zillizcloud.json) | 136.5733 | 136.1872 | [136.5733](raw_results/zilliz_cloud_capacity_12cu/scalar_label_filter/1p/ids_only/concurrent_qps/result_20260511_6fdd2c40f5944cf3a9a67048ddfbbce0_zillizcloud.json) | 0.4370s / 0.5824s | 0.5071s / 0.6842s | 0.6275s / 0.7718s | 2,000 | measured |
| 1% | scalar label | [0.9951](raw_results/zilliz_cloud_capacity_12cu/scalar_label_filter/1p/scalar_label/serial_recall/result_20260511_770580bd27134d80b4ab4b3382854900_zillizcloud.json) | 133.7402 | 138.1391 | [138.1391](raw_results/zilliz_cloud_capacity_12cu/scalar_label_filter/1p/scalar_label/concurrent_qps/result_20260511_7ef25bda77d444f78d4421e6312bae30_zillizcloud.json) | 0.4455s / 0.5747s | 0.5132s / 0.6883s | 0.5885s / 0.7135s | 3,600 | measured |
| 1% | vector | [0.9951](raw_results/zilliz_cloud_capacity_12cu/scalar_label_filter/1p/vector/serial_recall/result_20260511_6f300afddb40448887ddc7ea2ddfedf2_zillizcloud.json) | 111.3446 | 110.6730 | [111.3446](raw_results/zilliz_cloud_capacity_12cu/scalar_label_filter/1p/vector/concurrent_qps/result_20260511_2bdcdd6cc63145f39f720d7d7f929f4b_zillizcloud.json) | 0.5354s / 0.7170s | 0.6691s / 0.8759s | 0.7793s / 0.9838s | 309,200 | measured |
| 2% | IDs only | [0.9914](raw_results/zilliz_cloud_capacity_12cu/scalar_label_filter/2p/ids_only/serial_recall/result_20260511_b217a4c2b8ec442aa51cf9b43a38ce36_zillizcloud.json) | 182.2757 | 163.7759 | [182.2757](raw_results/zilliz_cloud_capacity_12cu/scalar_label_filter/2p/ids_only/concurrent_qps/result_20260511_2b3039350a6d429ca19753e266feaa59_zillizcloud.json) | 0.3272s / 0.4844s | 0.3852s / 0.5866s | 0.4455s / 0.6584s | 2,000 | measured |
| 2% | scalar label | [0.9914](raw_results/zilliz_cloud_capacity_12cu/scalar_label_filter/2p/scalar_label/serial_recall/result_20260511_4c0357e64f53437d96cc1c2a2019f6fb_zillizcloud.json) | 155.4340 | 160.1895 | [160.1895](raw_results/zilliz_cloud_capacity_12cu/scalar_label_filter/2p/scalar_label/concurrent_qps/result_20260511_345a83914a134dba89243f63a49c2d82_zillizcloud.json) | 0.3841s / 0.4953s | 0.4712s / 0.5870s | 0.5047s / 0.6309s | 3,600 | measured |
| 2% | vector | [0.9914](raw_results/zilliz_cloud_capacity_12cu/scalar_label_filter/2p/vector/serial_recall/result_20260511_980219a6e8d84f09ba8ff36e6edf1bfe_zillizcloud.json) | 140.8582 | 127.8600 | [140.8582](raw_results/zilliz_cloud_capacity_12cu/scalar_label_filter/2p/vector/concurrent_qps/result_20260511_79efcf0d2fa64741ae0737954772db6e_zillizcloud.json) | 0.4236s / 0.6202s | 0.5193s / 0.7716s | 0.6007s / 0.8662s | 309,200 | measured |
| 5% | IDs only | [0.9912](raw_results/zilliz_cloud_capacity_12cu/scalar_label_filter/5p/ids_only/serial_recall/result_20260511_5510a12c91234476978651663bb83829_zillizcloud.json) | 116.1035 | 127.1201 | [127.1201](raw_results/zilliz_cloud_capacity_12cu/scalar_label_filter/5p/ids_only/concurrent_qps/result_20260511_9dae502a1aa94bd4b3c881a6de754009_zillizcloud.json) | 0.5136s / 0.6232s | 0.6000s / 0.7739s | 0.6927s / 0.9193s | 2,000 | measured |
| 5% | scalar label | [0.9912](raw_results/zilliz_cloud_capacity_12cu/scalar_label_filter/5p/scalar_label/serial_recall/result_20260511_cba87e72facb459c8e32404126607c6e_zillizcloud.json) | 134.0880 | 143.3337 | [143.3337](raw_results/zilliz_cloud_capacity_12cu/scalar_label_filter/5p/scalar_label/concurrent_qps/result_20260511_274b64ccd0144452808e05bae55beaf7_zillizcloud.json) | 0.4451s / 0.5532s | 0.5046s / 0.6919s | 0.5826s / 0.7248s | 3,600 | measured |
| 5% | vector | [0.9912](raw_results/zilliz_cloud_capacity_12cu/scalar_label_filter/5p/vector/serial_recall/result_20260511_d68bf1acf4f744729d9cd40e50f197c0_zillizcloud.json) | 114.3365 | 122.0458 | [122.0458](raw_results/zilliz_cloud_capacity_12cu/scalar_label_filter/5p/vector/concurrent_qps/result_20260511_07cebf82c48c441badb5e6545d5337c8_zillizcloud.json) | 0.5223s / 0.6505s | 0.6559s / 0.8066s | 0.7297s / 0.9092s | 309,200 | measured |
| 10% | IDs only | [0.9897](raw_results/zilliz_cloud_capacity_12cu/scalar_label_filter/10p/ids_only/serial_recall/result_20260511_df1e16c7409c467db630464e34c88f2a_zillizcloud.json) | 108.6286 | 105.7116 | [108.6286](raw_results/zilliz_cloud_capacity_12cu/scalar_label_filter/10p/ids_only/concurrent_qps/result_20260511_72844b316698430bb9b457a92091b979_zillizcloud.json) | 0.5502s / 0.7505s | 0.6626s / 0.8850s | 0.7860s / 1.0712s | 2,000 | measured |
| 10% | scalar label | [0.9897](raw_results/zilliz_cloud_capacity_12cu/scalar_label_filter/10p/scalar_label/serial_recall/result_20260511_68ba5f9c4aaa4844815062289ca83419_zillizcloud.json) | 101.8603 | 105.5498 | [105.5498](raw_results/zilliz_cloud_capacity_12cu/scalar_label_filter/10p/scalar_label/concurrent_qps/result_20260511_43b44c9c65464fe7947ad921c7dbf39a_zillizcloud.json) | 0.5863s / 0.7517s | 0.6808s / 0.8833s | 0.7151s / 0.9339s | 3,600 | measured |
| 10% | vector | [0.9897](raw_results/zilliz_cloud_capacity_12cu/scalar_label_filter/10p/vector/serial_recall/result_20260511_ba29911643e4455cbda45eaf38becaf4_zillizcloud.json) | 93.9811 | 90.9934 | [93.9811](raw_results/zilliz_cloud_capacity_12cu/scalar_label_filter/10p/vector/concurrent_qps/result_20260511_2e16902d65064fea9052736ca247b6c8_zillizcloud.json) | 0.6362s / 0.8738s | 0.7931s / 1.0591s | 0.9160s / 1.1957s | 309,200 | measured |
| 20% | IDs only | [0.9892](raw_results/zilliz_cloud_capacity_12cu/scalar_label_filter/20p/ids_only/serial_recall/result_20260511_b6c513276f5f4d2391064da0ed241241_zillizcloud.json) | 87.6680 | 86.6352 | [87.6680](raw_results/zilliz_cloud_capacity_12cu/scalar_label_filter/20p/ids_only/concurrent_qps/result_20260511_61362bab8ac24b3abb0fac4772200a0d_zillizcloud.json) | 0.6800s / 0.9147s | 0.7766s / 1.0480s | 0.7885s / 1.1652s | 2,000 | measured |
| 20% | scalar label | [0.9892](raw_results/zilliz_cloud_capacity_12cu/scalar_label_filter/20p/scalar_label/serial_recall/result_20260511_4e5e68f8640a41b1a1e0e520216f2380_zillizcloud.json) | 78.9013 | 86.8571 | [86.8571](raw_results/zilliz_cloud_capacity_12cu/scalar_label_filter/20p/scalar_label/concurrent_qps/result_20260511_8f7d841b174144acb59f3520d95e641c_zillizcloud.json) | 0.7561s / 0.9131s | 0.8722s / 1.0662s | 0.9246s / 1.1248s | 3,600 | measured |
| 20% | vector | [0.9892](raw_results/zilliz_cloud_capacity_12cu/scalar_label_filter/20p/vector/serial_recall/result_20260511_4ea6d3594b2d44d1b9d722c2d15a156c_zillizcloud.json) | 76.5511 | 77.9215 | [77.9215](raw_results/zilliz_cloud_capacity_12cu/scalar_label_filter/20p/vector/concurrent_qps/result_20260511_e3a44ef336c847bca73b2846d58466e5_zillizcloud.json) | 0.7805s / 1.0204s | 0.9585s / 1.2087s | 1.1737s / 1.3802s | 309,200 | measured |
| 50% | IDs only | [0.9847](raw_results/zilliz_cloud_capacity_12cu/scalar_label_filter/50p/ids_only/serial_recall/result_20260511_e4f5b746fff54cb9ae75b8a10fe34e1b_zillizcloud.json) | 95.6923 | 109.4589 | [109.4589](raw_results/zilliz_cloud_capacity_12cu/scalar_label_filter/50p/ids_only/concurrent_qps/result_20260511_5be830c78b2244aba70440743cab58e8_zillizcloud.json) | 0.6219s / 0.7244s | 0.6874s / 0.7955s | 0.7768s / 0.8118s | 2,000 | measured |
| 50% | scalar label | [0.9847](raw_results/zilliz_cloud_capacity_12cu/scalar_label_filter/50p/scalar_label/serial_recall/result_20260511_620d70bf55114dadae8fb45ae4614d33_zillizcloud.json) | 96.6743 | 113.3363 | [113.3363](raw_results/zilliz_cloud_capacity_12cu/scalar_label_filter/50p/scalar_label/concurrent_qps/result_20260511_adc481db9bde49dcb011f5053e726662_zillizcloud.json) | 0.6165s / 0.6991s | 0.6937s / 0.7911s | 0.7678s / 0.8935s | 3,600 | measured |
| 50% | vector | [0.9847](raw_results/zilliz_cloud_capacity_12cu/scalar_label_filter/50p/vector/serial_recall/result_20260511_6a17585a0ae84f759d02280c20821c0b_zillizcloud.json) | 88.6614 | 96.9616 | [96.9616](raw_results/zilliz_cloud_capacity_12cu/scalar_label_filter/50p/vector/concurrent_qps/result_20260511_71839a0964b4498a87a11072679711b3_zillizcloud.json) | 0.6722s / 0.8183s | 0.7954s / 0.9553s | 0.9112s / 1.1676s | 309,200 | measured |

## Pinecone Serverless

Index layout and CloudPayloadSearchCase compatibility validated on
`vdbbench-laion-100m-768d-l2` with 100,000,000 vectors, 768 dimensions, and L2
metric. Metadata fields used for payload tests: `label`, `label_2kb`, and
`meta`.

Pinecone unfiltered concurrent search was run at concurrency `3,4` with
VDBBench Pinecone query retry/backoff enabled. These concurrency levels are
lower than the default `60,80` because the serverless index returned 429
rate-limit responses at higher unpaced concurrency.

### Unfiltered Search

| Payload | Recall | QPS @3 | QPS @4 | Max QPS | Avg latency @3/@4 | P95 @3/@4 | P99 @3/@4 | Payload bytes/query | Status |
| --- | ---: | ---: | ---: | ---: | --- | --- | --- | ---: | --- |
| IDs only | [0.9609](raw_results/pinecone_serverless/unfiltered/na/ids_only/serial_recall/result_20260513_pinecone_serverless_unfiltered_na_ids_only_serial_recall_20260513_pinecone.json) | 4.5642 | 4.1479 | [4.5642](raw_results/pinecone_serverless/unfiltered/na/ids_only/concurrent_qps/result_20260513_pinecone_serverless_unfiltered_na_ids_only_concurrent_qps_c3c4_20260513_pinecone.json) | 0.6546s / 0.9537s | 2.0774s / 3.0967s | 2.6046s / 4.8496s | 2,000 | measured retry-enabled |
| scalar label | [0.9609](raw_results/pinecone_serverless/unfiltered/na/scalar_label/serial_recall/result_20260513_pinecone_serverless_unfiltered_na_scalar_label_serial_recall_20260513_pinecone.json) | 4.5139 | 4.1723 | [4.5139](raw_results/pinecone_serverless/unfiltered/na/scalar_label/concurrent_qps/result_20260513_pinecone_serverless_unfiltered_na_scalar_label_concurrent_qps_c3c4_20260513_pinecone.json) | 0.6592s / 0.9486s | 2.0939s / 2.6068s | 2.6436s / 4.3413s | 3,600 | measured retry-enabled |
| vector | [0.961](raw_results/pinecone_serverless/unfiltered/na/vector/serial_recall/result_20260513_pinecone_serverless_unfiltered_na_vector_serial_recall_20260513_pinecone.json) | 4.4830 | 4.1931 | [4.483](raw_results/pinecone_serverless/unfiltered/na/vector/concurrent_qps/result_20260513_pinecone_serverless_unfiltered_na_vector_concurrent_qps_c3c4_20260513_pinecone.json) | 0.6623s / 0.9412s | 1.0895s / 2.0901s | 1.6160s / 2.6097s | 309,200 | measured retry-enabled |

### Integer Filtered Search

| Selectivity | Payload | Recall | QPS @60 | QPS @80 | Max QPS | Avg latency @60/@80 | P95 @60/@80 | P99 @60/@80 | Status |
| ---: | --- | ---: | ---: | ---: | ---: | --- | --- | --- | --- |
| TBD | IDs only | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| TBD | scalar label | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| TBD | vector | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |

### Scalar Label Filtered Search

| Selectivity | Payload | Recall | QPS @60 | QPS @80 | Max QPS | Avg latency @60/@80 | P95 @60/@80 | P99 @60/@80 | Payload bytes/query | Status |
| ---: | --- | ---: | ---: | ---: | ---: | --- | --- | --- | ---: | --- |
| TBD | IDs only | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| TBD | scalar label | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| TBD | vector | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |

## Turbopuffer Unpinned

Namespace layout and CloudPayloadSearchCase compatibility still need to be
validated before running this section.

### Unfiltered Search

| Payload | Recall | QPS @60 | QPS @80 | Max QPS | Avg latency @60/@80 | P95 @60/@80 | P99 @60/@80 | Status |
| --- | ---: | ---: | ---: | ---: | --- | --- | --- | --- |
| IDs only | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| scalar label | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| vector | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |

### Integer Filtered Search

| Selectivity | Payload | Recall | QPS @60 | QPS @80 | Max QPS | Avg latency @60/@80 | P95 @60/@80 | P99 @60/@80 | Status |
| ---: | --- | ---: | ---: | ---: | ---: | --- | --- | --- | --- |
| TBD | IDs only | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| TBD | scalar label | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| TBD | vector | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |

### Scalar Label Filtered Search

| Selectivity | Payload | Recall | QPS @60 | QPS @80 | Max QPS | Avg latency @60/@80 | P95 @60/@80 | P99 @60/@80 | Payload bytes/query | Status |
| ---: | --- | ---: | ---: | ---: | ---: | --- | --- | --- | ---: | --- |
| TBD | IDs only | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| TBD | scalar label | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| TBD | vector | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |

## Turbopuffer Pinned

Namespace pinning can incur ongoing cost. Only change pinning state after an
explicit instruction.

### Unfiltered Search

| Payload | Recall | QPS @60 | QPS @80 | Max QPS | Avg latency @60/@80 | P95 @60/@80 | P99 @60/@80 | Status |
| --- | ---: | ---: | ---: | ---: | --- | --- | --- | --- |
| IDs only | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| scalar label | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| vector | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |

### Integer Filtered Search

| Selectivity | Payload | Recall | QPS @60 | QPS @80 | Max QPS | Avg latency @60/@80 | P95 @60/@80 | P99 @60/@80 | Status |
| ---: | --- | ---: | ---: | ---: | ---: | --- | --- | --- | --- |
| TBD | IDs only | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| TBD | scalar label | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| TBD | vector | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |

### Scalar Label Filtered Search

| Selectivity | Payload | Recall | QPS @60 | QPS @80 | Max QPS | Avg latency @60/@80 | P95 @60/@80 | P99 @60/@80 | Payload bytes/query | Status |
| ---: | --- | ---: | ---: | ---: | ---: | --- | --- | --- | ---: | --- |
| TBD | IDs only | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| TBD | scalar label | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |
| TBD | vector | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | pending |

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
