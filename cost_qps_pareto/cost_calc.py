"""
Cost model calculator/generator for the cloud leaderboard.

Default usage keeps the original query-only comparison:
    python cost_calc.py
    python cost_calc.py 5 50 500

Generate the frontend cost model from checked-in raw result JSON:
    python cost_calc.py --emit-cost-model --root ..
    python cost_calc.py --check-cost-model ../cloudleadboard_data/cost_model.json --root ..
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys
from typing import Any


# --- Shared pricing/model constants ---
MONTHLY_HOURS = 730

SINGLE_RECORD_COUNT = 100_000_000
SINGLE_VECTOR_DATA_GB = 302
SINGLE_CONSTANT_WRITE_RPS = 4
SINGLE_BATCH_SIZE = 10_000

MULTI_RECORD_COUNT = 10_000_000
MULTI_VECTOR_DATA_GB = 30.2
MULTI_CONSTANT_WRITE_RPS = 0.4
MULTI_BATCH_SIZE = 10_000

DIM = 768
TOP_K = 100
RETURNED_BYTES_PER_QUERY = TOP_K * 20


# --- Turbopuffer pricing ---
TPUF_RETURNED_PER_GB = 0.05
TPUF_QUERIED_BASE_PER_PB = 1.00
TPUF_TIER2_DISCOUNT = 0.80
TPUF_TIER3_DISCOUNT = 0.96
TPUF_MIN_QUERIED_GB = 1.28
TPUF_STORAGE_USD_PER_GB_MONTH = 0.33
TPUF_WRITE_USD_PER_LOGICAL_GB = 2
TPUF_MIN_WRITE_KB_PER_REQUEST = 10
TPUF_BATCH_DISCOUNT_CAP = 0.5
TPUF_BATCH_DISCOUNT_CAP_KB = 3100
TPUF_PINNED_USD_PER_GB_HR = 0.013249
TPUF_PINNED_REPLICAS = 2


# --- Pinecone pricing ---
PINECONE_STORAGE_USD_PER_GB_MONTH = 0.33
PINECONE_READ_USD_PER_MILLION_RU = 16
PINECONE_WRITE_USD_PER_MILLION_WU = 4
PINECONE_WRITE_UNIT_BYTES = 1024
PINECONE_MIN_WRITE_UNITS_PER_REQUEST = 5
PINECONE_SINGLE_RU_PER_QUERY = 308
PINECONE_MULTI_RU_PER_QUERY = 0.25


# --- Zilliz pricing ---
ZILLIZ_TIERED_PER_CU_HR = 0.372
ZILLIZ_CAPACITY_PER_CU_HR = 0.248

# These storage rates intentionally match the current interactive JSON model.
ZILLIZ_TIERED_STORAGE_USD_PER_GB_MONTH = 0.025
ZILLIZ_CAPACITY_STORAGE_USD_PER_GB_MONTH = 0.04


# --- Product definitions. QPS and recall are read from raw results. ---
SINGLE_PAYLOAD = "ids_only"
MULTI_PAYLOAD = "ids_only"

SINGLE_ZILLIZ_CONFIGS = [
    ("Zilliz Cloud Tiered 4CU", "zilliz_cloud_tiered_4cu", 4, ZILLIZ_TIERED_PER_CU_HR, "tiered"),
    ("Zilliz Capacity 12CU", "zilliz_cloud_capacity_12cu", 12, ZILLIZ_CAPACITY_PER_CU_HR, "capacity"),
    ("Zilliz Capacity 32CU", "zilliz_cloud_capacity_32cu", 32, ZILLIZ_CAPACITY_PER_CU_HR, "capacity"),
]

MULTI_ZILLIZ_CONFIGS = [
    ("Zilliz Tiered 1CU", "zilliz_cloud_tiered_1cu", 1, ZILLIZ_TIERED_PER_CU_HR, "tiered"),
    ("Zilliz Capacity 2CU", "zilliz_cloud_capacity_2cu", 2, ZILLIZ_CAPACITY_PER_CU_HR, "capacity"),
]


def repo_root_from_script() -> Path:
    return Path(__file__).resolve().parents[1]


def round_cost(value: float, digits: int = 3) -> float:
    return round(value + 1e-12, digits)


def storage_cost_hr(vector_data_gb: float, usd_per_gb_month: float) -> float:
    return round_cost(vector_data_gb * usd_per_gb_month / MONTHLY_HOURS)


def tpuf_cost_per_query(
    namespace_gb: float,
    returned_bytes: float = RETURNED_BYTES_PER_QUERY,
) -> float:
    queried_gb = max(namespace_gb, TPUF_MIN_QUERIED_GB)
    t1 = min(queried_gb, 32)
    t2 = min(max(queried_gb - 32, 0), 96)
    t3 = max(queried_gb - 128, 0)
    base_rate = TPUF_QUERIED_BASE_PER_PB / 1e6
    queried_cost = (
        t1 * base_rate
        + t2 * base_rate * (1 - TPUF_TIER2_DISCOUNT)
        + t3 * base_rate * (1 - TPUF_TIER3_DISCOUNT)
    )
    returned_cost = returned_bytes / 1e9 * TPUF_RETURNED_PER_GB
    return queried_cost + returned_cost


def tpuf_cost_per_hour(qps: float, namespace_gb: float | None = None) -> float:
    if namespace_gb is None:
        namespace_gb = SINGLE_RECORD_COUNT * DIM * 2 / 1e9
    return qps * 3600 * tpuf_cost_per_query(namespace_gb)


def tpuf_single_search_cost_hr(qps: float) -> float:
    return round_cost(tpuf_cost_per_hour(qps))


def tpuf_multi_search_cost_hr(qps: float) -> float:
    value = tpuf_cost_per_hour(qps, namespace_gb=TPUF_MIN_QUERIED_GB)
    return round_cost(value, 2 if value >= 1 else 3)


def tpuf_pinned_search_cost_hr(vector_data_gb: float) -> float:
    return round_cost(vector_data_gb * TPUF_PINNED_REPLICAS * TPUF_PINNED_USD_PER_GB_HR)


def pinecone_search_cost_hr(qps: float, ru_per_query: float) -> float:
    return round_cost(qps * 3600 * ru_per_query / 1e6 * PINECONE_READ_USD_PER_MILLION_RU)


def zilliz_cost_hr(cu: int, per_cu_hr: float) -> float:
    return round_cost(cu * per_cu_hr)


def read_result_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text())


def result_metrics(path: Path) -> dict[str, Any]:
    data = read_result_json(path)
    return data["results"][0]["metrics"]


def best_raw_result(root: Path, relative_glob: str) -> Path:
    matches = sorted(root.glob(relative_glob))
    if not matches:
        raise FileNotFoundError(f"No raw result matched {relative_glob}")
    return matches[-1]


def raw_metrics(root: Path, suite: str, product: str, payload: str, phase: str) -> dict[str, Any]:
    path = best_raw_result(
        root,
        f"{suite}/raw_results/{product}/unfiltered/na/{payload}/{phase}/result_*.json",
    )
    return result_metrics(path)


def raw_max_qps(root: Path, product: str, payload: str, suite: str = "cloud_payload_search") -> float:
    metrics = raw_metrics(root, suite, product, payload, "concurrent_qps")
    return max([float(metrics.get("qps") or 0), *[float(v) for v in metrics.get("conc_qps_list", [])]])


def raw_recall(root: Path, product: str, payload: str, suite: str = "cloud_payload_search") -> float | None:
    try:
        metrics = raw_metrics(root, suite, product, payload, "serial_recall")
    except FileNotFoundError:
        return None
    recall = metrics.get("recall")
    return None if recall is None else float(recall)


def raw_endpoint_note(suite: str, product: str, payload: str, qps: float, recall: float | None) -> str:
    recall_text = "" if recall is None else f" and {recall:.4f} recall"
    return (
        f"Measured from {suite}/raw_results/{product}/unfiltered/na/{payload}; "
        f"raw result reports {qps:.4f} QPS{recall_text}."
    )


def point(
    product: str,
    qps: float,
    search_cost_hr: float,
    storage_cost_hr: float,
    recall: float | None,
    measured: bool,
    note: str | None = None,
) -> dict[str, Any]:
    row: dict[str, Any] = {
        "product": product,
        "qps": qps,
        "search_cost_hr": search_cost_hr,
        "storage_cost_hr": storage_cost_hr,
        "write_cost_hr": 0,
        "recall": recall,
        "measured": measured,
    }
    if note is not None:
        row["note"] = note
    return row


def build_sources() -> list[dict[str, str]]:
    return [
        {"name": "Zilliz Cloud pricing", "url": "https://zilliz.com/pricing"},
        {"name": "Zilliz Cloud list price", "url": "https://zilliz.com/pricing/pricing-guide"},
        {"name": "Turbopuffer pricing", "url": "https://turbopuffer.com/pricing"},
        {"name": "Turbopuffer pinning", "url": "https://turbopuffer.com/docs/pinning"},
        {"name": "Pinecone pricing", "url": "https://www.pinecone.io/pricing/"},
        {"name": "Pinecone cost documentation", "url": "https://docs.pinecone.io/guides/manage-cost/understanding-cost"},
    ]


def build_pricing() -> dict[str, Any]:
    return {
        "monthly_hours": MONTHLY_HOURS,
        "scenarios": {
            "single": {
                "record_count": SINGLE_RECORD_COUNT,
                "vector_data_gb": SINGLE_VECTOR_DATA_GB,
                "constant_write_requests_per_second": SINGLE_CONSTANT_WRITE_RPS,
                "batch_size_records": SINGLE_BATCH_SIZE,
            },
            "multi": {
                "record_count": MULTI_RECORD_COUNT,
                "vector_data_gb": MULTI_VECTOR_DATA_GB,
                "constant_write_requests_per_second": MULTI_CONSTANT_WRITE_RPS,
                "batch_size_records": MULTI_BATCH_SIZE,
            },
        },
        "turbopuffer": {
            "storage_usd_per_gb_month": TPUF_STORAGE_USD_PER_GB_MONTH,
            "write_usd_per_logical_gb": TPUF_WRITE_USD_PER_LOGICAL_GB,
            "min_write_kb_per_request": TPUF_MIN_WRITE_KB_PER_REQUEST,
            "batch_discount_cap": TPUF_BATCH_DISCOUNT_CAP,
            "batch_discount_cap_kb": TPUF_BATCH_DISCOUNT_CAP_KB,
        },
        "pinecone": {
            "storage_usd_per_gb_month": PINECONE_STORAGE_USD_PER_GB_MONTH,
            "read_usd_per_million_ru": PINECONE_READ_USD_PER_MILLION_RU,
            "write_usd_per_million_wu": PINECONE_WRITE_USD_PER_MILLION_WU,
            "write_unit_bytes": PINECONE_WRITE_UNIT_BYTES,
            "min_write_units_per_request": PINECONE_MIN_WRITE_UNITS_PER_REQUEST,
        },
        "zilliz": {
            "tiered_storage_usd_per_gb_month": ZILLIZ_TIERED_STORAGE_USD_PER_GB_MONTH,
            "capacity_storage_usd_per_gb_month": ZILLIZ_CAPACITY_STORAGE_USD_PER_GB_MONTH,
        },
    }


def build_single_points(root: Path) -> list[dict[str, Any]]:
    tb_storage = storage_cost_hr(SINGLE_VECTOR_DATA_GB, TPUF_STORAGE_USD_PER_GB_MONTH)
    zilliz_tiered_storage = storage_cost_hr(SINGLE_VECTOR_DATA_GB, ZILLIZ_TIERED_STORAGE_USD_PER_GB_MONTH)
    zilliz_capacity_storage = storage_cost_hr(SINGLE_VECTOR_DATA_GB, ZILLIZ_CAPACITY_STORAGE_USD_PER_GB_MONTH)
    pinecone_storage = storage_cost_hr(SINGLE_VECTOR_DATA_GB, PINECONE_STORAGE_USD_PER_GB_MONTH)

    rows: list[dict[str, Any]] = []

    tpuf_product = "turbopuffer_unpinned"
    tpuf_qps = raw_max_qps(root, tpuf_product, SINGLE_PAYLOAD)
    tpuf_recall = raw_recall(root, tpuf_product, SINGLE_PAYLOAD)
    rows.append(point(
        "Turbopuffer",
        tpuf_qps,
        tpuf_single_search_cost_hr(tpuf_qps),
        tb_storage,
        tpuf_recall,
        True,
        raw_endpoint_note("cloud_payload_search", tpuf_product, SINGLE_PAYLOAD, tpuf_qps, tpuf_recall),
    ))

    pinned_product = "turbopuffer_pinned"
    pinned_qps = raw_max_qps(root, pinned_product, SINGLE_PAYLOAD)
    pinned_recall = raw_recall(root, pinned_product, SINGLE_PAYLOAD)
    pinned_note = (
        "Published Turbopuffer pinned mode pricing model; search cost uses a 302 GB "
        "vector-only namespace, 2 replicas, and $0.013249/GB-hour pinning cost. "
        + raw_endpoint_note("cloud_payload_search", pinned_product, SINGLE_PAYLOAD, pinned_qps, pinned_recall)
    )
    pinned_cost = tpuf_pinned_search_cost_hr(SINGLE_VECTOR_DATA_GB)
    rows.append(point(
        "Turbopuffer Pinned Mode (2 replicas)",
        pinned_qps,
        pinned_cost,
        tb_storage,
        pinned_recall,
        True,
        pinned_note,
    ))

    for product_name, product_id, cu, per_cu_hr, family in SINGLE_ZILLIZ_CONFIGS:
        qps = raw_max_qps(root, product_id, SINGLE_PAYLOAD)
        recall = raw_recall(root, product_id, SINGLE_PAYLOAD)
        storage = zilliz_tiered_storage if family == "tiered" else zilliz_capacity_storage
        rows.append(point(
            product_name,
            qps,
            zilliz_cost_hr(cu, per_cu_hr),
            storage,
            recall,
            True,
            raw_endpoint_note("cloud_payload_search", product_id, SINGLE_PAYLOAD, qps, recall),
        ))

    pinecone_product = "pinecone_serverless"
    pinecone_qps = raw_max_qps(root, pinecone_product, SINGLE_PAYLOAD)
    pinecone_recall = raw_recall(root, pinecone_product, SINGLE_PAYLOAD)
    rows.append(point(
        "Pinecone Serverless",
        pinecone_qps,
        pinecone_search_cost_hr(pinecone_qps, PINECONE_SINGLE_RU_PER_QUERY),
        pinecone_storage,
        pinecone_recall,
        True,
        "Published Pinecone serverless pricing model; search cost uses 308 RU/query at $16/M RU. "
        + raw_endpoint_note("cloud_payload_search", pinecone_product, SINGLE_PAYLOAD, pinecone_qps, pinecone_recall),
    ))
    return rows


def build_multi_points(root: Path) -> list[dict[str, Any]]:
    tb_storage = storage_cost_hr(MULTI_VECTOR_DATA_GB, TPUF_STORAGE_USD_PER_GB_MONTH)
    zilliz_tiered_storage = storage_cost_hr(MULTI_VECTOR_DATA_GB, ZILLIZ_TIERED_STORAGE_USD_PER_GB_MONTH)
    zilliz_capacity_storage = storage_cost_hr(MULTI_VECTOR_DATA_GB, ZILLIZ_CAPACITY_STORAGE_USD_PER_GB_MONTH)
    pinecone_storage = storage_cost_hr(MULTI_VECTOR_DATA_GB, PINECONE_STORAGE_USD_PER_GB_MONTH)

    rows: list[dict[str, Any]] = []

    tpuf_product = "turbopuffer"
    tpuf_qps = raw_max_qps(root, tpuf_product, MULTI_PAYLOAD, suite="cloud_multi_tenant_search")
    tpuf_recall = raw_recall(root, tpuf_product, MULTI_PAYLOAD, suite="cloud_multi_tenant_search")
    rows.append(point(
        "Turbopuffer",
        tpuf_qps,
        tpuf_multi_search_cost_hr(tpuf_qps),
        tb_storage,
        tpuf_recall,
        True,
        raw_endpoint_note("cloud_multi_tenant_search", tpuf_product, MULTI_PAYLOAD, tpuf_qps, tpuf_recall),
    ))

    for product_name, product_id, cu, per_cu_hr, family in MULTI_ZILLIZ_CONFIGS:
        qps = raw_max_qps(root, product_id, MULTI_PAYLOAD, suite="cloud_multi_tenant_search")
        recall = raw_recall(root, product_id, MULTI_PAYLOAD, suite="cloud_multi_tenant_search")
        storage = zilliz_tiered_storage if family == "tiered" else zilliz_capacity_storage
        rows.append(point(
            product_name,
            qps,
            zilliz_cost_hr(cu, per_cu_hr),
            storage,
            recall,
            True,
            raw_endpoint_note("cloud_multi_tenant_search", product_id, MULTI_PAYLOAD, qps, recall),
        ))

    pinecone_product = "pinecone_serverless"
    pinecone_qps = raw_max_qps(root, pinecone_product, MULTI_PAYLOAD, suite="cloud_multi_tenant_search")
    pinecone_recall = raw_recall(root, pinecone_product, MULTI_PAYLOAD, suite="cloud_multi_tenant_search")
    rows.append(point(
        "Pinecone Serverless",
        pinecone_qps,
        pinecone_search_cost_hr(pinecone_qps, PINECONE_MULTI_RU_PER_QUERY),
        pinecone_storage,
        pinecone_recall,
        True,
        "Published Pinecone serverless pricing model; search cost uses the 0.25 RU/query minimum at $16/M RU. "
        + raw_endpoint_note("cloud_multi_tenant_search", pinecone_product, MULTI_PAYLOAD, pinecone_qps, pinecone_recall),
    ))
    return rows


def build_cost_model(root: str | Path | None = None) -> dict[str, Any]:
    root_path = Path(root) if root is not None else repo_root_from_script()
    return {
        "sources": build_sources(),
        "modes": [
            {"id": "search", "label": "Query only"},
            {"id": "search_storage", "label": "Query + storage"},
            {"id": "full", "label": "Query + storage + write"},
        ],
        "pricing": build_pricing(),
        "scenarios": {
            "single": {
                "label": "Single tenant LAION 100M",
                "x_label": "Sustained QPS",
                "points": build_single_points(root_path),
            },
            "multi": {
                "label": "Multitenant Cohere 10M",
                "x_label": "Aggregate QPS",
                "points": build_multi_points(root_path),
            },
        },
    }


def product_cost_family(product: str) -> str:
    lower = product.lower()
    if "zilliz" in lower:
        return "zilliz"
    if "pinecone" in lower:
        return "pinecone"
    if "turbo" in lower:
        return "turbopuffer"
    return "other"


def scenario_write_shape(model: dict[str, Any], scenario_id: str, write_mode: str) -> dict[str, float] | None:
    scenario = model.get("pricing", {}).get("scenarios", {}).get(scenario_id, {})
    record_count = float(scenario.get("record_count") or 0)
    vector_data_gb = float(scenario.get("vector_data_gb") or 0)
    monthly_hours = float(model.get("pricing", {}).get("monthly_hours") or MONTHLY_HOURS)
    if not record_count or not vector_data_gb or not monthly_hours:
        return None
    seconds_per_month = monthly_hours * 3600
    constant_rps = float(scenario.get("constant_write_requests_per_second") or 0)
    batch_size = float(scenario.get("batch_size_records") or 0)
    records_per_request = batch_size if write_mode == "batch" and batch_size > 0 else record_count / max(1, constant_rps * seconds_per_month)
    requests_per_month = record_count / max(1, records_per_request)
    bytes_per_record = (vector_data_gb * 1e9) / record_count
    return {
        "record_count": record_count,
        "vector_data_gb": vector_data_gb,
        "records_per_request": records_per_request,
        "requests_per_month": requests_per_month,
        "request_bytes": records_per_request * bytes_per_record,
        "monthly_hours": monthly_hours,
    }


def turbopuffer_batch_discount(request_kb: float, model: dict[str, Any]) -> float:
    if request_kb <= 0:
        return 0
    pricing = model.get("pricing", {}).get("turbopuffer", {})
    cap = float(pricing.get("batch_discount_cap", TPUF_BATCH_DISCOUNT_CAP))
    # Mirrors the browser calculator: log-scale discount capped at 50%.
    import math
    return max(0, min(cap, (math.log10(request_kb) - 1) * 0.2))


def computed_write_cost_hr(
    model: dict[str, Any],
    row: dict[str, Any],
    scenario_id: str,
    write_mode: str = "constant",
) -> float:
    family = product_cost_family(row["product"])
    if family == "zilliz":
        return 0
    shape = scenario_write_shape(model, scenario_id, write_mode)
    if not shape:
        return float(row.get("write_cost_hr") or 0)
    if family == "turbopuffer":
        pricing = model.get("pricing", {}).get("turbopuffer", {})
        min_kb = float(pricing.get("min_write_kb_per_request", TPUF_MIN_WRITE_KB_PER_REQUEST))
        price_per_gb = float(pricing.get("write_usd_per_logical_gb", TPUF_WRITE_USD_PER_LOGICAL_GB))
        request_kb = shape["request_bytes"] / 1000
        billable_kb = max(request_kb, min_kb)
        discount = turbopuffer_batch_discount(billable_kb, model)
        billable_gb_month = (shape["requests_per_month"] * billable_kb * (1 - discount)) / 1e6
        return (billable_gb_month * price_per_gb) / shape["monthly_hours"]
    if family == "pinecone":
        pricing = model.get("pricing", {}).get("pinecone", {})
        import math
        unit_bytes = float(pricing.get("write_unit_bytes", PINECONE_WRITE_UNIT_BYTES))
        min_wu = float(pricing.get("min_write_units_per_request", PINECONE_MIN_WRITE_UNITS_PER_REQUEST))
        price_per_million = float(pricing.get("write_usd_per_million_wu", PINECONE_WRITE_USD_PER_MILLION_WU))
        wu_per_request = max(math.ceil(shape["request_bytes"] / unit_bytes), min_wu)
        wu_month = shape["requests_per_month"] * wu_per_request
        return (wu_month / 1e6 * price_per_million) / shape["monthly_hours"]
    return float(row.get("write_cost_hr") or 0)


def point_cost(
    model: dict[str, Any],
    row: dict[str, Any],
    mode: str = "search",
    scenario_id: str = "single",
    write_mode: str = "constant",
) -> float:
    cost = float(row["search_cost_hr"])
    if mode in {"search_storage", "full"}:
        cost += float(row.get("storage_cost_hr") or 0)
    if mode == "full":
        cost += computed_write_cost_hr(model, row, scenario_id, write_mode)
    return cost


def zilliz_reachable_options(qps: float, root: str | Path | None = None) -> list[tuple[str, float, int]]:
    root_path = Path(root) if root is not None else repo_root_from_script()
    options = []
    for name, product_id, cu, per_cu_hr, _family in SINGLE_ZILLIZ_CONFIGS:
        max_qps = raw_max_qps(root_path, product_id, SINGLE_PAYLOAD)
        if qps <= max_qps:
            options.append((name, cu * per_cu_hr, cu))
    return options


def print_query_only_table(qps_list: list[float], root: str | Path | None = None) -> None:
    root_path = Path(root) if root is not None else repo_root_from_script()
    namespace_gb = SINGLE_RECORD_COUNT * DIM * 2 / 1e9
    print(f"LAION 100M namespace: {namespace_gb:.1f} GB")
    print(f"Turbopuffer per-query cost: ${tpuf_cost_per_query(namespace_gb):.2e}")
    print("Zilliz measured ceilings:")
    for name, product_id, cu, per_cu_hr, _family in SINGLE_ZILLIZ_CONFIGS:
        max_qps = raw_max_qps(root_path, product_id, SINGLE_PAYLOAD)
        print(f"  {name}: {max_qps:.2f} QPS at ${cu * per_cu_hr:.3f}/hr")
    print()

    header = f"{'QPS':>6} | {'Turbopuffer':>14} | {'Cheapest Zilliz':>30} | {'Cheapest':>18}"
    print(header)
    print("-" * len(header))
    for qps in qps_list:
        tp = tpuf_cost_per_hour(qps, namespace_gb)
        z_options = zilliz_reachable_options(qps, root_path)
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


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("qps", nargs="*", type=float, help="QPS targets for the legacy query-only comparison")
    parser.add_argument("--root", type=Path, default=repo_root_from_script(), help="Repo root containing raw result JSON inputs")
    parser.add_argument("--emit-cost-model", action="store_true", help="Print generated cost_model.json to stdout")
    parser.add_argument("--check-cost-model", type=Path, help="Compare generated cost model against a JSON file")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(sys.argv[1:] if argv is None else argv)
    if args.emit_cost_model or args.check_cost_model:
        generated = build_cost_model(args.root)
        if args.check_cost_model:
            expected = json.loads(args.check_cost_model.read_text())
            if generated != expected:
                print(f"Generated model differs from {args.check_cost_model}", file=sys.stderr)
                return 1
            print(f"Generated model matches {args.check_cost_model}")
            return 0
        print(json.dumps(generated, indent=2))
        return 0

    print_query_only_table(args.qps or [1, 10, 100], args.root)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
