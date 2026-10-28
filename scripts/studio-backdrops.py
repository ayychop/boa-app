#!/usr/bin/env python3
"""
BOA's Studio backdrops for the call's virtual background
(src/calls/backgrounds.js): each tone as a lit, seamless paper sweep, not a
flat fill, so it reads like a real photography studio behind you.

  - A soft pool of light behind the head (the key light spilling onto the
    paper), falling off to the edges and corners like a real backdrop.
  - Faint low-frequency mottle, like painted canvas or seamless paper.
  - Fine grain, so the gradient never bands once the call's video encoder
    compresses it.

Square, so the camera's portrait or landscape crop keeps the light pool in
the middle. Run again after changing a tone:

  python3 scripts/studio-backdrops.py
"""
import os
from PIL import Image, ImageChops, ImageFilter

SIZE = 1600
OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'backdrops')

# id: (base hex, how much the light pool lifts it, how much the edges fall
# away, and a glow added in the pool: black can't be lifted by scaling, but
# it still needs a whisper of light or it reads as a hole).
TONES = {
    'black': ('#000000', 0.0, 0.0, 9),
    'charcoal': ('#1A1A1A', 0.30, 0.45, 0),
    'warm-grey': ('#6E675F', 0.22, 0.42, 0),
}


def rgb(hexcode):
    h = hexcode.lstrip('#')
    return tuple(int(h[i : i + 2], 16) for i in (0, 2, 4))


def maps():
    """The light pool (1 at its heart, 0 outside) and the edge shadow (0 centre, 1 corners), built small and scaled up smoothly."""
    n = 256
    pool, edge = Image.new('F', (n, n)), Image.new('F', (n, n))
    pp, ep = pool.load(), edge.load()
    for y in range(n):
        for x in range(n):
            u, v = x / (n - 1) - 0.5, y / (n - 1)
            # An upright ellipse a little above centre: the shape a softbox throws on paper.
            d = (u / 0.42) ** 2 + ((v - 0.42) / 0.5) ** 2
            pp[x, y] = max(0.0, 1.0 - d) ** 1.6
            ep[x, y] = min(1.0, (u * u + (v - 0.5) ** 2) * 2.2)
    return pool.resize((SIZE, SIZE), Image.BICUBIC), edge.resize((SIZE, SIZE), Image.BICUBIC)


def texture(sigma, blur, size):
    """Grey noise centred on 128: small and blurred for mottle, full size for grain."""
    img = Image.effect_noise((size, size), sigma)
    if blur:
        img = img.filter(ImageFilter.GaussianBlur(blur))
    return img.resize((SIZE, SIZE), Image.BICUBIC) if size != SIZE else img


def backdrop(base, lift, falloff, glow, pool, edge):
    channels = []
    for c in rgb(base):
        # Each pixel: the tone, lifted in the pool, darker towards the edges, plus the glow.
        lit = Image.eval(pool, lambda p, c=c: c * (1.0 + lift * p) + glow * p)
        shade = Image.eval(edge, lambda e, c=c: c * falloff * 0.5 * e)
        channels.append(ImageChops.subtract(lit.convert('L'), shade.convert('L')))
    img = Image.merge('RGB', channels)
    # Mottle and grain, added around mid grey so the tone stays true.
    mottle = texture(28, 6, 192).point(lambda v: 128 + (v - 128) * 0.5)
    grain = texture(18, 0, SIZE).point(lambda v: 128 + (v - 128) * 0.35)
    for layer in (mottle, grain):
        img = ImageChops.add(img, Image.merge('RGB', [layer] * 3), scale=1.0, offset=-128)
    return img


def main():
    os.makedirs(OUT, exist_ok=True)
    pool, edge = maps()
    for name, (base, lift, falloff, glow) in TONES.items():
        path = os.path.join(OUT, f'{name}.jpg')
        backdrop(base, lift, falloff, glow, pool, edge).save(path, 'JPEG', quality=86, optimize=True, progressive=True)
        print(path, os.path.getsize(path) // 1024, 'KB')


if __name__ == '__main__':
    main()
