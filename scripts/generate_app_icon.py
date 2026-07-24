#!/usr/bin/env python3
from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
ICONSET = ASSETS / "app-icon.iconset"
PNG = ASSETS / "app-icon.png"
ICNS = ASSETS / "app-icon.icns"
ICO = ASSETS / "app-icon.ico"


def _rounded_rect(draw: ImageDraw.ImageDraw, box, radius, fill, outline=None, width=1):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def _make_base(size: int = 1024) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Deep blue-to-slate background with a soft vignette.
    for y in range(size):
        t = y / max(1, size - 1)
        r = int(9 + (21 - 9) * t)
        g = int(16 + (36 - 16) * t)
        b = int(28 + (55 - 28) * t)
        draw.line((0, y, size, y), fill=(r, g, b, 255))

    glow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow)
    glow_draw.ellipse((size * 0.08, size * 0.08, size * 0.92, size * 0.92), fill=(46, 204, 182, 42))
    glow = glow.filter(ImageFilter.GaussianBlur(radius=size * 0.08))
    img.alpha_composite(glow)

    shell = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    shell_draw = ImageDraw.Draw(shell)
    _rounded_rect(
        shell_draw,
        (size * 0.09, size * 0.09, size * 0.91, size * 0.91),
        radius=int(size * 0.17),
        fill=(15, 24, 38, 245),
        outline=(63, 156, 255, 88),
        width=max(2, size // 220),
    )

    # Inner card.
    card_box = (size * 0.19, size * 0.17, size * 0.81, size * 0.83)
    _rounded_rect(shell_draw, card_box, radius=int(size * 0.08), fill=(244, 247, 251, 250))

    # Folded corner.
    fold = [
        (size * 0.70, size * 0.17),
        (size * 0.81, size * 0.17),
        (size * 0.81, size * 0.28),
    ]
    shell_draw.polygon(fold, fill=(225, 233, 242, 255))
    shell_draw.line(
        [(size * 0.70, size * 0.17), (size * 0.81, size * 0.28)],
        fill=(180, 192, 205, 255),
        width=max(2, size // 220),
    )

    # Stylized note graph.
    graph = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    graph_draw = ImageDraw.Draw(graph)
    nodes = [
        (size * 0.33, size * 0.37),
        (size * 0.42, size * 0.29),
        (size * 0.53, size * 0.39),
        (size * 0.44, size * 0.50),
    ]
    edges = [(0, 1), (1, 2), (2, 3), (3, 0), (0, 2)]
    for a, b in edges:
        graph_draw.line([nodes[a], nodes[b]], fill=(31, 119, 204, 255), width=max(6, size // 96))
    for idx, (x, y) in enumerate(nodes):
        radius = size * (0.026 if idx != 1 else 0.034)
        graph_draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=(16, 163, 127, 255))

    # Vertical spine and text-like lines.
    graph_draw.rounded_rectangle(
        (size * 0.29, size * 0.26, size * 0.35, size * 0.59),
        radius=int(size * 0.03),
        fill=(43, 98, 171, 255),
    )
    for i, w in enumerate((0.46, 0.50, 0.44)):
        y = size * (0.25 + i * 0.07)
        graph_draw.rounded_rectangle(
            (size * 0.39, y, size * (w + 0.18), y + size * 0.028),
            radius=int(size * 0.014),
            fill=(120, 140, 160, 175),
        )

    graph = graph.filter(ImageFilter.GaussianBlur(radius=size * 0.0015))
    shell.alpha_composite(graph)

    # Small command prompt dot.
    prompt = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    prompt_draw = ImageDraw.Draw(prompt)
    prompt_draw.rounded_rectangle(
        (size * 0.58, size * 0.63, size * 0.72, size * 0.69),
        radius=int(size * 0.02),
        fill=(25, 195, 180, 255),
    )
    prompt_draw.polygon(
        [
            (size * 0.59, size * 0.635),
            (size * 0.62, size * 0.65),
            (size * 0.59, size * 0.665),
        ],
        fill=(245, 249, 252, 255),
    )
    shell.alpha_composite(prompt)

    img.alpha_composite(shell)

    # Subtle outer shadow.
    shadow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(shadow)
    shadow_draw.rounded_rectangle(
        (size * 0.11, size * 0.11, size * 0.89, size * 0.89),
        radius=int(size * 0.16),
        fill=(0, 0, 0, 50),
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(radius=size * 0.02))
    img = Image.alpha_composite(shadow, img)
    return img


def _write_iconset(base: Image.Image) -> None:
    ICONSET.mkdir(parents=True, exist_ok=True)
    sizes = {
        "icon_16x16.png": 16,
        "icon_16x16@2x.png": 32,
        "icon_32x32.png": 32,
        "icon_32x32@2x.png": 64,
        "icon_64x64.png": 64,
        "icon_64x64@2x.png": 128,
        "icon_128x128.png": 128,
        "icon_128x128@2x.png": 256,
        "icon_256x256.png": 256,
        "icon_256x256@2x.png": 512,
        "icon_512x512.png": 512,
        "icon_512x512@2x.png": 1024,
    }
    for name, size in sizes.items():
        resized = base.resize((size, size), Image.Resampling.LANCZOS)
        resized.save(ICONSET / name)


def main() -> None:
    ASSETS.mkdir(parents=True, exist_ok=True)
    base = _make_base()
    base.save(PNG)
    _write_iconset(base)

    # Save Windows multi-resolution ICO icon
    try:
        base.save(ICO, format="ICO", sizes=[(16, 16), (32, 32), (48, 48), (256, 256)])
        print("[generate_app_icon] Windows .ico icon generated successfully.")
    except Exception as e:
        print(f"[generate_app_icon] Warning: Failed to generate .ico: {e}")

    if ICNS.exists():
        ICNS.unlink()

    if shutil.which("iconutil"):
        subprocess.run(["iconutil", "-c", "icns", str(ICONSET), "-o", str(ICNS)], check=True)
        shutil.rmtree(ICONSET)
    else:
        print("[generate_app_icon] Warning: iconutil not found. Skipping .icns creation. Only .png iconset was written.")


if __name__ == "__main__":
    main()
