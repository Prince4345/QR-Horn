"""Prepare brand-logo.png — strip black matting and center on transparent square."""
from PIL import Image

SRC = r"C:\Users\pincu\Downloads\untitled\frontend\public\brand-logo-source.png"
DST = r"C:\Users\pincu\Downloads\untitled\frontend\public\brand-logo.png"
OUT = 512


def main() -> None:
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
        raise SystemExit("no opaque pixels")
    img = img.crop(bbox)

    canvas = Image.new("RGBA", (OUT, OUT), (0, 0, 0, 0))
    scale = min(OUT / img.width, OUT / img.height) * 0.96
    nw, nh = int(img.width * scale), int(img.height * scale)
    img = img.resize((nw, nh), Image.Resampling.LANCZOS)
    canvas.paste(img, ((OUT - nw) // 2, (OUT - nh) // 2), img)
    canvas.save(DST, "PNG", optimize=True)
    print(f"saved {DST} {OUT}x{OUT}")


if __name__ == "__main__":
    main()
