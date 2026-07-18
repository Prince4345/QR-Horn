"""Generate favicon + PWA icons from brand-logo-source.png (opaque, full-bleed)."""
from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1] / "public"
SRC = ROOT / "brand-logo-source.png"

# Dark surface — matches Retrowave header chrome (no white matting in tabs / PWA title bar)
ICON_BG = (26, 11, 46, 255)


def load_logo_rgba() -> Image.Image:
    img = Image.open(SRC).convert("RGBA")
    px = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if r < 35 and g < 35 and b < 35:
                px[x, y] = (0, 0, 0, 0)
    bbox = img.getbbox()
    if not bbox:
        raise SystemExit("no opaque pixels in source logo")
    return img.crop(bbox)


def render_icon(logo: Image.Image, size: int, scale: float, bg: tuple[int, int, int, int]) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), bg)
    fit = min(size / logo.width, size / logo.height) * scale
    nw, nh = int(logo.width * fit), int(logo.height * fit)
    resized = logo.resize((nw, nh), Image.Resampling.LANCZOS)
    canvas.paste(resized, ((size - nw) // 2, (size - nh) // 2), resized)
    return canvas.convert("RGB")


def main() -> None:
    logo = load_logo_rgba()
    outputs = [
        (512, 0.98, ICON_BG, ROOT / "app-icon-512.png"),
        (192, 0.98, ICON_BG, ROOT / "app-icon-192.png"),
        (180, 0.98, ICON_BG, ROOT / "apple-touch-icon.png"),
        (32, 0.96, ICON_BG, ROOT / "favicon-32.png"),
        (512, 0.72, ICON_BG, ROOT / "app-icon-maskable-512.png"),
    ]
    for size, scale, bg, path in outputs:
        render_icon(logo, size, scale, bg).save(path, "PNG", optimize=True)
        print(f"saved {path.name} {size}x{size}")


if __name__ == "__main__":
    main()
