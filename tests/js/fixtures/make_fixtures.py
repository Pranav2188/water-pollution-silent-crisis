"""Make the small test images for tests/js/report-rules.test.mjs (run once; outputs are committed).

    python3 tests/js/fixtures/make_fixtures.py
"""
from pathlib import Path
from PIL import Image

HERE = Path(__file__).resolve().parent


def gps_exif():
    exif = Image.Exif()
    gps = exif.get_ifd(0x8825)
    gps[1], gps[2] = "N", (18.0, 40.0, 36.75)   # 18.676874 N
    gps[3], gps[4] = "E", (73.0, 53.0, 38.37)   # 73.893992 E
    exif[0x010F] = "TestPhone"                  # camera make
    return exif


img = Image.new("RGB", (160, 120), (40, 110, 120))
img.save(HERE / "clean.jpg", "JPEG", quality=80)                      # like a canvas redraw: no EXIF
img.save(HERE / "with-gps.jpg", "JPEG", quality=80, exif=gps_exif())  # straight from a phone camera
img.save(HERE / "clean.webp", "WEBP", quality=80)                     # lossy (VP8)
img.save(HERE / "lossless.webp", "WEBP", lossless=True)               # VP8L
img.save(HERE / "with-gps.webp", "WEBP", quality=80, exif=gps_exif()) # VP8X + EXIF chunk
img.save(HERE / "picture.png", "PNG")                                 # not accepted
Image.new("RGB", (2100, 20), (0, 0, 0)).save(HERE / "too-wide.jpg", "JPEG", quality=60)
print("fixtures written to", HERE)
