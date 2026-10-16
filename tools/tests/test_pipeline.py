"""Tests for the data pipeline. Run from the repo root:

    python3 -m unittest discover -s tools/tests -v

Each test copies the real data/*.csv into a temporary folder, breaks one thing,
and checks that the export reports it. Nothing in data/ or web/data/ is changed."""

import csv
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from pipeline import export  # noqa: E402
from pipeline.io import DATA  # noqa: E402
from pipeline.parse import iso_date, numbers, split_ids, split_list  # noqa: E402


class Parse(unittest.TestCase):
    def test_iso_date(self):
        self.assertEqual(iso_date("2026-09-29"), "2026-09-29")
        self.assertIsNone(iso_date("Not yet verified"))
        self.assertIsNone(iso_date("2026-02-30"))

    def test_split_list(self):
        self.assertEqual(split_list("A / B (confirm)"), (["A", "B"], True))
        self.assertEqual(split_list(""), ([], False))

    def test_ids_and_numbers(self):
        self.assertEqual(split_ids("SRC-01, SRC-12 and PRJ-02", "SRC"), ["SRC-01", "SRC-12"])
        self.assertEqual(numbers("4 / 15 (confirm)"), [4, 15])


class Export(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        for f in DATA.glob("*.csv"):
            shutil.copy(f, self.tmp / f.name)

    def tearDown(self):
        shutil.rmtree(self.tmp)

    def edit(self, name, change):
        """Apply change(rows) to tmp/<name>.csv."""
        path = self.tmp / f"{name}.csv"
        with path.open(encoding="utf-8-sig", newline="") as f:
            reader = csv.DictReader(f)
            fields, rows = reader.fieldnames, list(reader)
        change(rows)
        with path.open("w", encoding="utf-8", newline="") as f:
            w = csv.DictWriter(f, fieldnames=fields)
            w.writeheader()
            w.writerows(rows)

    def run_export(self):
        return export(data_dir=self.tmp, write=False)

    def assertError(self, text):
        rep, _ = self.run_export()
        self.assertTrue(any(text in e for e in rep.errors), f"expected an error containing {text!r}, got {rep.errors}")

    def test_real_data_is_clean(self):
        rep, t = self.run_export()
        self.assertEqual(rep.errors, [])
        self.assertTrue(t["hotspots"])
        for h in t["hotspots"]:
            self.assertTrue(h["area_id"], h["id"])
            self.assertIn(h["type"], {"outfall", "nalla", "dumping", "weir"})
        live = [a for a in t["areas"] if a["hotspot_count"]]
        self.assertTrue(all(a["bounds"] for a in live))

    def test_duplicate_hotspot_id(self):
        self.edit("hotspots", lambda rows: rows.append(dict(rows[0])))
        self.assertError("appears twice")

    def test_unknown_source(self):
        def change(rows):
            rows[0]["Source IDs"] = "SRC-999"
        self.edit("routing_rules", change)
        self.assertError("SRC-999")

    def test_point_outside_pune(self):
        def change(rows):
            rows[0]["Latitude"], rows[0]["Longitude"] = "73.951499", "18.546297"   # swapped
        self.edit("hotspots", change)
        self.assertError("outside the Pune area")

    def test_hotspot_without_area(self):
        def change(rows):
            rows[0]["Prabhag"] = "40"
        self.edit("hotspots", change)
        self.assertError("is in no area")

    def test_prabhag_in_two_areas(self):
        def change(rows):
            rows[1]["Prabhags"] = rows[1]["Prabhags"] + " / 4"
        self.edit("areas", change)
        self.assertError("prabhag 4 is in both")

    def test_bad_type(self):
        def change(rows):
            rows[0]["Type"] = "drain"
        self.edit("hotspots", change)
        self.assertError("has type 'drain'")

    def test_escalation_steps_keep_numbers_in_brackets(self):
        rep, t = self.run_export()
        froth = next(r for r in t["routing"] if r["problem_type"] == "Froth or foam at the weir")
        self.assertEqual(froth["escalate"][-1], "RTI for water-quality readings at Mundhwa Bridge (station 2192)")
        fish = next(r for r in t["routing"] if r["problem_type"] == "Dead fish")
        self.assertTrue(fish["escalate"][0].endswith("(OA 214/2024)"), fish["escalate"])

    # ---- comparison sites (Alandi) -------------------------------------------------

    def test_comparison_sites_link_only_to_their_own_offices(self):
        rep, t = self.run_export()
        cs = [h for h in t["hotspots"] if h["id"].startswith("CS-")]
        self.assertTrue(cs)
        for h in cs:
            self.assertTrue(all(a.startswith("CA-") for a in h["authority_ids"]), h)
            self.assertTrue(h["first_contact_id"].startswith("CA-"), h)
            self.assertIsNone(h["problem_type"])
        hs = [h for h in t["hotspots"] if h["id"].startswith("HS-")]
        self.assertTrue(all(a.startswith("AU-") for h in hs for a in h["authority_ids"]))

    def test_comparison_site_unknown_first_contact(self):
        def change(rows):
            rows[0]["First Contact (Authority ID)"] = "CA-99"
        self.edit("comparison_sites", change)
        self.assertError("first contact CA-99")

    def test_comparison_site_unknown_area(self):
        def change(rows):
            rows[0]["Area"] = "AREA-99"
        self.edit("comparison_sites", change)
        self.assertError("names area AREA-99")

    def test_general_authority_must_exist(self):
        def change(rows):
            rows[2]["General Authorities"] = "CA-01 / CA-77"
        self.edit("areas", change)
        self.assertError("general authority CA-77")

    def test_comparison_tabs_are_optional(self):
        (self.tmp / "comparison_sites.csv").unlink()
        (self.tmp / "comparison_authorities.csv").unlink()
        def change(rows):
            rows[2]["General Authorities"] = ""
        self.edit("areas", change)
        rep, t = self.run_export()
        self.assertEqual(rep.errors, [])
        self.assertFalse([h for h in t["hotspots"] if h["id"].startswith("CS-")])


if __name__ == "__main__":
    unittest.main()
