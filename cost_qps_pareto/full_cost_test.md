# Full-Lifecycle Cost Test - LAION 100M

This report compares Turbopuffer and Zilliz Cloud on LAION 100M under
three cost views. Recurring tables are **$/hr**; multiply by `720` for a
30-day month. ⭐ marks the first row where Zilliz is cheaper than
Turbopuffer in that cost view.

## Contents

- [1. Queries Only](#1-queries-only)
- [2. Queries + Storage](#2-queries--storage)
- [3. Queries + Storage + Writes](#3-queries--storage--writes)
- [4. Cost Model Analysis](#4-cost-model-analysis)

## Systems

| System | Measured read ceiling |
|---|---:|
| Turbopuffer | 598.9 QPS |
| Zilliz Cloud Tiered 4 CU, index v10 | 57.97 QPS |
| Zilliz Cloud Tiered 8 CU, index v10 | 114.37 QPS |
| Zilliz Cloud Capacity 12 CU | 310.47 QPS |
| Zilliz Cloud Capacity 16 CU | 405.6 QPS |

## 1. Queries Only

Compute/query cost only. Storage and writes are excluded.

| QPS | Turbopuffer | Tiered 4 CU | Tiered 8 CU | Capacity 12 CU | Capacity 16 CU |
|----:|------------:|------------:|------------:|---------------:|---------------:|
|   1 | **$0.188** | $1.488 | $2.976 | $2.976 | $3.968 |
|   5 | **$0.942** | $1.488 | $2.976 | $2.976 | $3.968 |
| **8** ⭐ | $1.507 | **$1.488** ⭐ | $2.976 | $2.976 | $3.968 |
|  10 | $1.884 | **$1.488** | $2.976 | $2.976 | $3.968 |
|  57 | $10.737 | **$1.488** | $2.976 | $2.976 | $3.968 |
| 100 | $18.837 | - (max 58) | **$2.976** | **$2.976** | $3.968 |
| 114 | $21.474 | - (max 58) | **$2.976** | **$2.976** | $3.968 |
| 115 | $21.662 | - (max 58) | - (max 114) | **$2.976** | $3.968 |
| 400 | $75.347 | - | - | - (max 310) | **$3.968** |

## 2. Queries + Storage

Adds storage for the fixed 100M-row namespace.

| QPS | Turbopuffer | Tiered 4 CU | Tiered 8 CU | Capacity 12 CU | Capacity 16 CU |
|----:|------------:|------------:|------------:|---------------:|---------------:|
|   1 | **$0.329** | $1.505 | $2.993 | $2.987 | $3.979 |
|   5 | **$1.083** | $1.505 | $2.993 | $2.987 | $3.979 |
| **8** ⭐ | $1.648 | **$1.505** ⭐ | $2.993 | $2.987 | $3.979 |
|  10 | $2.024 | **$1.505** | $2.993 | $2.987 | $3.979 |
|  57 | $10.878 | **$1.505** | $2.993 | $2.987 | $3.979 |
| 100 | $18.977 | - (max 58) | $2.993 | **$2.987** | $3.979 |
| 114 | $21.615 | - (max 58) | $2.993 | **$2.987** | $3.979 |
| 115 | $21.803 | - (max 58) | - (max 114) | **$2.987** | $3.979 |
| 400 | $75.487 | - | - | - (max 310) | **$3.979** |

Storage add-on:

| System | Storage rate | Storage $/hr | Storage $/mo |
|---|---:|---:|---:|
| Turbopuffer | $0.33/GB-mo | $0.141 | $101.38 |
| Zilliz Tiered | $0.04/GB-mo | $0.017 | $12.29 |
| Zilliz Capacity | $0.025/GB-mo | $0.011 | $7.68 |

## 3. Queries + Storage + Writes

### 3.1 Steady 40 WPS Upserts

Adds recurring write cost for sustained `40 WPS` upserts. The namespace
stays at 100M rows.

| QPS | Turbopuffer | Tiered 4 CU | Tiered 8 CU | Capacity 12 CU | Capacity 16 CU |
|----:|------------:|------------:|------------:|---------------:|---------------:|
|   1 | **$1.216** | $1.505 | $2.993 | $2.987 | $3.979 |
| **3** ⭐ | $1.593 | **$1.505** ⭐ | $2.993 | $2.987 | $3.979 |
|   5 | $1.970 | **$1.505** | $2.993 | $2.987 | $3.979 |
|   8 | $2.535 | **$1.505** | $2.993 | $2.987 | $3.979 |
|  10 | $2.912 | **$1.505** | $2.993 | $2.987 | $3.979 |
|  57 | $11.765 | **$1.505** | $2.993 | $2.987 | $3.979 |
| 100 | $19.864 | - (max 58) | $2.993 | **$2.987** | $3.979 |
| 114 | $22.502 | - (max 58) | $2.993 | **$2.987** | $3.979 |
| 115 | $22.690 | - (max 58) | - (max 114) | **$2.987** | $3.979 |
| 400 | $76.374 | - | - | - (max 310) | **$3.979** |

Recurring write add-on:

| System | Write $/hr | Write $/mo |
|---|---:|---:|
| Turbopuffer, 40 WPS without batch discount | $0.887 | $638.67 |
| Zilliz Tiered / Capacity | $0.000 | $0.00 |

### 3.2 One-Time Bulk Load

One-time full-load write cost for inserting LAION 100M once.

Measured rows:

| System / mode | Time to ready | One-time write cost |
|---|---:|---:|
| Turbopuffer, batch=50,000, no backpressure | 8 h 7 min | **$308.00** |
| Zilliz Tiered 8 CU | 6 h 49 min | **$20.31** |
| Zilliz Capacity 16 CU | 5 h 15 min | **$20.87** |

## 4. Cost Model Analysis

### Dataset

```
docs = 100,000,000
dim = 768
storage_GB = docs * dim * 4 / 1e9 = 307.2 GB
write_GB = docs * (dim * 4 + 8-byte primary key) / 1e9 = 308.0 GB
```

### Turbopuffer

Query billing uses the f16-equivalent indexed size:

```
query_GB = docs * dim * 2 / 1e9 = 153.6 GB
effective_queried_GB = 32 + 96 * 0.2 + 25.6 * 0.04 = 52.224 GB
returned_cost_per_query = 100 results * 20 B/result * $0.05/GB
query_cost_per_query ~= $5.2324e-5
query_cost_per_hr = QPS * 3600 * query_cost_per_query
```

Storage:

```
storage_cost_per_hr = 307.2 GB * $0.33/GB-mo / 720 = $0.1408/hr
```

Writes:

```
bytes_per_write = 768 * 4 + 8 = 3,080 B
40_WPS_write_cost_hr = 40 * 3600 * 3,080 / 1e9 * $2/GB = $0.887/hr
bulk_batch_50k_write_cost = 308.0 GB * $2/GB * 50% = $308.00
steady_40_WPS_full_100M_cost = 308.0 GB * $2/GB = $616.00
```

### Zilliz Cloud

Compute:

```
Tiered 4 CU = 4 * $0.372/CU/hr = $1.488/hr
Tiered 8 CU = 8 * $0.372/CU/hr = $2.976/hr
Capacity 12 CU = 12 * $0.248/CU/hr = $2.976/hr
Capacity 16 CU = 16 * $0.248/CU/hr = $3.968/hr
```

Storage:

```
Tiered storage = 307.2 GB * $0.04/GB-mo / 720 = $0.0171/hr
Capacity storage = 307.2 GB * $0.025/GB-mo / 720 = $0.0107/hr
```

Writes:

```
Tiered 8 CU measured bulk write = 6.82 hr * $2.976/hr = $20.31
Capacity 16 CU measured bulk write = 5.26 hr * $3.968/hr = $20.87
Capacity 12 CU projected bulk write <= 6.25 hr * $2.976/hr = <=$18.60
```

Zilliz has no separate per-GB write meter in this model. Recurring writes
are included in the selected CU-hours unless the write workload requires
a larger cluster.

### Crossover Points

⭐ in the tables marks the first integer QPS where the cheapest Zilliz
option becomes cheaper than Turbopuffer for that cost view.

```
Turbopuffer query-only hourly = 0.1883664 * QPS
Tiered 4 CU query-only hourly = 1.488
query-only crossover = 1.488 / 0.1883664 = 7.99 QPS
first integer crossover = 8 QPS

Turbopuffer query+storage hourly = 0.1883664 * QPS + 0.1408
Tiered 4 CU query+storage hourly = 1.488 + 0.0170667 = 1.5050667
query+storage crossover = (1.5050667 - 0.1408) / 0.1883664 = 7.24 QPS
first integer crossover = 8 QPS

Turbopuffer query+storage+40WPS hourly =
  0.1883664 * QPS + 0.1408 + 0.88704
Tiered 4 CU query+storage+40WPS hourly = 1.5050667
query+storage+40WPS crossover =
  (1.5050667 - 0.1408 - 0.88704) / 0.1883664 = 2.53 QPS
first integer crossover = 3 QPS
```
