#!/usr/bin/env python3
"""Generate Gene app icons: rounded-square, indigo->violet gradient,
white G with a cyan synapse node. 192 + 512, plus maskable-safe padding."""
import math, os
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))

def rounded_gradient(size, radius_frac=0.22):
    s = size * 4  # supersample
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    grad = Image.new("RGBA", (s, s))
    top, bot = (49, 46, 129), (109, 40, 217)   # indigo-900 -> violet-700
    px = grad.load()
    for y in range(s):
        t = y / s
        r = int(top[0] + (bot[0] - top[0]) * t)
        g = int(top[1] + (bot[1] - top[1]) * t)
        b = int(top[2] + (bot[2] - top[2]) * t)
        for x in range(s):
            px[x, y] = (r, g, b, 255)
    mask = Image.new("L", (s, s), 0)
    d = ImageDraw.Draw(mask)
    rad = int(s * radius_frac)
    d.rounded_rectangle([0, 0, s - 1, s - 1], radius=rad, fill=255)
    img.paste(grad, (0, 0), mask)
    return img, s

def draw_mark(img, s):
    d = ImageDraw.Draw(img)
    # synapse: small node constellation upper-right
    cx, cy = int(s * 0.70), int(s * 0.30)
    nodes = [(cx, cy), (int(s*0.58), int(s*0.22)), (int(s*0.80), int(s*0.24)),
             (int(s*0.74), int(s*0.42))]
    for (x, y) in nodes[1:]:
        d.line([cx, cy, x, y], fill=(103, 232, 249, 200), width=max(2, s // 90))
    for (x, y) in nodes:
        r = max(3, s // 55)
        d.ellipse([x - r, y - r, x + r, y + r], fill=(103, 232, 249, 255))
    # big G
    font = None
    for p in ("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
              "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"):
        if os.path.exists(p):
            font = ImageFont.truetype(p, int(s * 0.58))
            break
    if font is None:
        font = ImageFont.load_default()
    bbox = d.textbbox((0, 0), "G", font=font)
    w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
    d.text((s * 0.5 - w / 2 - bbox[0], s * 0.54 - h / 2 - bbox[1]), "G",
           font=font, fill=(255, 255, 255, 255))
    return img

def make(size, name, safe_frac=1.0):
    img, s = rounded_gradient(size)
    img = draw_mark(img, s)
    img = img.resize((size, size), Image.LANCZOS)
    if safe_frac < 1.0:  # maskable: shrink content onto transparent canvas
        pad = Image.new("RGBA", (size, size), (11, 13, 20, 255))
        inner = int(size * safe_frac)
        small = img.resize((inner, inner), Image.LANCZOS)
        pad.paste(small, ((size - inner) // 2, (size - inner) // 2), small)
        img = pad
    img.save(os.path.join(HERE, name))
    print(name, size)

make(512, "icon-512.png")
make(192, "icon-192.png")
make(512, "icon-512-maskable.png", safe_frac=0.78)
make(192, "icon-192-maskable.png", safe_frac=0.78)
