"""Builds logo, favicons and the link-preview image from a source art file.

usage: python3 tools/make_icons.py path/to/source.(png|webp)
Writes assets/img/logo.png, favicon.ico/.png, apple-touch-icon.png,
icon-192/512.png and og-image.png into the web root.
"""
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
src = Image.open(sys.argv[1]).convert("RGB")

# Square crop centred on the non-black art, with a little breathing room.
mask = src.point(lambda v: 255 if v > 20 else 0).convert("L")
x0, y0, x1, y1 = mask.getbbox()
cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
half = int(max(x1 - x0, y1 - y0) * 0.56)
logo = src.crop((cx - half, cy - half, cx + half, cy + half))

def sized(n):
    return logo.resize((n, n), Image.LANCZOS)

(ROOT / "assets/img").mkdir(parents=True, exist_ok=True)
sized(512).save(ROOT / "assets/img/logo.png", optimize=True)
sized(512).save(ROOT / "icon-512.png", optimize=True)
sized(192).save(ROOT / "icon-192.png", optimize=True)
sized(180).save(ROOT / "apple-touch-icon.png", optimize=True)
sized(32).save(ROOT / "favicon-32.png", optimize=True)
sized(256).save(ROOT / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])

# Link preview: 1200x630, art on the left, title on the right.
W, H = 1200, 630
og = Image.new("RGB", (W, H), (0, 0, 0))
art = logo.resize((560, 560), Image.LANCZOS)
og.paste(art, (50, 35))
d = ImageDraw.Draw(og)
impact = "/System/Library/Fonts/Supplemental/Impact.ttf"
mono = "/System/Library/Fonts/Menlo.ttc"
title = ImageFont.truetype(impact, 120)
sub = ImageFont.truetype(mono, 26)
tx = 630
for i, (word, col) in enumerate((("SUPER", (255, 214, 0)), ("CONTRA", (255, 112, 40)))):
    y = 150 + i * 130
    d.text((tx + 5, y + 5), word, font=title, fill=(40, 40, 40))
    d.text((tx, y), word, font=title, fill=col)
d.text((tx, 430), "Stage 1, in your browser", font=sub, fill=(221, 221, 221))
d.text((tx, 474), "Keyboard or gamepad. No install.", font=sub, fill=(119, 119, 119))
og.save(ROOT / "og-image.png", optimize=True)
