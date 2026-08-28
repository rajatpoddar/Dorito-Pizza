#!/usr/bin/env python3
"""Generate branded SVG food art + PWA icons (no external deps).

Run:  python3 scripts/gen_art.py     (from frontend/)
"""
import os
import struct
import zlib

FRONTEND_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(FRONTEND_ROOT, "public", "images")
MENU = os.path.join(OUT, "menu")
os.makedirs(MENU, exist_ok=True)

DARK = "#121212"
GOLD = "#d4af37"
RED = "#e11d2e"

# emoji per category used inside the artwork circle
CATS = {
    "pizza":   ("🍕", ["#7c2d12", "#b45309", GOLD]),
    "burger":  ("🍔", ["#92400e", "#d97706", GOLD]),
    "chicken": ("🍗", ["#b91c1c", "#f59e0b", GOLD]),
    "cake":    ("🎂", ["#be185d", "#f472b6", GOLD]),
    "coffee":  ("🥤", ["#78350f", "#b45309", GOLD]),
    "pasta":   ("🍝", ["#166534", "#65a30d", GOLD]),
}


def svg_cat(slug: str, emoji: str, colors) -> str:
    c1, c2, c3 = colors
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="{c1}"/><stop offset="100%" stop-color="{DARK}"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="42%" r="55%">
      <stop offset="0%" stop-color="{c3}" stop-opacity=".55"/>
      <stop offset="100%" stop-color="{c3}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="400" height="300" fill="url(#bg)"/>
  <circle cx="120" cy="40" r="90" fill="{RED}" opacity=".18"/>
  <circle cx="330" cy="270" r="110" fill="{c2}" opacity=".25"/>
  <circle cx="200" cy="135" r="92" fill="url(#glow)"/>
  <circle cx="200" cy="135" r="74" fill="{DARK}" stroke="{c3}" stroke-width="4"/>
  <text x="200" y="162" font-size="72" text-anchor="middle">{emoji}</text>
  <g fill="{c3}">
    <circle cx="60" cy="250" r="5"/><circle cx="86" cy="268" r="3"/>
    <circle cx="340" cy="52" r="5"/><circle cx="316" cy="36" r="3"/>
  </g>
</svg>'''


def hero_slide(idx: int, emoji: str, headline: str, sub: str, colors) -> str:
    c1, c2, c3 = colors
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="520" viewBox="0 0 1200 520">
  <defs>
    <linearGradient id="h{idx}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="{c1}"/><stop offset="55%" stop-color="{c2}"/>
      <stop offset="100%" stop-color="{DARK}"/>
    </linearGradient>
    <radialGradient id="g{idx}" cx="80%" cy="50%" r="60%">
      <stop offset="0%" stop-color="{c3}" stop-opacity=".5"/>
      <stop offset="100%" stop-color="{c3}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="520" fill="url(#h{idx})"/>
  <circle cx="1010" cy="260" r="230" fill="url(#g{idx})"/>
  <circle cx="1010" cy="260" r="180" fill="{DARK}" stroke="{c3}" stroke-width="6" opacity=".92"/>
  <text x="1010" y="330" font-size="170" text-anchor="middle">{emoji}</text>
  <g fill="{c3}" opacity=".85">
    <circle cx="140" cy="90" r="10"/><circle cx="220" cy="450" r="14"/><circle cx="700" cy="70" r="7"/>
    <circle cx="620" cy="480" r="9"/><circle cx="60" cy="380" r="8"/>
  </g>
  <g fill="#ffffff">
    <text x="70" y="215" font-family="Georgia, serif" font-size="64" font-weight="bold">{headline}</text>
    <text x="70" y="280" font-family="Verdana, sans-serif" font-size="28" fill="{c3}">{sub}</text>
    <text x="70" y="340" font-family="Verdana, sans-serif" font-size="22" fill="#e5e5e5">📍 Jamatara Road, Palojori, Deoghar — Home Delivery 🛵</text>
  </g>
</svg>'''


def write_png(path: str, size: int, rgb=(225, 29, 46)) -> None:
    """Minimal PNG writer — solid brand colour with a gold ring."""
    rows = b""
    cx = cy = size / 2
    outer, inner = size * 0.44, size * 0.33
    for y in range(size):
        row = b"\x00"
        for x in range(size):
            d = ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5
            if abs(d - (outer + inner) / 2) <= inner * 0.5:
                row += bytes((212, 175, 55))       # gold ring
            elif d < (outer + inner) / 2:
                row += bytes((255, 255, 255))      # white centre
            else:
                row += bytes(rgb)                  # brand red bg
        rows += row

    def chunk(tag: bytes, data: bytes) -> bytes:
        return (struct.pack(">I", len(data)) + tag + data +
                struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF))

    ihdr = struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)
    png = (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) +
           chunk(b"IDAT", zlib.compress(rows)) + chunk(b"IEND", b""))
    with open(path, "wb") as f:
        f.write(png)


for slug, (emoji, colors) in CATS.items():
    with open(os.path.join(MENU, f"{slug}.svg"), "w") as f:
        f.write(svg_cat(slug, emoji, colors))
print("✓ 6 menu images")

HEROS = [
    (1, "🍕", "Dorito Special Pizza", "Fully loaded · sirf ₹180", ("#7f1d1d", RED, GOLD)),
    (2, "🍔", "Burgers &amp; Chicken", "Juju bhara taste · ₹50 se shuru", ("#78350f", "#b45309", GOLD)),
    (3, "🎂", "Fresh Cakes &amp; Bakes", "Birthday ho ya party — hum ready", ("#831843", "#be185d", GOLD)),
]
for idx, emoji, head, sub, colors in HEROS:
    with open(os.path.join(OUT, f"hero{idx}.svg"), "w") as f:
        f.write(hero_slide(idx, emoji, head, sub, colors))
print("✓ 3 hero slides")

icon_dir = os.path.join(FRONTEND_ROOT, "public")
write_png(os.path.join(icon_dir, "icon-192.png"), 192)
write_png(os.path.join(icon_dir, "icon-512.png"), 512)
print("✓ PWA icons (192/512)")
