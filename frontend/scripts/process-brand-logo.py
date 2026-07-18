from PIL import Image

SRC = r"C:\Users\pincu\.cursor\projects\c-Users-pincu-Downloads-untitled\assets\c__Users_pincu_AppData_Roaming_Cursor_User_workspaceStorage_7d0f3dfd16f038504834cf6b273a12b1_images_image-45c6b8a5-4178-4ffe-bb52-8b724544326b.png"
DST = r"C:\Users\pincu\Downloads\untitled\frontend\public\brand-logo.png"


def main() -> None:
    img = Image.open(SRC).convert("RGBA")
    px = img.load()
    w, h = img.size

    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if r < 55 and g < 55 and b < 55:
                px[x, y] = (0, 0, 0, 0)

    bbox = img.getbbox()
    if bbox:
        img = img.crop(bbox)

    size = max(img.size)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ox = (size - img.width) // 2
    oy = (size - img.height) // 2
    canvas.paste(img, (ox, oy), img)
    canvas.save(DST, "PNG", optimize=True)
    print(f"saved {DST} {canvas.size}")


if __name__ == "__main__":
    main()
