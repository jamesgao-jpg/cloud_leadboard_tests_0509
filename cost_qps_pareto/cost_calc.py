"""
Cost-per-hour calculator for LAION 100M sustained search across
Turbopuffer, Zilliz Cloud Tiered, and Zilliz Cloud Capacity.

Uses measured Zilliz QPS ceilings for each tested CU size; it does not
extrapolate linearly past tested headroom. Turbopuffer cost is based on
bytes-queried per query (namespace size).

Usage:
    python cost_calc.py                # default QPS = 1, 10, 100
    python cost_calc.py 5 50 500       # custom QPS list
"""
import sys

# --- Turbopuffer pricing ---
TPUF_RETURNED_PER_GB = 0.05           # $/GB returned
TPUF_QUERIED_BASE_PER_PB = 1.00       # $/PB at full rate (0-32 GB/query)
TPUF_TIER2_DISCOUNT = 0.80            # 80% off for 32-128 GB/query marginal
TPUF_TIER3_DISCOUNT = 0.96            # 96% off for >128 GB/query marginal
TPUF_MIN_QUERIED_GB = 1.28            # floor per query

# --- Zilliz pricing ---
ZILLIZ_TIERED_PER_CU_HR = 0.372
ZILLIZ_CAPACITY_PER_CU_HR = 0.248

# --- Measured reference points on LAION 100M (k=100, no filter) ---
# Tiered 4 CU and 8 CU are index-version-10 reruns.
# Capacity 32 CU uses the interactive board's unfiltered ids_only payload ceiling.
ZILLIZ_CONFIGS = [
    ("Tiered 4 CU", 4, ZILLIZ_TIERED_PER_CU_HR, 57.97),
    ("Tiered 8 CU", 8, ZILLIZ_TIERED_PER_CU_HR, 114.37),
    ("Capacity 12 CU", 12, ZILLIZ_CAPACITY_PER_CU_HR, 310.47),
    ("Capacity 16 CU", 16, ZILLIZ_CAPACITY_PER_CU_HR, 405.6),
    ("Capacity 32 CU", 32, ZILLIZ_CAPACITY_PER_CU_HR, 786.0793),
]

# --- LAION 100M namespace size (as Turbopuffer's JS bills it) ---
# NOTE: TB's JS uses decimal GB (/1e9), not binary GiB (/1024**3).
# NOTE: queried-bytes uses dim_bytes = 2 (f16-equivalent index scan),
#       NOT physical f32 (4 B). Storage billing uses f32 separately.
DATASET_N = 100_000_000
DIM = 768
VEC_BYTES_QUERIED = 2  # TB bills queries on the quantized index (2 B/dim)
VEC_BYTES_STORED = 4   # f32 storage (for the (un-implemented) storage line)
ATTR_BYTES = 0         # LAION has no extra attributes beyond pk+vector
PK_BYTES = 8           # not counted by TB's n() helper
NAMESPACE_GB = DATASET_N * (ATTR_BYTES + DIM * VEC_BYTES_QUERIED) / 1e9

# --- Returned bytes per query (top-100 IDs + distances, ~20 B each) ---
RETURNED_BYTES_PER_QUERY = 100 * 20


def tpuf_cost_per_query(namespace_gb: float = NAMESPACE_GB,
                        returned_bytes: float = RETURNED_BYTES_PER_QUERY) -> float:
    """Turbopuffer: per-query cost based on bytes queried (namespace size)."""
    queried_gb = max(namespace_gb, TPUF_MIN_QUERIED_GB)

    # Tiered pricing on queried bytes (all in $/GB: $1/PB = $1e-6/GB)
    t1 = min(queried_gb, 32)
    t2 = min(max(queried_gb - 32, 0), 96)
    t3 = max(queried_gb - 128, 0)
    base_rate = TPUF_QUERIED_BASE_PER_PB / 1e6  # $/GB
    queried_cost = (
        t1 * base_rate
        + t2 * base_rate * (1 - TPUF_TIER2_DISCOUNT)
        + t3 * base_rate * (1 - TPUF_TIER3_DISCOUNT)
    )

    returned_cost = returned_bytes / 1e9 * TPUF_RETURNED_PER_GB
    return queried_cost + returned_cost


def tpuf_cost_per_hour(qps: float) -> float:
    return qps * 3600 * tpuf_cost_per_query()


def zilliz_reachable_options(qps: float) -> list[tuple[str, float, int]]:
    """Return measured Zilliz options that can serve qps: (name, $/hr, CU)."""
    options = []
    for name, cu, per_cu_hr, max_qps in ZILLIZ_CONFIGS:
        if qps <= max_qps:
            options.append((name, cu * per_cu_hr, cu))
    return options


def main():
    qps_list = [float(a) for a in sys.argv[1:]] or [1, 10, 100]

    print(f"LAION 100M namespace: {NAMESPACE_GB:.1f} GB")
    print(f"Turbopuffer per-query cost: ${tpuf_cost_per_query():.2e}")
    print("Zilliz measured ceilings:")
    for name, cu, per_cu_hr, max_qps in ZILLIZ_CONFIGS:
        print(f"  {name}: {max_qps:.2f} QPS at ${cu * per_cu_hr:.3f}/hr")
    print()

    header = f"{'QPS':>6} | {'Turbopuffer':>14} | {'Cheapest Zilliz':>30} | {'Cheapest':>18}"
    print(header)
    print("-" * len(header))

    for qps in qps_list:
        tp = tpuf_cost_per_hour(qps)
        z_options = zilliz_reachable_options(qps)
        if z_options:
            z_cost = min(o[1] for o in z_options)
            z_names = [name for name, cost, _ in z_options if cost == z_cost]
            z_name = " / ".join(z_names)
            z_cell = f"{z_name}: ${z_cost:.3f}/hr"
            cheapest = "Turbopuffer" if tp < z_cost else z_name
        else:
            z_cell = "not measured"
            cheapest = "Turbopuffer"
        print(f"{qps:>6.0f} | ${tp:>12.3f}/hr | {z_cell:>30} | {cheapest:>18}")


if __name__ == "__main__":
    main()
