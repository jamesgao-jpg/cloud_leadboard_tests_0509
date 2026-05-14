# Cloud Cold Latency

## Scope

LAION 100M, 768 dimensions, L2, topK 100, ids-only response payload, 1,000 serial queries per cold pass and 1,000 serial queries per warm pass.

## Results

| Product | Mode | Collection | First cold query (s) | Cold p99 (s) | Cold p95 (s) | Cold avg (s) | Warm p99 (s) | Warm p95 (s) | Warm avg (s) | Status |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Zilliz Cloud Capacity 12CU | Unfiltered | `LAION100M_capacity` | 0.1151 | 0.0228 | 0.0143 | 0.0115 | 0.0182 | 0.0137 | 0.0109 | Accepted |
| Zilliz Cloud Tiered 4CU | Unfiltered | `LAION100M` | 0.1222 | 0.4867 | 0.2108 | 0.0764 | 0.0655 | 0.0495 | 0.0279 | Rebench needed |

## Notes

- Capacity 12CU looks internally consistent: cold and warm averages are close, with the main cold penalty concentrated on the first query.
- Tiered 4CU is recorded in raw results, but flagged for rebench because its cold tail is much higher than warm and materially higher than capacity 12CU.
