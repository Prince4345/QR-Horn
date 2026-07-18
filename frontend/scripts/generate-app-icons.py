"""Generate favicon + PWA icons — circle fills the square, no black/transparent matte."""
from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1] / "public"
SRC = ROOT / "brand-logo-source.png"


def load_logo_rgba() -> Image.Image:
    img = Image.open(SRC).convert("RGBA")
    px = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            # Strip near-black matting (source sits on black)
            if r < 40 and g < 40 and b < 40:
                px[x, y] = (0, 0, 0, 0)
    bbox = img.getbbox()
    if not bbox:
        raise SystemExit("no opaque pixels in source logo")
    return img.crop(bbox)


def sample_ring_fill(logo: Image.Image) -> tuple[int, int, int, int]:
    """Sample outer ring colour so square corner wedges match the badge."""
    w, h = logo.size
    samples: list[tuple[int, int, int]] = []
    px = logo.load()
    # Mid-edge samples just inside the circle rim
    for x, y in [
        (w // 2, max(0, int(h * 0.02))),
        (w // 2, min(h - 1, int(h * 0.98))),
        (max(0, int(w * 0.02)), h // 2),
        (min(w - 1, int(w * 0.98)), h // 2),
    ]:
        r, g, b, a = px[x, y]
        if a > 200:
            samples.append((r, g, b))
    if not samples:
        return (144, 10, 17, 255)  # deep red fallback from logo
    r = sum(s[0] for s in samples) // len(samples)
    g = sum(s[1] for s in samples) // len(samples)
    b = sum(s[2] for s in samples) // len(samples)
    return (r, g, b, 255)


def render_icon(logo: Image.Image, size: int, scale: float, bg: tuple[int, int, int, int]) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), bg)
    fit = min(size / logo.width, size / logo.height) * scale
    nw, nh = max(1, int(logo.width * fit)), max(1, int(logo.height * fit))
    resized = logo.resize((nw, nh), Image.Resampling.LANCZOS)
    canvas.paste(resized, ((size - nw) // 2, (size - nh) // 2), resized)
    return canvas.convert("RGB")


def main() -> None:
    logo = load_logo_rgba()
    bg = sample_ring_fill(logo)
    print(f"corner fill RGB{bg[:3]}")

    # scale 1.0 → circle touches all four sides (no dark matte frame)
    outputs = [
        (512, 1.0, ROOT / "app-icon-512.png"),
        (192, 1.0, ROOT / "app-icon-192.png"),
        (180, 1.0, ROOT / "apple-touch-icon.png"),
        (48, 1.0, ROOT / "favicon-48.png"),
        (32, 1.0, ROOT / "favicon-32.png"),
        (16, 1.0, ROOT / "favicon-16.png"),
        (512, 0.8, ROOT / "app-icon-maskable-512.png"),  # safe zone for adaptive icons
    ]
    for size, scale, path in outputs:
        render_icon(logo, size, scale, bg).save(path, "PNG", optimize=True)
        print(f"saved {path.name} {size}x{size}")

    # Multi-size ICO — browsers prefer /favicon.ico
    ico_sizes = [(16, 16), (32, 32), (48, 48)]
    icos = [render_icon(logo, s[0], 1.0, bg) for s in ico_sizes]
    icos[0].save(
        ROOT / "favicon.ico",
        format="ICO",
        sizes=ico_sizes,
        append_images=icos[1:],
    )
    print("saved favicon.ico")


if __name__ == "__main__":
    main()
