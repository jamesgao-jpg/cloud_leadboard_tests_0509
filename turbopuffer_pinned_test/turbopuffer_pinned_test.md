# Turbopuffer Pinning Test - LAION 100M

Date: 2026-05-09 to 2026-05-10 UTC

## Objective

Measure Turbopuffer namespace pinning on the existing LAION 100M namespace and
prepare a clean artifact for cloud leaderboard analysis. This report is
preliminary: it captures completed one-replica and two-replica runs, the
current cost model, and the next testing direction.

## Framework

| Item | Value |
|---|---|
| VectorDBBench repo | `github.com/jamesgao-jpg/VectorDBBench` |
| VectorDBBench branch | `tp_vs_zilliz_0415` |
| VectorDBBench commit | `4d8be2f32bac3f15a59c833f558eb8bf69629caf` |
| Dataset | LAION 100M, 768 dim, L2, top-100 |
| Turbopuffer namespace | `laion100m_bulk` |
| Turbopuffer region | `aws-us-west-2` |
| Pin configurations tested | 1 replica, 2 replicas |

## Commands

Unfiltered:

```bash
PYTHONPATH=$PWD python -m vectordb_bench.cli.vectordbbench turbopuffer \
  --api-key <api-key> --region aws-us-west-2 \
  --namespace laion100m_bulk \
  --pin-namespace --pin-replicas <replicas> --pin-timeout 28800 \
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
  --pin-namespace --pin-replicas <replicas> --pin-timeout 28800 \
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

The completed two-replica rerun used `--pin-timeout 28800` and
`TPUF_MAX_RETRIES=0` so rate-limit responses would surface instead of being
hidden by SDK retries. Pinning was already ready at run start:
`replicas=2`, `ready_replicas=2`, `approx_row_count=100000000`. After the run,
metadata still showed `replicas=2`, `ready_replicas=2`, `utilization=1.0`.
Per user instruction, the namespace was intentionally left pinned.

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

## Completed Two-Replica Results

The two-replica rerun completed on 2026-05-10 with `TPUF_MAX_RETRIES=0`. No
visible `429`, `RateLimitError`, `Too Many`, `APIStatusError`, `ERROR`, or
traceback entries were observed in the log scan.

| Case | Max QPS | At concurrency | QPS @60 | p99 @60 | QPS @80 | p99 @80 | serial p95 | serial p99 | recall | ndcg |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Unfiltered | 73.8404 | 80 | 59.5299 | 2,664 ms | 73.8404 | 3,086 ms | 35.1 ms | 45.0 ms | 0.9001 | 0.9081 |
| Filter 0.5 | 42.1268 | 80 | 40.4500 | 3,751 ms | 42.1268 | 3,928 ms | 46.5 ms | 50.1 ms | 0.9270 | 0.9335 |
| Filter 0.9 | 61.9519 | 80 | 56.4397 | 2,604 ms | 61.9519 | 2,503 ms | 38.5 ms | 42.8 ms | 0.8702 | 0.8842 |
| Filter 0.99 | 106.0816 | 80 | 92.9644 | 1,743 ms | 106.0816 | 1,981 ms | 34.5 ms | 41.2 ms | 0.6660 | 0.7056 |
| Filter 0.999 | 72.4537 | 80 | 58.1873 | 4,228 ms | 72.4537 | 2,331 ms | 87.1 ms | 88.3 ms | 0.9136 | 0.9280 |

Result JSONs from the completed two-replica rerun:

| Case | File |
|---|---|
| Unfiltered | `result_20260510_1701a632ee734fa1bdcd7f5bee2a1f65_turbopuffer.json` |
| Filter 0.5 | `result_20260510_cfb1b8b5e9e946bfb688ec139ad20d9e_turbopuffer.json` |
| Filter 0.9 | `result_20260510_5e696b0ee86242e0a5556c631600bf27_turbopuffer.json` |
| Filter 0.99 | `result_20260510_065dda9cc1144047808672b95149348e_turbopuffer.json` |
| Filter 0.999 | `result_20260510_f28a84df528f414db1b3f72d2e0cf648_turbopuffer.json` |

## Two-Replica Run-To-Run Comparison

The previous two-replica pinned run and the 2026-05-10 rerun are broadly
consistent. The main outlier is filter `0.99`, where the rerun was about 9%
higher.

| Case | Previous 2-replica max QPS | Rerun max QPS | Change |
|---|---:|---:|---:|
| Unfiltered | 74.1612 | 73.8404 | -0.4% |
| Filter 0.5 | 40.0561 | 42.1268 | +5.2% |
| Filter 0.9 | 63.7324 | 61.9519 | -2.8% |
| Filter 0.99 | 97.1869 | 106.0816 | +9.2% |
| Filter 0.999 | 72.7099 | 72.4537 | -0.4% |

## Comparison Against Prior Non-Pin Run

| Case | Prior non-pin max QPS | Pin 1-replica max QPS | Pin 2-replica max QPS | Direction |
|---|---:|---:|---:|---|
| Unfiltered | 598.9 | 41.03 | 73.84 | Pin degraded |
| Filter 0.5 | 359.2 | 20.56 | 42.13 | Pin degraded |
| Filter 0.9 | 382.8 | 36.45 | 61.95 | Pin degraded |
| Filter 0.99 | 415.3 | 56.28 | 106.08 | Pin degraded |
| Filter 0.999 | 87.9 | 37.56 | 72.45 | Pin degraded |

Preliminary interpretation: pinning scales meaningfully from one replica to
two replicas for this workload, but two replicas remain far below the prior
non-pin Turbopuffer throughput for most cases. The exception is the most
selective filter `0.999`, where two pinned replicas close most of the gap
against the prior non-pin result. Pin mode may still be useful if higher
replica counts continue to scale and if the cost/QPS target favors fixed
pinned storage cost over TB-queried billing.

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

For two replicas, the fixed cost doubles:

```text
two_replica_fixed_hourly = $8.1386/hour
0.1883664 * QPS = 8.1386 + 0.00036 * QPS
QPS = 43.29
```

So two-replica pin mode becomes cheaper than non-pin Turbopuffer at about
43 QPS, again assuming the pinned replicas can serve the target QPS with
acceptable latency.

Replica cost scales linearly:

| Replicas | Fixed cost per hour | Fixed cost per month |
|---:|---:|---:|
| 1 | $4.07 | $2,930 |
| 2 | $8.14 | $5,860 |
| 4 | $16.28 | $11,720 |
| 8 | $32.55 | $23,439 |

## Proposed Next Tests

Test `--pin-replicas 4`, and only test `8` if the four-replica result shows
meaningful scaling.

For each replica count, measure:

- readiness time
- unfiltered QPS and p99 at concurrency 60/80
- filtered QPS and p99 for 0.5, 0.9, 0.99, and 0.999
- recall and ndcg
- metadata utilization during or immediately after the run
- visible 429s with `TPUF_MAX_RETRIES=0`
- cost/QPS after multiplying fixed pin cost by replica count

## Sources

- Turbopuffer pinning docs: https://turbopuffer.com/docs/pinning
- User-provided Turbopuffer billing line: `Pinned Namespace Storage (GB hours) 292.856667 x $0.0132465753`
- Completed one-replica run log: `/tmp/tpuf_pin_bench_20260509T053538Z.log`
- Completed two-replica rerun log: `/tmp/tpuf_pin_bench_replicas2_retries0_rerun2_20260510T052529Z.log`
