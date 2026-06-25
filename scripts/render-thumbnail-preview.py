"""Render Studio-preset thumbnail preview PNG (1280x720)."""
from PIL import Image, ImageDraw, ImageFont

W, H = 1280, 720
SRC = "0610.png"
OUT = "thumbnail-preview-capture.png"

# brand.md
ACCENT = (236, 106, 55)
HEADLINE = (47, 42, 36)
SUBLINE = (120, 148, 100)
LINEN = (251, 248, 243)
CLOUD = (245, 242, 236)
BORDER = (217, 209, 199)

img = Image.open(SRC).convert("RGB")
iw, ih = img.size
target_ratio = W / H
src_ratio = iw / ih
if src_ratio > target_ratio:
    nh = ih
    nw = int(ih * target_ratio)
    left = (iw - nw) // 2
    img = img.crop((left, 0, left + nw, ih))
else:
    nw = iw
    nh = int(iw / target_ratio)
    top = (ih - nh) // 2
    img = img.crop((0, top, iw, top + nh))
img = img.resize((W, H), Image.Resampling.LANCZOS)

canvas = img.copy()
overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
draw_ov = ImageDraw.Draw(overlay)
for x in range(W):
    t = x / W
    if t < 0.44:
        a = 0
    elif t < 0.62:
        a = int(125 * (t - 0.44) / 0.18)
    elif t < 0.90:
        a = int(125 + 51 * (t - 0.62) / 0.28)
    else:
        a = 176
    draw_ov.line([(x, 0), (x, H)], fill=(*LINEN, a) if t < 0.75 else (*CLOUD, a))
canvas = Image.alpha_composite(canvas.convert("RGBA"), overlay).convert("RGB")
draw = ImageDraw.Draw(canvas)

try:
    font_ep = ImageFont.truetype("arialbd.ttf", 28)
    font_hl = ImageFont.truetype("arialbd.ttf", 72)
    font_sl = ImageFont.truetype("arial.ttf", 34)
except OSError:
    font_ep = ImageFont.load_default()
    font_hl = ImageFont.load_default()
    font_sl = ImageFont.load_default()

# badge
ep = "VIDEO"
bbox = draw.textbbox((0, 0), ep, font=font_ep)
ep_w = bbox[2] - bbox[0] + 24
ep_h = bbox[3] - bbox[1] + 16
ep_x, ep_y = 45, 43
draw.rectangle([ep_x, ep_y, ep_x + ep_w, ep_y + ep_h], fill=ACCENT)
draw.text((ep_x + 12, ep_y + 6), ep, fill=(255, 255, 255), font=font_ep)

# text panel (right)
panel_x = int(W * 0.48)
panel_y = int(H * 0.28)
panel_w = int(W * 0.48)
panel_h = int(H * 0.58)
panel = Image.new("RGBA", (panel_w, panel_h), (*LINEN, 224))
panel_draw = ImageDraw.Draw(panel)
panel_draw.rounded_rectangle([0, 0, panel_w - 1, panel_h - 1], radius=12, outline=(*BORDER, 230), width=2)
canvas.paste(panel, (panel_x, panel_y), panel)

tx = panel_x + panel_w - 48
ty = panel_y + 36
rule_w, rule_h = 72, 5
draw.rectangle([tx - rule_w, ty, tx, ty + rule_h], fill=ACCENT)

lines = ["Deine Headline", "hier"]
y = ty + rule_h + 18
for line in lines:
    bbox = draw.textbbox((0, 0), line, font=font_hl)
    tw = bbox[2] - bbox[0]
    draw.text((tx - tw, y), line, fill=HEADLINE, font=font_hl)
    y += 82

sl = "Untertitel · Thema"
bbox = draw.textbbox((0, 0), sl, font=font_sl)
tw = bbox[2] - bbox[0]
draw.text((tx - tw, y + 12), sl, fill=SUBLINE, font=font_sl)

canvas.save(OUT, "PNG")
print(OUT)
