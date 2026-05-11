import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import verify_search_results


def write_raw(path: Path, run_id: str, db_label: str, payload: str = "ids_only") -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(
            {
                "run_id": run_id,
                "results": [
                    {
                        "metrics": {
                            "qps": 12.3456,
                            "serial_latency_p99": 0.22,
                            "serial_latency_p95": 0.11,
                            "recall": 0.951,
                            "ndcg": 0.9617,
                            "conc_num_list": [60, 80],
                            "conc_qps_list": [10.1234, 12.3456],
                            "conc_latency_p99_list": [0.9, 1.1],
                            "conc_latency_p95_list": [0.7, 0.8],
                            "conc_latency_avg_list": [0.5, 0.6],
                            "payload_profile": payload,
                            "payload_estimated_bytes_per_query": 2000,
                        },
                        "task_config": {
                            "db_config": {"db_label": db_label},
                            "case_config": {"custom_case": {"payload_profile": payload}},
                        },
                    }
                ],
            }
        )
    )


class VerifySearchResultsTest(unittest.TestCase):
    def test_verifies_manifest_raw_json_and_report_metrics(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            raw = root / "search/raw_results/zilliz_cloud_tiered_4cu/unfiltered/na/ids_only/concurrent_qps/result.json"
            write_raw(raw, "run-1", "label-1")
            (root / "search/raw_results/manifest.jsonl").parent.mkdir(parents=True, exist_ok=True)
            (root / "search/raw_results/manifest.jsonl").write_text(
                json.dumps(
                    {
                        "case_id": "zilliz_cloud_tiered_4cu__unfiltered__na__ids_only",
                        "product": "zilliz_cloud_tiered_4cu",
                        "filter_type": "unfiltered",
                        "selectivity": "na",
                        "payload_profile": "ids_only",
                        "phase": "concurrent_qps",
                        "raw_json": str(raw.relative_to(root)),
                        "run_id": "run-1",
                        "db_label": "label-1",
                    }
                )
                + "\n"
            )
            (root / "search/single_tenant_100m_search.md").write_text(
                """## Zilliz Cloud Tiered 4CU
### Unfiltered Search
| Payload | Serial JSON | Recall | NDCG | Concurrent JSON | QPS @60 | QPS @80 | Max QPS | Avg latency @60/@80 | P95 @60/@80 | P99 @60/@80 | Status |
|---|---|---:|---:|---|---:|---:|---:|---|---|---|---|
| IDs only | pending | pending | pending | `search/raw_results/zilliz_cloud_tiered_4cu/unfiltered/na/ids_only/concurrent_qps/result.json` | 10.1234 | 12.3456 | 12.3456 | 0.5000s / 0.6000s | 0.7000s / 0.8000s | 0.9000s / 1.1000s | measured |
"""
            )

            errors = verify_search_results.verify(root)

            self.assertEqual(errors, [])

    def test_reports_metric_mismatch(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            raw = root / "search/raw_results/zilliz_cloud_tiered_4cu/unfiltered/na/ids_only/concurrent_qps/result.json"
            write_raw(raw, "run-1", "label-1")
            (root / "search/raw_results/manifest.jsonl").parent.mkdir(parents=True, exist_ok=True)
            (root / "search/raw_results/manifest.jsonl").write_text(
                json.dumps(
                    {
                        "case_id": "zilliz_cloud_tiered_4cu__unfiltered__na__ids_only",
                        "product": "zilliz_cloud_tiered_4cu",
                        "filter_type": "unfiltered",
                        "selectivity": "na",
                        "payload_profile": "ids_only",
                        "phase": "concurrent_qps",
                        "raw_json": str(raw.relative_to(root)),
                        "run_id": "run-1",
                        "db_label": "label-1",
                    }
                )
                + "\n"
            )
            (root / "search/single_tenant_100m_search.md").write_text(
                """## Zilliz Cloud Tiered 4CU
### Unfiltered Search
| Payload | Serial JSON | Recall | NDCG | Concurrent JSON | QPS @60 | QPS @80 | Max QPS | Avg latency @60/@80 | P95 @60/@80 | P99 @60/@80 | Status |
|---|---|---:|---:|---|---:|---:|---:|---|---|---|---|
| IDs only | pending | pending | pending | `search/raw_results/zilliz_cloud_tiered_4cu/unfiltered/na/ids_only/concurrent_qps/result.json` | 99.0000 | 12.3456 | 12.3456 | 0.5000s / 0.6000s | 0.7000s / 0.8000s | 0.9000s / 1.1000s | measured |
"""
            )

            errors = verify_search_results.verify(root)

            self.assertTrue(any("QPS @60" in error for error in errors))


if __name__ == "__main__":
    unittest.main()
