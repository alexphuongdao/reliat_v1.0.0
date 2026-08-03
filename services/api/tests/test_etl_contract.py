import csv
import tempfile
import unittest
from pathlib import Path

from app.etl import PERCENTILE_KEYS, SIEVE_SIZES_MM, parse_csv


class EtlContractTests(unittest.TestCase):
    def test_csv_parser_normalizes_epoch_milliseconds_and_psd_shape(self) -> None:
        fields = ["channel_id", "ts", *PERCENTILE_KEYS, "topsize", "color_hue", "color_sat", "color_light"]
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "sample.csv"
            with path.open("w", newline="") as handle:
                writer = csv.DictWriter(handle, fieldnames=fields)
                writer.writeheader()
                writer.writerow({
                    "channel_id": "cv-test",
                    "ts": "1767225600000",
                    **{key: str(int(key[1:])) for key in PERCENTILE_KEYS},
                    "topsize": "120.5",
                    "color_hue": "24",
                    "color_sat": "25",
                    "color_light": "28",
                })

            row = next(parse_csv(path))
            psd = row.to_psd()

        self.assertEqual(row.channel_id, "cv-test")
        self.assertEqual(row.t.year, 2026)
        self.assertEqual(tuple(psd["percentiles"]), PERCENTILE_KEYS)
        self.assertEqual(len(psd["sieves"]), len(SIEVE_SIZES_MM))
        self.assertEqual(psd["sieves"][0]["size"], SIEVE_SIZES_MM[0])


if __name__ == "__main__":
    unittest.main()
