# Zilliz Cloud Tiered 4CU Payload Sync Test

## Summary

This test rebenchmarks Zilliz Cloud Tiered 4CU after
`queryNode.segcore.tieredStorage.warmup.vectorField = sync` was enabled. The
goal is to check whether returning vectors as payload is still prohibitively
slow for the LAION 100M search workload.

Result: vector payload search is now in the tens of QPS. This is a major
improvement over the earlier confirmed 4CU vector-payload result, which was
about 0.26-0.31 QPS with 144-161s average latency.

## Framework Version

| Item | Value |
|---|---|
| Test framework | VectorDBBench |
| Repository path | `/home/ubuntu/vdbbenchleadboard2/VectorDBBench` |
| Commit | `2183232c0e718e64e282c8b1c51de49309dc1128` |
| Branch | `cloud-payload-search-case` |
| VDBBench case | `CloudPayloadSearchCase` |
| Result JSON | `vectordb_bench/results/ZillizCloud/result_20260509_6b3cbbfcc62d4752b1afbdc2f0874ee3_zillizcloud.json` |
| Run label | `tiered4cu_payload_vector_sync_c60c80_60s_20260509` |
| Run time | 2026-05-09 10:02-10:05 UTC |

## Workload

| Field | Value |
|---|---|
| Product | Zilliz Cloud Tiered |
| Size | 4CU |
| Dataset | LAION 100M |
| Dimension | 768 |
| Metric | L2 |
| Collection | `LAION100M` |
| TopK | 100 |
| Payload profile | `vector` |
| Estimated returned payload | 309,200 bytes/query |
| Search mode | concurrent only |
| Concurrency levels | 60, 80 |
| Configured duration | 60s per concurrency |

## Reproduction Command

Set credentials through environment variables or the shell before running.
Do not commit credentials.

```bash
export DATASET_LOCAL_DIR=/mnt/instance/vectordb_bench/dataset
export ZILLIZ_PASSWORD='<redacted>'
export ZILLIZ_TOKEN='<redacted>'

.venv/bin/python -X faulthandler -m vectordb_bench.cli.vectordbbench zillizautoindex \
  --uri 'https://in01-bc445bdf6b65d0d.aws-us-west-2.vectordb.zillizcloud.com:19530' \
  --user-name db_admin \
  --case-type CloudPayloadSearchCase \
  --payload-profile vector \
  --collection-name LAION100M \
  --skip-drop-old --skip-load \
  --skip-search-serial --search-concurrent \
  --num-concurrency 60,80 \
  --concurrency-duration 60 \
  --db-label tiered4cu_payload_vector_sync_c60c80_60s_20260509
```

## Results

| Concurrency | QPS | Avg latency | P95 latency | P99 latency |
|---:|---:|---:|---:|---:|
| 60 | 32.8253 | 1.8196s | 2.2119s | 11.5227s |
| 80 | 44.0385 | 1.7981s | 2.0263s | 2.7943s |

Maximum QPS across tested concurrency levels: **44.0385 QPS**.

## Comparison Against Earlier Confirmed 4CU Vector Payload Run

| Run | Concurrency 60 QPS | Concurrency 80 QPS | Avg latency 60/80 |
|---|---:|---:|---:|
| Before vector-field sync | 0.2597 | 0.3141 | 144.2369s / 161.0233s |
| After vector-field sync | 32.8253 | 44.0385 | 1.8196s / 1.7981s |

Interpretation: enabling vector-field sync changes the vector payload result
from effectively unusable to a usable search path, although it is still slower
than IDs-only search on the same cluster.

## Notes

- `recall`, `ndcg`, and serial latency fields are `0.0` in this run because
  serial search was intentionally skipped.
- Current VDBBench `qps` is the max QPS across the concurrency list, not a
  fixed target-QPS result.
- `payload_estimated_bytes_per_query` is an estimate from VDBBench, not a
  measured network byte count.

