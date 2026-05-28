# Cost-QPS Pareto Test — LAION 100M — Side-by-Side

Compare cost vs sustained QPS for the top-100 unfiltered LAION 100M
reference workload across Turbopuffer and five Zilliz Cloud cluster
sizes (Tiered 4/8 CU, Capacity 12/16/32 CU). Tiered 4 CU and 8 CU use
index-version-10 reruns. For QPS targets above a cluster's measured
ceiling we mark **— (not reachable)** rather than extrapolating.

| # | System | Notes |
|---|--------|-------|
| 1 | Turbopuffer | serverless; tested up to 599 QPS |
| 2 | Zilliz Cloud Tiered, **4 CU, index v10** | tested max **57.97 QPS** |
| 3 | Zilliz Cloud Tiered, **8 CU, index v10** | tested max **114.37 QPS** |
| 4 | Zilliz Cloud Capacity, **12 CU** | tested max **310.47 QPS** |
| 5 | Zilliz Cloud Capacity, **16 CU** | tested max **405.6 QPS** |
| 6 | Zilliz Cloud Capacity, **32 CU** | tested max **786.0793 QPS** with ids-only payload |

## TL;DR

**Headline crossover: Zilliz beats Turbopuffer at and above 8 QPS.**
At 8 QPS Turbopuffer's monthly bill is about $1,085, crossing the
Tiered 4 CU floor ($1,071.36/mo). Below 8 QPS Turbopuffer wins; from 8
QPS onward the cheapest reachable Zilliz option is cheaper than
Turbopuffer at that same QPS.

**Compute-only hourly cost** for LAION 100M (~300 GB, unfiltered top-100)
at sustained QPS, us-west-2 pricing:

| QPS | Turbopuffer | Tiered 4 CU | Tiered 8 CU | Capacity 12 CU | Capacity 16 CU | Capacity 32 CU |
|----:|------------:|------------:|------------:|---------------:|---------------:|---------------:|
|   1 | **$0.188** | $1.488 | $2.976 | $2.976 | $3.968 | $7.936 |
| **8** ⭐ | $1.507 | **$1.488** ⭐ | $2.976 | $2.976 | $3.968 | $7.936 | <!-- crossover row -->
|  10 | $1.884 | **$1.488** | $2.976 | $2.976 | $3.968 | $7.936 |
|  57 | $10.738 | **$1.488** | $2.976 | $2.976 | $3.968 | $7.936 |
| 100 | $18.837 | — (max 58) | **$2.976** | **$2.976** | $3.968 | $7.936 |
| 114 | $21.474 | — (max 58) | **$2.976** | **$2.976** | $3.968 | $7.936 |
| 115 | $21.662 | — (max 58) | — (max 114) | **$2.976** | $3.968 | $7.936 |
| 400 | $75.347 | — | — | — (max 310) | **$3.968** | $7.936 |
| 406 | $76.477 | — | — | — | — (max 405) | **$7.936** |
| 786 | $148.056 | — | — | — | — | **$7.936** |

⭐ **QPS = 8 is the crossover row**: TB hourly ($1.507) just exceeds
the Tiered 4 CU floor ($1.488).

Per-QPS winners (cheapest reachable option):
- **≤ 7 QPS** → Turbopuffer
- **8 – 57 QPS** → Tiered 4 CU
- **58 – 114 QPS** → Tiered 8 CU or Capacity 12 CU (tied at $2,142.72/mo)
- **115 – 310 QPS** → Capacity 12 CU
- **311 – 405 QPS** → Capacity 16 CU
- **406 – 786 QPS** → Capacity 32 CU

Recall (CU-independent; identical across sizings of the same system):
- Turbopuffer: 0.900
- Zilliz Tiered: 0.951
- Zilliz Capacity 12/16 CU: **0.971**
- Zilliz Capacity 32 CU: **0.9728**

Scope + caveats:
- **Compute-only** — storage, write, and returned-bytes costs excluded
  (all negligible vs compute/queried-bytes).
- **No extrapolation** — cells marked `— (max X)` mean the configuration
  is at or above its tested QPS ceiling. To serve more QPS, choose the
  next CU size up.
- **Tiered 4 CU index v10 removed the old cache cliff** for this cost
  band: unfiltered max QPS increased from 4.29 to 57.97.
- **Capacity 32 CU uses the cost board's unfiltered ids-only payload
  ceiling**: 786.0793 QPS at conc=60/80, with serial recall 0.9728.

## Prerequisites

- **Region:** all systems tested in **AWS us-west-2**. Pricing quoted
  in the cost model ($0.372/CU/hr Tiered, $0.248/CU/hr Capacity,
  Turbopuffer rate card) is the us-west-2 rate. Other regions may
  differ.
- Reference QPS measurements (unfiltered, k=100; payload basis follows
  the source run):
  - Turbopuffer: 598.9 QPS at conc=80
  - Zilliz Tiered 4 CU: **57.97 QPS** at conc=80 (current cluster, index v10)
  - Zilliz Tiered 8 CU: **114.37 QPS** at conc=80 (index v10)
  - Zilliz Capacity 12 CU: **310.47 QPS** at conc=80 (current cluster)
  - Zilliz Capacity 16 CU: **405.6 QPS** at conc=80 (pre-scaledown measurement)
  - Zilliz Capacity 32 CU: **786.0793 QPS** ids-only payload at conc=60/80

## Method

### Cost model

| | Turbopuffer | Zilliz Cloud Tiered | Zilliz Cloud Capacity |
|---|---|---|---|
| **Billing unit** | Per query (bytes queried + bytes returned) | Per CU-hour | Per CU-hour |
| **Rate** | $1.00/PB queried base + $0.05/GB returned | $0.372 / CU / hr | $0.248 / CU / hr |
| **Queried bytes (per query)** | Namespace size at f16-index basis = 100 M × 768 × 2 B = **153.6 GB** (TB bills queries on the quantized index, not physical f32) | n/a | n/a |
| **Tiered discount (queried)** | 0–32 GB full; 32–128 GB 80% off; >128 GB 96% off | n/a | n/a |
| **Per-query cost** | **$5.23 × 10⁻⁵** | (CU cost amortized over QPS served) | (CU cost amortized over QPS served) |
| **Cost at target QPS** | QPS × 3600 × $5.23e-5 | (cluster size's CU count) × $0.372/hr — flat up to that size's measured max QPS | (cluster size's CU count) × $0.248/hr — flat up to that size's measured max QPS |

### Formulas

#### Turbopuffer (per-hour cost at sustained QPS)

Let `N` = namespace size in GB (queried basis) = `docs × (attrs_B + dim × 2) / 1e9`.
For LAION 100M: `N = 100e6 × (0 + 768 × 2) / 1e9 = 153.6 GB`.

```
queried_GB_per_query(N) = max(N, 1.28)  // floor
tiered_GB(g) = min(g, 32) × 1.0   # tier 1: full rate
             + clip(g-32, 0, 96) × 0.2   # tier 2: 80% discount
             + max(g-128, 0) × 0.04   # tier 3: 96% discount
queried_cost_per_query  = tiered_GB(queried_GB_per_query(N)) × $1e-6 / GB
returned_cost_per_query = returned_bytes_per_query / 1e9 × $0.05
per_query_cost          = queried_cost_per_query + returned_cost_per_query
cost_per_hour           = QPS × 3600 × per_query_cost
```

For LAION 100M (N = 153.6 GB): `tiered_GB = 32 + 96×0.2 + 25.6×0.04 = 52.224 GB`,
so `per_query_cost ≈ $5.22e-5` and `cost_per_hour ≈ QPS × 3600 × 5.22e-5 = QPS × $0.188`.

##### Worked example — LAION 100M at 1 QPS

```
Inputs:
  docs         = 100,000,000
  dim          = 768
  attr_B       = 0                       # no scalar attributes
  queries/mo   = 2,592,000               # 1 QPS × 3600 × 720
  plan         = Launch

Step 1 — bytes per doc (queried basis, f16-equivalent index)
  per_doc_bytes = 0 + 0 + 768 × 2 = 1536 B

Step 2 — namespace size (decimal GB)
  namespace_GB = 100,000,000 × 1536 / 1e9 = 153.6 GB

Step 3 — tiered-discount effective GB per query
  effective_GB = 153.6 − 0.96 × (153.6−128) − 0.80 × (128−32)
              = 153.6 − 24.576 − 76.8
              = 52.224 GB

Step 4 — cost per query
  cost_per_query = 52.224 × $1e-6 = $5.2224 × 10⁻⁵

Step 5 — monthly cost at exact 1 QPS for 720 hours (2.592M queries)
  monthly = 2,592,000 × $5.2224e-5 = $135.36
```

#### Zilliz Cloud (Tiered or Capacity)

```
# Each measured CU size has a fixed hourly cost and a max-QPS ceiling.
# Below the ceiling: cost = CU_count × $/CU/hr (FLAT, regardless of QPS).
# Above the ceiling: not reachable at that CU count — must scale up.

tiered_4cu_cost_per_hour    = 4  × $0.372 = $1.488/hr  (max 57.97 QPS)
tiered_8cu_cost_per_hour    = 8  × $0.372 = $2.976/hr  (max 114.37 QPS)
capacity_12cu_cost_per_hour = 12 × $0.248 = $2.976/hr  (max 310.47 QPS)
capacity_16cu_cost_per_hour = 16 × $0.248 = $3.968/hr  (max 405.6 QPS)
capacity_32cu_cost_per_hour = 32 × $0.248 = $7.936/hr  (max 786.0793 QPS)

cost_per_month = cost_per_hour × 720
```

### Calculator

`cost_calc.py` in this folder. Run to reproduce:

```bash
python3 cost_calc.py                # default QPS = 1, 10, 100
python3 cost_calc.py 5 50 500       # custom QPS list
```

The calculator uses measured QPS ceilings and does not extrapolate
Zilliz configurations past tested headroom.

## Results — LAION 100M unfiltered

### Monthly cost (720 hours of sustained QPS)

| QPS | Turbopuffer | Tiered 4 CU | Tiered 8 CU | Capacity 12 CU | Capacity 16 CU | Capacity 32 CU |
|----:|------------:|------------:|------------:|---------------:|---------------:|---------------:|
|   1 | **$135.36** | $1,071.36 | $2,142.72 | $2,142.72 | $2,856.96 | $5,713.92 |
| **8** ⭐ | $1,084.99 | **$1,071.36** ⭐ | $2,142.72 | $2,142.72 | $2,856.96 | $5,713.92 |
|  10 | $1,356.48 | **$1,071.36** | $2,142.72 | $2,142.72 | $2,856.96 | $5,713.92 |
|  57 | $7,730.70 | **$1,071.36** | $2,142.72 | $2,142.72 | $2,856.96 | $5,713.92 |
|  58 | $7,866.32 | — (max 58) | **$2,142.72** | **$2,142.72** | $2,856.96 | $5,713.92 |
| 100 | $13,562.64 | — (max 58) | **$2,142.72** | **$2,142.72** | $2,856.96 | $5,713.92 |
| 114 | $15,461.41 | — (max 58) | **$2,142.72** | **$2,142.72** | $2,856.96 | $5,713.92 |
| 115 | $15,597.04 | — (max 58) | — (max 114) | **$2,142.72** | $2,856.96 | $5,713.92 |
| 400 | $54,249.84 | — | — | — (max 310) | **$2,856.96** | $5,713.92 |
| 406 | $55,063.27 | — | — | — | — (max 405) | **$5,713.92** |
| 786 | $106,600.31 | — | — | — | — | **$5,713.92** |

⭐ **QPS = 8 crossover**: first row where Zilliz (Tiered 4 CU at
$1,071.36/mo) beats Turbopuffer ($1,084.99/mo). Below 8 QPS TB wins;
from 8 QPS onward Zilliz wins and stays cheaper across the entire flat
zone.

Compute-only; storage and per-query-returned-bytes excluded (both
negligible vs the CU-hour and queried-bytes gap). Multiply hourly
(in TL;DR) by 720 to derive monthly.

### Recall @100 (warm serial run, CU-independent)

| System | Recall @100 |
|--------|------------:|
| Turbopuffer | 0.900 |
| Zilliz Cloud Tiered (4 or 8 CU) | 0.951 |
| Zilliz Cloud Capacity (12 or 16 CU) | **0.971** |
| Zilliz Cloud Capacity 32 CU | **0.9728** |

Recall is index-quality-bound, not CU-count-bound. Scaling CUs up or
down doesn't change recall.

### Product-selection knee

- **QPS ≤ 7** → Turbopuffer is cheapest (Tiered/Capacity at any CU
  size pay ≥ $1,071/mo flat for almost-idle compute).
- **QPS = 8 – 57** → **Tiered 4 CU** wins at $1,071.36/mo.
- **QPS = 58 – 114** → **Tiered 8 CU** OR **Capacity 12 CU** tied
  at $2,142.72/mo.
- **QPS = 115 – 310** → **Capacity 12 CU** wins at $2,142.72/mo.
- **QPS = 311 – 405** → **Capacity 16 CU** wins at $2,856.96/mo
  (Capacity 12 CU runs out of headroom at 310 QPS).
- **QPS = 406 – 786** → **Capacity 32 CU** wins at $5,713.92/mo
  (Capacity 16 CU runs out of headroom at 405 QPS).
- **QPS > 786** → Untested. Larger Capacity sizes or scaled-out Tiered
  required.

Tiered 8 CU is not uniquely cheapest in this matrix: Tiered 4 CU is
cheaper through its 57.97 QPS ceiling, and Capacity 12 CU has the same
hourly price as Tiered 8 CU while reaching much higher QPS.

### Scaling between sizes

Sizing decisions for LAION 100M:

| To handle | Cheapest config | Why |
|---|---|---|
| ≤7 QPS | Turbopuffer | Pay-per-query beats any CU floor |
| 8–57 QPS | Tiered 4 CU | Lowest reachable Zilliz CU floor after index v10 |
| 58–114 QPS | Tiered 8 CU OR Capacity 12 CU | Same $2,143/mo floor, both reach the QPS |
| 115–310 QPS | Capacity 12 CU | Same floor as Tiered 8 CU and more headroom |
| 311–405 QPS | Capacity 16 CU | Capacity 12 CU caps at 310 |
| 406–786 QPS | Capacity 32 CU | Capacity 16 CU caps at 405 |
| Need recall ≥ 0.96 | Capacity (any size) | Tiered 0.951, TB 0.900 |
| Need cold p99 ≤ 50 ms | Capacity (any size) | All-RAM, no cold tier |

## Notes

- Consistency: Zilliz `Session` (set by VDBBench); Turbopuffer `Strong`
  (default).
- Storage costs not included in the per-hour figures above. At 307.2 GB
  (physical f32) × $0.025/GB-mo Zilliz storage = $7.68/mo on top of
  CU-hour, or 307.2 × $0.33/GB-mo Turbopuffer storage = $101.38/mo on
  top of per-query. See `full_cost_test.md` for the lifecycle view.
- Turbopuffer min-queried-bytes floor (1.28 GB/query) does not bind
  here since the namespace is 153.6 GB (queried basis).
- f16 vectors on Turbopuffer would halve queried bytes → halve the
  per-query cost. Not tested here (LAION is f32).
- The **dash entries (—)** in tables denote "not reachable at this CU
  size" based on the measured QPS ceiling. We deliberately do not
  extrapolate.

## Files

- `cost_qps_pareto_test.md` — this report
- `cost_calc.py` — cost calculator
