#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


PRODUCTS = {
    "Zilliz Cloud Tiered 4CU": "zilliz_cloud_tiered_4cu",
    "Zilliz Cloud Capacity 12CU": "zilliz_cloud_capacity_12cu",
    "Pinecone Serverless": "pinecone_serverless",
    "Turbopuffer Unpinned": "turbopuffer_unpinned",
    "Turbopuffer Pinned": "turbopuffer_pinned",
}
FILTER_TYPES = {
    "Unfiltered Search": "unfiltered",
    "Integer Filtered Search": "int_filter",
    "Scalar Label Filtered Search": "scalar_label_filter",
}
PAYLOADS = {
    "IDs only": "ids_only",
    "ids only": "ids_only",
    "scalar label": "scalar_label",
    "vector": "vector",
}
PENDING = {"", "TBD", "pending"}


@dataclass
class ReportEntry:
    case_id: str
    phase: str
    raw_json: str
    fields: dict[str, str] = field(default_factory=dict)


def clean_cell(cell: str) -> str:
    cell = cell.strip()
    if cell.startswith("`") and cell.endswith("`"):
        cell = cell[1:-1]
    return cell.strip()


def is_pending(value: str) -> bool:
    return clean_cell(value) in PENDING


def selectivity_id(value: str) -> str:
    value = clean_cell(value)
    if value in {"", "TBD", "other"}:
        return value
    value = value.strip("%")
    if "." in value:
        value = value.rstrip("0").rstrip(".").replace(".", "_")
    return f"{value}p"


def split_row(line: str) -> list[str]:
    return [clean_cell(part) for part in line.strip().strip("|").split("|")]


def parse_report(root: Path) -> dict[tuple[str, str], ReportEntry]:
    path = root / "search/single_tenant_100m_search.md"
    lines = path.read_text().splitlines()
    product: str | None = None
    filter_type: str | None = None
    entries: dict[tuple[str, str], ReportEntry] = {}
    i = 0
    while i < len(lines):
        line = lines[i]
        if line.startswith("## "):
            title = line.removeprefix("## ").strip()
            product = PRODUCTS.get(title)
            filter_type = None
            i += 1
            continue
        if line.startswith("### "):
            title = line.removeprefix("### ").strip()
            filter_type = FILTER_TYPES.get(title)
            i += 1
            continue
        if not (product and filter_type and line.startswith("|") and i + 1 < len(lines) and lines[i + 1].startswith("|---")):
            i += 1
            continue

        header = split_row(line)
        i += 2
        while i < len(lines) and lines[i].startswith("|"):
            row = split_row(lines[i])
            i += 1
            if len(row) != len(header):
                continue
            data = dict(zip(header, row))
            payload = PAYLOADS.get(data.get("Payload", ""))
            if not payload:
                continue
            selectivity = "na" if filter_type == "unfiltered" else selectivity_id(data.get("Selectivity", ""))
            if selectivity in {"", "TBD", "other"}:
                continue
            case_id = f"{product}__{filter_type}__{selectivity}__{payload}"

            serial_path = data.get("Serial JSON", "")
            if serial_path and not is_pending(serial_path):
                entries[(case_id, "serial_recall")] = ReportEntry(
                    case_id=case_id,
                    phase="serial_recall",
                    raw_json=serial_path,
                    fields={k: data[k] for k in ("Recall", "NDCG") if k in data},
                )

            concurrent_path = data.get("Concurrent JSON", "")
            if concurrent_path and not is_pending(concurrent_path):
                fields = {
                    key: data[key]
                    for key in (
                        "QPS @60",
                        "QPS @80",
                        "Max QPS",
                        "Avg latency @60/@80",
                        "P95 @60/@80",
                        "P99 @60/@80",
                        "Payload bytes/query",
                    )
                    if key in data
                }
                entries[(case_id, "concurrent_qps")] = ReportEntry(
                    case_id=case_id,
                    phase="concurrent_qps",
                    raw_json=concurrent_path,
                    fields=fields,
                )
    return entries


def load_manifest(root: Path) -> dict[tuple[str, str], dict[str, Any]]:
    manifest = root / "search/raw_results/manifest.jsonl"
    entries: dict[tuple[str, str], dict[str, Any]] = {}
    for lineno, line in enumerate(manifest.read_text().splitlines(), 1):
        if not line.strip():
            continue
        item = json.loads(line)
        key = (item["case_id"], item["phase"])
        if key in entries:
            raise ValueError(f"duplicate manifest key at line {lineno}: {key}")
        entries[key] = item
    return entries


def metric(raw: dict[str, Any]) -> dict[str, Any]:
    return raw["results"][0]["metrics"]


def same_display(raw_value: float, shown: str) -> bool:
    shown = clean_cell(shown).rstrip("s")
    if shown in PENDING:
        return True
    if not re.fullmatch(r"-?\d+(?:\.\d+)?", shown):
        return False
    places = len(shown.split(".", 1)[1]) if "." in shown else 0
    return f"{float(raw_value):.{places}f}" == shown


def split_pair(value: str) -> list[str]:
    return [part.strip() for part in clean_cell(value).split("/")]


def compare_float(errors: list[str], label: str, raw_value: float, shown: str) -> None:
    if not same_display(raw_value, shown):
        errors.append(f"{label}: report={shown}, raw={raw_value}")


def compare_pair(errors: list[str], label: str, raw_values: list[float], shown: str) -> None:
    parts = split_pair(shown)
    if len(parts) != 2:
        errors.append(f"{label}: report pair is malformed: {shown}")
        return
    for idx, (raw_value, shown_value) in enumerate(zip(raw_values, parts), 1):
        if not same_display(raw_value, shown_value):
            errors.append(f"{label}[{idx}]: report={shown_value}, raw={raw_value}")


def compare_payload_bytes(errors: list[str], raw_value: int, shown: str) -> None:
    if is_pending(shown):
        return
    normalized = clean_cell(shown).replace(",", "")
    if not normalized.isdigit() or int(normalized) != int(raw_value):
        errors.append(f"Payload bytes/query: report={shown}, raw={raw_value}")


def validate_raw_and_manifest(root: Path, manifest: dict[tuple[str, str], dict[str, Any]]) -> dict[tuple[str, str], dict[str, Any]]:
    raw_by_key: dict[tuple[str, str], dict[str, Any]] = {}
    for key, item in manifest.items():
        raw_path = root / item["raw_json"]
        if not raw_path.exists():
            raise FileNotFoundError(f"{key}: missing raw JSON {item['raw_json']}")
        raw = json.loads(raw_path.read_text())
        if raw.get("run_id") != item["run_id"]:
            raise ValueError(f"{key}: manifest run_id does not match raw JSON")
        db_label = raw["results"][0]["task_config"]["db_config"]["db_label"]
        if db_label != item["db_label"]:
            raise ValueError(f"{key}: manifest db_label does not match raw JSON")
        payload = metric(raw).get("payload_profile")
        if payload != item["payload_profile"]:
            raise ValueError(f"{key}: manifest payload_profile={item['payload_profile']} raw={payload}")
        raw_by_key[key] = raw
    return raw_by_key


def compare_report_to_raw(
    report: dict[tuple[str, str], ReportEntry],
    manifest: dict[tuple[str, str], dict[str, Any]],
    raw_by_key: dict[tuple[str, str], dict[str, Any]],
) -> list[str]:
    errors: list[str] = []
    for key, item in manifest.items():
        entry = report.get(key)
        if not entry:
            errors.append(f"{key}: manifest raw JSON is not referenced by report")
            continue
        if entry.raw_json != item["raw_json"]:
            errors.append(f"{key}: report raw_json={entry.raw_json}, manifest raw_json={item['raw_json']}")
            continue
        m = metric(raw_by_key[key])
        prefix = f"{key}"
        if key[1] == "serial_recall":
            if "Recall" in entry.fields:
                compare_float(errors, f"{prefix} Recall", m["recall"], entry.fields["Recall"])
            if "NDCG" in entry.fields:
                compare_float(errors, f"{prefix} NDCG", m["ndcg"], entry.fields["NDCG"])
        elif key[1] == "concurrent_qps":
            if "QPS @60" in entry.fields:
                compare_float(errors, f"{prefix} QPS @60", m["conc_qps_list"][0], entry.fields["QPS @60"])
            if "QPS @80" in entry.fields:
                compare_float(errors, f"{prefix} QPS @80", m["conc_qps_list"][1], entry.fields["QPS @80"])
            if "Max QPS" in entry.fields:
                compare_float(errors, f"{prefix} Max QPS", m["qps"], entry.fields["Max QPS"])
            if "Avg latency @60/@80" in entry.fields:
                compare_pair(errors, f"{prefix} Avg latency @60/@80", m["conc_latency_avg_list"], entry.fields["Avg latency @60/@80"])
            if "P95 @60/@80" in entry.fields:
                compare_pair(errors, f"{prefix} P95 @60/@80", m["conc_latency_p95_list"], entry.fields["P95 @60/@80"])
            if "P99 @60/@80" in entry.fields:
                compare_pair(errors, f"{prefix} P99 @60/@80", m["conc_latency_p99_list"], entry.fields["P99 @60/@80"])
            if "Payload bytes/query" in entry.fields:
                compare_payload_bytes(errors, m["payload_estimated_bytes_per_query"], entry.fields["Payload bytes/query"])

    for key, entry in report.items():
        if key not in manifest:
            errors.append(f"{key}: report references raw JSON not present in manifest: {entry.raw_json}")
    return errors


def verify(root: Path) -> list[str]:
    manifest = load_manifest(root)
    report = parse_report(root)
    raw_by_key = validate_raw_and_manifest(root, manifest)
    return compare_report_to_raw(report, manifest, raw_by_key)


def main() -> int:
    root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path.cwd()
    try:
        errors = verify(root)
    except Exception as exc:
        print(f"verification setup failed: {exc}", file=sys.stderr)
        return 2
    if errors:
        for error in errors:
            print(error, file=sys.stderr)
        return 1
    print("search raw results verification passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
