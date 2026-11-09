#!/usr/bin/env python3
"""Build data/masks.json for illustrations-packed.html.

Reads every PNG in images/ and stores a 1-bit silhouette (alpha > 127), downscaled so the
longest side is at most 93 px. Bits are packed MSB-first, row-major, then base64-encoded.

    pip install pillow
    python3 scripts/build_masks.py
"""
import base64, json, os, re, glob
from PIL import Image

MASK_MAX = 93
ALPHA_ON = 127
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMG_DIR = os.path.join(ROOT, "images")
OUT = os.path.join(ROOT, "data", "masks.json")

masks = {}
for path in sorted(glob.glob(os.path.join(IMG_DIR, "*.png"))):
    slug = os.path.splitext(os.path.basename(path))[0]
    if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", slug):
        continue
    im = Image.open(path).convert("RGBA")
    w, h = im.size
    scale = MASK_MAX / max(w, h)
    mw, mh = max(1, round(w * scale)), max(1, round(h * scale))
    alpha = im.getchannel("A").resize((mw, mh), Image.LANCZOS)
    px = alpha.load()
    bits = bytearray((mw * mh + 7) // 8)
    for y in range(mh):
        for x in range(mw):
            if px[x, y] > ALPHA_ON:
                i = y * mw + x
                bits[i >> 3] |= 1 << (7 - (i & 7))
    masks[slug] = {"w": mw, "h": mh, "bits": base64.b64encode(bytes(bits)).decode()}

os.makedirs(os.path.dirname(OUT), exist_ok=True)
# One species per line, so adding a bird is a single-line change in version control
lines = [f"{json.dumps(k)}:{json.dumps(v, separators=(',', ':'))}" for k, v in sorted(masks.items())]
with open(OUT, "w", encoding="utf-8") as f:
    f.write("{\n" + ",\n".join(lines) + "\n}\n")
print(f"wrote {len(masks)} masks to {OUT}")
