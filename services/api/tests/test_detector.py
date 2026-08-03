import unittest
from datetime import datetime, timedelta, timezone

from app.detector import detect_outliers
from app.models import Channel, Measurement


def measurement(index: int, f80: float = 100.0, topsize: float = 120.0) -> Measurement:
    return Measurement(
        channel_id="cv-test",
        t=datetime(2026, 1, 1, tzinfo=timezone.utc).replace(tzinfo=None)
        + timedelta(minutes=index),
        f80=f80,
        topsize=topsize,
        psd={"percentiles": {f"F{i}": f80 / 2 for i in range(10, 100, 10)}, "sieves": []},
        color_hsl="hsl(24 24% 28%)",
        color_hue=24.0,
        color_sat=24.0,
        color_light=28.0,
    )


class DetectorTests(unittest.TestCase):
    def setUp(self) -> None:
        self.channel = Channel(
            id="cv-test",
            tenant_id="tenant-a",
            name="Test channel",
            belt="Primary",
            color="var(--ch-1)",
            base_f80=100.0,
            base_topsize=120.0,
            online=True,
            shift="A",
        )

    def test_stable_window_has_no_outliers(self) -> None:
        rows = [measurement(i) for i in range(30)]
        self.assertEqual(list(detect_outliers(self.channel, rows)), [])

    def test_large_f80_excursion_is_detected_and_links_measurement(self) -> None:
        rows = [measurement(i) for i in range(29)]
        spike = measurement(29, f80=110.0)
        spike.id = 30
        rows.append(spike)

        outliers = list(detect_outliers(self.channel, rows))

        self.assertEqual(len(outliers), 1)
        self.assertEqual(outliers[0].type, "Particle-size spike")
        self.assertEqual(outliers[0].metric, "F80")
        self.assertEqual(outliers[0].measurement_id, spike.id)
        self.assertGreaterEqual(outliers[0].deviation, 4.0)


if __name__ == "__main__":
    unittest.main()
