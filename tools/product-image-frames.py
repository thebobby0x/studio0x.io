"""studio0x v2.1 product-image frame compositor.

contentOS    -> horizontal accent band on the BOTTOM.
templateVault -> vertical accent band on the LEFT (text reads bottom-to-top).
Band is semi-transparent (dark scrim + ~80% accent) over a real photo.
Tag credits the engine + studio0x. A FOMO stat badge sits in the top corner.
No text is ever baked into the *photo* itself.
"""
from PIL import Image, ImageDraw, ImageFont

SYNE = "/tmp/fonts/Syne.ttf"
DMM  = "/tmp/fonts/DMMono-Medium.ttf"

BAND_FRAC = 0.20
SCRIM_ALPHA = 78      # black scrim under the band
ACCENT_ALPHA = 205    # accent over the scrim (~80%)


def syne(size, wght=800):
    f = ImageFont.truetype(SYNE, size)
    try:
        f.set_variation_by_axes([wght])
    except Exception:
        pass
    return f


def mono(size):
    return ImageFont.truetype(DMM, size)


def hex2rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))


def _w(font, s):
    bb = font.getbbox(s)
    return bb[2] - bb[0]


def _h(font, s="Hg"):
    bb = font.getbbox(s)
    return bb[3] - bb[1]


def fit_font(text, maxw, start, minsize, wght=800):
    s = start
    while s > minsize:
        if _w(syne(s, wght), text) <= maxw:
            return syne(s, wght)
        s -= 2
    return syne(minsize, wght)


def wrap2(text, maxw, font):
    words = text.split()
    if _w(font, text) <= maxw or len(words) == 1:
        return [text]
    best = None
    for i in range(1, len(words)):
        a = " ".join(words[:i]); b = " ".join(words[i:])
        w = max(_w(font, a), _w(font, b))
        if best is None or w < best[0]:
            best = (w, [a, b])
    return best[1]


def draw_tracked(draw, xy, text, font, fill, track):
    x, y = xy
    for ch in text:
        draw.text((x, y), ch, font=font, fill=fill)
        x += _w(font, ch) + track
    return x


def square_photo(path, size):
    im = Image.open(path).convert("RGB")
    w, h = im.size
    s = min(w, h)
    im = im.crop(((w-s)//2, (h-s)//2, (w-s)//2+s, (h-s)//2+s))
    return im.resize((size, size), Image.LANCZOS)


def _render_strip(length, thick, accent2, name, tag, size, grid):
    """Band content drawn horizontally on a transparent strip (length x thick)."""
    strip = Image.new("RGBA", (length, thick), (0, 0, 0, 0))
    d = ImageDraw.Draw(strip, "RGBA")
    pad = int(size * 0.05)
    tri = int(thick * 0.5)
    d.polygon([(0, 0), (tri, 0), (0, tri)], fill=accent2 + (255,))
    # tag (lowercase keeps camelCase brand tokens intact)
    tf = mono(int(size * 0.0225))
    draw_tracked(d, (pad, int(thick * 0.17)), tag, tf,
                 (255, 255, 255, 230), int(size * 0.003))
    # name
    avail = length - 2 * pad - (int(thick * 0.40) if grid else 0)
    nf = fit_font(name, avail, int(size * 0.072), int(size * 0.040))
    lines = wrap2(name, avail, nf)
    if len(lines) == 2:
        nf = fit_font(max(lines, key=lambda s: _w(nf, s)), avail,
                      int(size * 0.052), int(size * 0.034))
    lh = _h(nf) + int(size * 0.004)
    ny = int(thick * 0.46)
    for ln in lines:
        d.text((pad, ny), ln, font=nf, fill=(255, 255, 255, 255))
        ny += lh
    if grid:
        gb = int(thick * 0.34); gx = length - pad - gb; gy = (thick - gb) // 2
        cell = gb / 3
        for r in range(3):
            for c in range(3):
                op = 255 if (r + c) % 2 == 0 else 95
                d.rectangle([gx+c*cell+2, gy+r*cell+2,
                             gx+(c+1)*cell-2, gy+(r+1)*cell-2],
                            fill=(255, 255, 255, op))
    return strip


def _badge(base, text, bg, fg, size, align="right", inset=0):
    """Pill badge. align='right' (stat) or 'left' (punchy FOMO, offset by inset)."""
    if not text:
        return
    d = ImageDraw.Draw(base, "RGBA")
    f = mono(int(size * 0.026))
    bb = f.getbbox(text); tw = bb[2] - bb[0]
    padx = int(size * 0.020); pady = int(size * 0.015); m = int(size * 0.045)
    bw = tw + 2 * padx; bh = (bb[3] - bb[1]) + 2 * pady
    x1 = size - m - bw if align == "right" else m + inset
    y1 = m
    d.rounded_rectangle([x1, y1, x1 + bw, y1 + bh], radius=int(bh * 0.32),
                        fill=bg + (255,))
    d.text((x1 + padx, y1 + pady - bb[1]), text, font=f, fill=fg + (255,))


def build_frame(photo, engine, accent, accent2, name, stat="", punchy="", size=1080):
    base = square_photo(photo, size).convert("RGBA")
    A = hex2rgb(accent); A2 = hex2rgb(accent2)
    band = int(size * BAND_FRAC)
    is_content = engine.startswith("content")
    token = "contentOS" if is_content else "templateVault"
    tag = f"created with {token}  ·  by studio0x"
    rect = [0, size - band, size, size] if is_content else [0, 0, band, size]
    # semi-transparent band: dark scrim, then accent
    for fill in [(0, 0, 0, SCRIM_ALPHA), A + (ACCENT_ALPHA,)]:
        layer = Image.new("RGBA", base.size, (0, 0, 0, 0))
        ImageDraw.Draw(layer).rectangle(rect, fill=fill)
        base = Image.alpha_composite(base, layer)
    strip = _render_strip(size, band, A2, name, tag, size, grid=not is_content)
    if is_content:
        base.alpha_composite(strip, (0, size - band))
    else:
        base.alpha_composite(strip.rotate(90, expand=True), (0, 0))
    # FOMO: punchy tag (accent pill, white, top-left) + real-count stat (accent2, dark, top-right)
    _badge(base, punchy.upper(), A, (255, 255, 255), size,
           align="left", inset=0 if is_content else band)
    _badge(base, stat, A2, (15, 16, 20), size, align="right")
    return base.convert("RGB")
