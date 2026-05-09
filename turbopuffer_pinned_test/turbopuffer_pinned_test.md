# Turbopuffer Pinning Test - LAION 100M

Date: 2026-05-09 UTC

## Objective

Measure Turbopuffer namespace pinning on the existing LAION 100M namespace and
prepare a clean artifact for cloud leaderboard analysis. This report is
preliminary: it captures the completed one-replica run, the current cost model,
and the active rerun state.

## Framework

| Item | Value |
|---|---|
| VectorDBBench repo | `github.com/jamesgao-jpg/VectorDBBench` |
| VectorDBBench branch | `tp_vs_zilliz_0415` |
| VectorDBBench commit | `4d8be2f32bac3f15a59c833f558eb8bf69629caf` |
| Dataset | LAION 100M, 768 dim, L2, top-100 |
| Turbopuffer namespace | `laion100m_bulk` |
| Turbopuffer region | `aws-us-west-2` |
| Pin configuration | 1 replica |

## Commands

Unfiltered:

```bash
PYTHONPATH=$PWD python -m vectordb_bench.cli.vectordbbench turbopuffer \
  --api-key <api-key> --region aws-us-west-2 \
  --namespace laion100m_bulk \
  --pin-namespace --pin-replicas 1 --pin-timeout 28800 \
  --case-type Performance768D100M \
  --skip-drop-old --skip-load \
  --search-serial --search-concurrent \
  --num-concurrency 60,80 \
  --concurrency-duration 30 \
  --db-label laion100m_search_unfiltered_tpuf_pin
```

Filtered, repeated for `--filter-rate 0.5`, `0.9`, `0.99`, and `0.999`:

```bash
PYTHONPATH=$PWD python -m vectordb_bench.cli.vectordbbench turbopuffer \
  --api-key <api-key> --region aws-us-west-2 \
  --namespace laion100m_bulk \
  --pin-namespace --pin-replicas 1 --pin-timeout 28800 \
  --case-type NewIntFilterPerformanceCase \
  --dataset-with-size-type "Large LAION (768dim, 100M)" \
  --filter-rate <rate> \
  --skip-drop-old --skip-load \
  --search-serial --search-concurrent \
  --num-concurrency 60,80 \
  --concurrency-duration 30 \
  --db-label laion100m_search_filter_<rate>_tpuf_pin
```

Unpin command, used only when cleanup is explicitly requested:

```bash
PYTHONPATH=$PWD python -m vectordb_bench.cli.vectordbbench turbopufferunpin \
  --api-key <api-key> --region aws-us-west-2 \
  --namespace laion100m_bulk \
  --pin-timeout 28800
```

## Pin Readiness

The first real readiness test used a 45 minute timeout and did not complete;
metadata remained at `ready_replicas=0`.

The completed one-replica benchmark used `--pin-timeout 28800`. Pinning
completed after about 82 minutes, then the benchmark ran unfiltered plus all
four filter rates. That completed run was cleaned up afterward and a direct
metadata GET returned `pinning=None`, `approx_row_count=100000000`.

A rerun was started on 2026-05-09 at 07:24:56 UTC with no cleanup trap. As of
07:42 UTC, it was still waiting for `ready_replicas=1`. Per the latest user
instruction, this rerun should leave the namespace pinned unless explicitly
instructed otherwise.

## Completed One-Replica Results

| Case | Max QPS | At concurrency | QPS @60 | p99 @60 | QPS @80 | p99 @80 | serial p95 | serial p99 | recall | ndcg |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Unfiltered | 41.0344 | 80 | 38.4469 | 3,853 ms | 41.0344 | 3,472 ms | 56.5 ms | 60.2 ms | 0.9001 | 0.9081 |
| Filter 0.5 | 20.5579 | 60 | 20.5579 | 4,141 ms | 20.3633 | 5,940 ms | 80.2 ms | 87.8 ms | 0.9270 | 0.9335 |
| Filter 0.9 | 36.4549 | 80 | 33.5393 | 2,602 ms | 36.4549 | 3,805 ms | 56.0 ms | 59.8 ms | 0.8702 | 0.8842 |
| Filter 0.99 | 56.2825 | 80 | 56.2159 | 1,705 ms | 56.2825 | 2,435 ms | 34.0 ms | 51.4 ms | 0.6660 | 0.7056 |
| Filter 0.999 | 37.5585 | 80 | 30.4266 | 5,881 ms | 37.5585 | 3,140 ms | 85.0 ms | 86.7 ms | 0.9136 | 0.9280 |

Result JSONs from the completed run:

| Case | File |
|---|---|
| Unfiltered | `result_20260509_e2543d46747d48c8a91034740e8a018b_turbopuffer.json` |
| Filter 0.5 | `result_20260509_e473305500504f7785e5b25b31b3e628_turbopuffer.json` |
| Filter 0.9 | `result_20260509_8b12749689e74709aeb75387dd32b995_turbopuffer.json` |
| Filter 0.99 | `result_20260509_b7e4ee0fec9f4da09a249bf991556849_turbopuffer.json` |
| Filter 0.999 | `result_20260509_a65d3be327304eac8ab740402aab8962_turbopuffer.json` |

## Comparison Against Prior Non-Pin Run

| Case | Prior non-pin max QPS | Pin 1-replica max QPS | Direction |
|---|---:|---:|---|
| Unfiltered | 598.9 | 41.03 | Pin degraded |
| Filter 0.5 | 359.2 | 20.56 | Pin degraded |
| Filter 0.9 | 382.8 | 36.45 | Pin degraded |
| Filter 0.99 | 415.3 | 56.28 | Pin degraded |
| Filter 0.999 | 87.9 | 37.56 | Pin degraded |

Preliminary interpretation: one pinned replica appears to be a much smaller
serving pool than the default multi-tenant query path for this workload. Pin
mode may still be useful if additional replicas scale cleanly, but the
one-replica result is not competitive for LAION 100M throughput.

## Cost Model

Turbopuffer pinning replaces `TB Queried` billing with a pinned namespace
GB-hour charge while pinned. Turbopuffer's pinning docs define the billing unit
as:

```text
namespace size GB * replicas * hours pinned
```

The effective rate used here comes from actual Turbopuffer billing:

```text
Pinned Namespace Storage (GB hours): 292.856667 x $0.0132465753
$0.0132465753 per GB-hour * 720 = $9.537534216 per GB-month
```

For LAION 100M with f32 vectors:

```text
pin_size_GB = 100,000,000 * 768 * 4 / 1e9 = 307.2 GB
pin_fixed_hourly = 307.2 * $0.0132465753 = $4.0693/hour
pin_fixed_monthly = $4.0693 * 720 = $2,929.93/month
returned_bytes_cost = QPS * 3600 * $1e-7
pin_cost_per_hour = $4.0693 + QPS * $0.00036
```

Prior non-pin Turbopuffer query cost for LAION 100M:

```text
non_pin_cost_per_hour = QPS * $0.1883664
```

Non-pin vs pin break-even:

```text
0.1883664 * QPS = 4.0693 + 0.00036 * QPS
QPS = 21.64
```

So pin mode becomes cheaper than non-pin Turbopuffer at about 22 QPS, assuming
the pinned replica count can serve the target QPS with acceptable latency.
Because the measured one-replica ceiling was only 41.03 QPS unfiltered, the
useful one-replica band is narrow.

Replica cost scales linearly:

| Replicas | Fixed cost per hour | Fixed cost per month |
|---:|---:|---:|
| 1 | $4.07 | $2,930 |
| 2 | $8.14 | $5,860 |
| 4 | $16.28 | $11,720 |
| 8 | $32.55 | $23,439 |

## Proposed Next Tests

Test `--pin-replicas 2`, then `4`, and only test `8` if the first two show
meaningful scaling.

For each replica count, measure:

- readiness time
- unfiltered QPS and p99 at concurrency 60/80
- filtered QPS and p99 for 0.5, 0.9, 0.99, and 0.999
- recall and ndcg
- metadata utilization during or immediately after the run
- cost/QPS after multiplying fixed pin cost by replica count

## Sources

- Turbopuffer pinning docs: https://turbopuffer.com/docs/pinning
- User-provided Turbopuffer billing line: `Pinned Namespace Storage (GB hours) 292.856667 x $0.0132465753`
- Completed run log: `/tmp/tpuf_pin_bench_20260509T053538Z.log`
- Active rerun log: `/tmp/tpuf_pin_bench_rerun_20260509T072456Z.log`
