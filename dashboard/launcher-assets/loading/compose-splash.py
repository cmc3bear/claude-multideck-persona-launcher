"""
Composite the 5-second deploy-launch.gif from clean-plate + 3 persona sprites.

Beats:
  0.0 - 0.4s  : scene fade in (alpha ramp)
  0.4 - 3.6s  : agents walk EXIT door -> taxi door (3.2s travel)
  3.6 - 4.0s  : agents fade out (boarding the taxi)
  4.0 - 5.0s  : taxi engine flare (boarded, idling on platform)

Per-agent walk-cycle is faked procedurally with a sine bob (vertical) +
phase-offset per agent so legs don't move in unison. Taxi engines have
a continuous cyan pulse plus a flare burst at takeoff.

Output: scrap/loading-splash/output/deploy-launch.gif (600x400, 8 fps, looping)
"""
from pathlib import Path
import math
import random
import sys
import time

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path('/mnt/f/03-INFRASTRUCTURE/dispatch-framework/scrap/loading-splash')
PLATE_PATH = ROOT / 'clean-plate' / 'loading-bg-clean.png'
SPRITES_DIR = ROOT / 'sprites'
OUT_DIR = ROOT / 'output'
OUT_DIR.mkdir(parents=True, exist_ok=True)

FPS = 12
DURATION_S = 5.0
N_FRAMES = int(FPS * DURATION_S)  # 60

# Internal render res = clean-plate native; downsample at the end.
W, H = 1536, 1024
GIF_W, GIF_H = 600, 400

SPRITE_SCALE = 0.72
SPRITE_FOOT_Y = 870  # bottom of sprite touches platform
EXIT_X = 200
TAXI_X = 850
AGENT_SPACING_X = 175

WALK_START_T = 0.3
WALK_END_T = 3.5
FADE_END_T = 3.9
TAKEOFF_END_T = 5.0
SCENE_FADE_IN = 0.3

# Cyan glow color matches taxi headlights/engine vents in source.
GLOW_RGB = (90, 220, 255)
# Engine vent positions in 1536x1024 (3 vents under taxi).
ENGINE_VENTS = [(810, 760), (1020, 770), (1230, 780)]


def clamp(v, lo, hi):
    return max(lo, min(hi, v))


def smoothstep(t):
    t = clamp(t, 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def load_sprite(persona_key):
    p = SPRITES_DIR / persona_key / 'sprite-base.png'
    img = Image.open(p).convert('RGBA')
    new_size = (int(img.size[0] * SPRITE_SCALE), int(img.size[1] * SPRITE_SCALE))
    return img.resize(new_size, Image.NEAREST)


def fade_alpha(rgba_img, factor):
    """Multiply the alpha channel of an RGBA image by factor (0..1)."""
    if factor >= 0.999:
        return rgba_img
    if factor <= 0.001:
        return Image.new('RGBA', rgba_img.size, (0, 0, 0, 0))
    r, g, b, a = rgba_img.split()
    a = a.point(lambda v: int(v * factor))
    return Image.merge('RGBA', (r, g, b, a))


def draw_engine_glow(canvas, intensity, flare):
    """Cyan additive glow on each engine vent. Intensity 0..1, flare 0..3.
    Drawn 'screen-blend' style by upscaling alpha + maxing the cyan channels."""
    if intensity <= 0 and flare <= 0:
        return canvas
    layer = Image.new('RGBA', canvas.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    base_radius = 70
    pulse_r = int(base_radius + 50 * intensity + 180 * flare)
    for ex, ey in ENGINE_VENTS:
        for r in range(pulse_r, 4, -4):
            t = r / pulse_r
            a = int((230 * intensity + 255 * flare) * (1 - t) ** 1.4)
            a = clamp(a, 0, 255)
            if a <= 0:
                continue
            draw.ellipse([ex - r, ey - r, ex + r, ey + r], fill=(*GLOW_RGB, a))
    layer = layer.filter(ImageFilter.GaussianBlur(radius=8))
    return Image.alpha_composite(canvas, layer)


def draw_takeoff_streak(canvas, flare):
    """Cyan light streaks shooting downward from engines + global flash."""
    if flare <= 0:
        return canvas
    layer = Image.new('RGBA', canvas.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    # Big bright core at each engine.
    for ex, ey in ENGINE_VENTS:
        core_r = int(80 + 120 * flare)
        for r in range(core_r, 0, -4):
            t = r / core_r
            a = int(255 * flare * (1 - t) ** 0.8)
            draw.ellipse([ex - r, ey - r, ex + r, ey + r], fill=(255, 255, 255, a))
    # Vertical light columns shooting down.
    for ex, ey in ENGINE_VENTS:
        col_w = int(80 * flare)
        col_h = int(220 * flare)
        for i in range(col_h):
            t = i / max(col_h, 1)
            a = int(220 * flare * (1 - t))
            if a <= 0:
                break
            draw.ellipse(
                [ex - col_w * (1 - t * 0.4),
                 ey + i,
                 ex + col_w * (1 - t * 0.4),
                 ey + i + 5],
                fill=(*GLOW_RGB, a),
            )
    layer = layer.filter(ImageFilter.GaussianBlur(radius=10))

    # Global cyan tint flash on the whole canvas at peak flare.
    if flare > 0.3:
        flash = Image.new('RGBA', canvas.size, (*GLOW_RGB, int(60 * (flare - 0.3))))
        canvas = Image.alpha_composite(canvas, flash)

    return Image.alpha_composite(canvas, layer)


def render_frame(t, plate_rgba, sprites):
    canvas = plate_rgba.copy()

    # Walk progress 0..1.
    walk_p = clamp((t - WALK_START_T) / (WALK_END_T - WALK_START_T), 0, 1)
    walk_p = smoothstep(walk_p)

    # Boarding alpha 1..0 between WALK_END_T and FADE_END_T.
    if t < WALK_END_T:
        agent_alpha = 1.0
    elif t < FADE_END_T:
        agent_alpha = 1.0 - (t - WALK_END_T) / (FADE_END_T - WALK_END_T)
    else:
        agent_alpha = 0.0

    # Walk-cycle bob: each agent bobs at ~2 Hz with phase offset.
    bob_omega = 2 * math.pi * 2.2

    # Place agents from back to front so the leftmost (back) draws under.
    for i, sprite in enumerate(sprites):
        sw, sh = sprite.size
        start_x = EXIT_X + i * AGENT_SPACING_X
        end_x = TAXI_X + i * AGENT_SPACING_X
        ax = int(start_x + (end_x - start_x) * walk_p)
        bob = 0 if t < WALK_START_T or t > WALK_END_T else \
              int(5 * math.sin(bob_omega * t + i * 1.3))
        ay = SPRITE_FOOT_Y - sh + bob

        s = fade_alpha(sprite, agent_alpha)
        canvas.alpha_composite(s, (ax, ay))

    # Engine glow pulse + takeoff flare.
    pulse = 0.5 + 0.5 * math.sin(2 * math.pi * 1.4 * t)
    flare = 0.0
    if t >= FADE_END_T:
        flare = smoothstep((t - FADE_END_T) / (TAKEOFF_END_T - FADE_END_T))
    canvas = draw_engine_glow(canvas, pulse, flare)
    canvas = draw_takeoff_streak(canvas, flare)

    # Scene fade-in at the very start (50% dim → 0% dim, never fully black).
    if t < SCENE_FADE_IN:
        fade = t / SCENE_FADE_IN
        dim = Image.new('RGBA', canvas.size, (0, 0, 0, 128))
        dim = fade_alpha(dim, 1 - fade)
        canvas = Image.alpha_composite(canvas, dim)

    # Downsample to GIF output res with NEAREST to keep pixel-art crisp.
    out = canvas.convert('RGB').resize((GIF_W, GIF_H), Image.LANCZOS)
    return out


def main():
    if len(sys.argv) > 1:
        persona_keys = sys.argv[1].split(',')
    else:
        persona_keys = ['engineer', 'architect', 'reviewer']

    print(f'personas: {persona_keys}')
    print(f'frames: {N_FRAMES} @ {FPS} fps  ({DURATION_S}s)')

    plate = Image.open(PLATE_PATH).convert('RGBA')
    sprites = [load_sprite(k) for k in persona_keys]
    print(f'sprite sizes: {[s.size for s in sprites]}')

    t0 = time.time()
    frames = []
    for i in range(N_FRAMES):
        t = i / FPS
        f = render_frame(t, plate, sprites)
        frames.append(f)
        if (i + 1) % 10 == 0:
            print(f'  rendered {i+1}/{N_FRAMES}')
    print(f'render: {time.time()-t0:.1f}s')

    # Build one shared palette from a representative frame so every frame
    # quantizes to the same 128 colors — slashes file size vs per-frame
    # palettes and lets disposal=1 encode only diffs.
    out_path = OUT_DIR / 'deploy-launch.gif'
    palette_src = frames[N_FRAMES // 2].quantize(
        colors=128, method=Image.MEDIANCUT, dither=Image.NONE)
    frames_p = [f.quantize(palette=palette_src, dither=Image.FLOYDSTEINBERG)
                for f in frames]
    frames_p[0].save(
        out_path,
        save_all=True,
        append_images=frames_p[1:],
        duration=int(1000 / FPS),
        loop=0,
        optimize=True,
        disposal=1,
    )
    size_kb = out_path.stat().st_size / 1024
    print(f'GIF saved: {out_path}  ({size_kb:.0f} KB, {GIF_W}x{GIF_H}, looping)')

    # Also save first/middle/last frame as PNGs for review.
    for label, idx in [('start', 0), ('walk', N_FRAMES // 2),
                       ('board', int(FPS * 3.8)),
                       ('takeoff', N_FRAMES - 1)]:
        if 0 <= idx < N_FRAMES:
            frames[idx].save(OUT_DIR / f'frame-{label}-t{idx/FPS:.2f}s.png')


if __name__ == '__main__':
    main()
