import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import unittest


REPO_ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = REPO_ROOT / "cost_qps_pareto" / "cost_calc.py"


spec = importlib.util.spec_from_file_location("cost_calc", MODULE_PATH)
cost_calc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cost_calc)


class CostModelGenerationTest(unittest.TestCase):
    def point_by_product(self, model, scenario_id, product):
        matches = [point for point in model["scenarios"][scenario_id]["points"] if point["product"] == product]
        self.assertEqual(len(matches), 1, product)
        return matches[0]

    def test_build_cost_model_matches_checked_in_model(self):
        expected = json.loads((REPO_ROOT / "cloudleadboard_data" / "cost_model.json").read_text())

        generated = cost_calc.build_cost_model(REPO_ROOT)

        self.assertEqual(generated, expected)

    def test_build_cost_model_uses_current_single_tenant_raw_endpoints(self):
        model = cost_calc.build_cost_model(REPO_ROOT)

        turbopuffer = self.point_by_product(model, "single", "Turbopuffer")
        self.assertEqual(turbopuffer["qps"], 395.6972)
        self.assertEqual(turbopuffer["search_cost_hr"], cost_calc.round_cost(cost_calc.tpuf_cost_per_hour(395.6972)))
        self.assertEqual(turbopuffer["recall"], 0.9321)

        pinned = self.point_by_product(model, "single", "Turbopuffer Pinned Mode (2 replicas)")
        self.assertEqual(pinned["qps"], 68.1714)
        self.assertEqual(pinned["recall"], 0.9321)

        tiered = self.point_by_product(model, "single", "Zilliz Cloud Tiered 4CU")
        self.assertEqual(tiered["qps"], 49.1625)
        self.assertEqual(tiered["recall"], 0.951)

        capacity_12 = self.point_by_product(model, "single", "Zilliz Capacity 12CU")
        self.assertEqual(capacity_12["qps"], 376.007)
        self.assertEqual(capacity_12["recall"], 0.9723)

        capacity_32 = self.point_by_product(model, "single", "Zilliz Capacity 32CU")
        self.assertEqual(capacity_32["qps"], 786.0793)
        self.assertEqual(capacity_32["recall"], 0.9728)

        pinecone = self.point_by_product(model, "single", "Pinecone Serverless")
        self.assertEqual(pinecone["qps"], 4.5642)
        self.assertEqual(pinecone["recall"], 0.9609)
        self.assertTrue(pinecone["measured"])

    def test_build_cost_model_uses_current_multi_tenant_raw_endpoints(self):
        model = cost_calc.build_cost_model(REPO_ROOT)

        turbopuffer = self.point_by_product(model, "multi", "Turbopuffer")
        self.assertEqual(turbopuffer["qps"], 3854.5229)
        self.assertEqual(turbopuffer["search_cost_hr"], cost_calc.tpuf_multi_search_cost_hr(3854.5229))

        tiered = self.point_by_product(model, "multi", "Zilliz Tiered 1CU")
        self.assertEqual(tiered["qps"], 481.1791)

        capacity = self.point_by_product(model, "multi", "Zilliz Capacity 2CU")
        self.assertEqual(capacity["qps"], 889.2759)

        pinecone = self.point_by_product(model, "multi", "Pinecone Serverless")
        self.assertEqual(pinecone["qps"], 568.9403)
        self.assertTrue(pinecone["measured"])

    def test_build_cost_model_does_not_emit_compatibility_anchor_points(self):
        model = cost_calc.build_cost_model(REPO_ROOT)

        single_points = model["scenarios"]["single"]["points"]
        self.assertNotIn(
            ("Turbopuffer", 400),
            {(point["product"], point["qps"]) for point in single_points},
        )
        self.assertNotIn(
            ("Turbopuffer", 16),
            {(point["product"], point["qps"]) for point in single_points},
        )
        self.assertNotIn(
            ("Zilliz Cloud Tiered 4CU", 57.97),
            {(point["product"], point["qps"]) for point in single_points},
        )
        self.assertNotIn(
            ("Zilliz Capacity 12CU", 310.47),
            {(point["product"], point["qps"]) for point in single_points},
        )

    def test_cli_check_cost_model_matches_checked_in_model(self):
        result = subprocess.run(
            [
                sys.executable,
                str(MODULE_PATH),
                "--root",
                str(REPO_ROOT),
                "--check-cost-model",
                str(REPO_ROOT / "cloudleadboard_data" / "cost_model.json"),
            ],
            check=False,
            text=True,
            capture_output=True,
        )

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("Generated model matches", result.stdout)

    def test_point_cost_matches_frontend_storage_and_write_modes(self):
        model = cost_calc.build_cost_model(REPO_ROOT)
        single_points = model["scenarios"]["single"]["points"]
        turbopuffer = next(point for point in single_points if point["product"] == "Turbopuffer")
        pinecone = next(point for point in single_points if point["product"] == "Pinecone Serverless")
        zilliz_32 = next(point for point in single_points if point["product"] == "Zilliz Capacity 32CU")

        self.assertAlmostEqual(
            cost_calc.point_cost(model, turbopuffer, "search_storage", "single"),
            turbopuffer["search_cost_hr"] + 0.137,
        )
        self.assertAlmostEqual(
            cost_calc.point_cost(model, turbopuffer, "full", "single", "constant"),
            turbopuffer["search_cost_hr"] + 0.137 + 0.7515544545731965,
        )
        self.assertAlmostEqual(
            cost_calc.point_cost(model, turbopuffer, "full", "single", "batch"),
            turbopuffer["search_cost_hr"] + 0.137 + 0.4136986301369863,
        )

        self.assertAlmostEqual(
            cost_calc.point_cost(model, pinecone, "full", "single", "constant"),
            pinecone["search_cost_hr"] + 0.137 + 1.6704,
        )
        self.assertAlmostEqual(
            cost_calc.point_cost(model, pinecone, "full", "single", "batch"),
            pinecone["search_cost_hr"] + 0.137 + 1.6160547945205478,
        )

        self.assertAlmostEqual(cost_calc.point_cost(model, zilliz_32, "full", "single", "constant"), 7.953)


if __name__ == "__main__":
    unittest.main()
