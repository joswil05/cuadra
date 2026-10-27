import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

def create_cuadra_icon():
    # Render at 1024x1024 for supersampled anti-aliasing
    size = 1024
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # 1. Subtle drop shadow
    shadow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    s_draw = ImageDraw.Draw(shadow)
    margin = 80
    corner_radius = 210
    s_draw.rounded_rectangle(
        [margin + 10, margin + 25, size - margin - 10, size - margin + 15],
        radius=corner_radius,
        fill=(10, 15, 35, 130)
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(30))
    img.alpha_composite(shadow)

    # 2. Main squircle background with vertical gradient
    gradient = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    g_draw = ImageDraw.Draw(gradient)
    
    # We will draw line by line inside a mask
    mask = Image.new("L", (size, size), 0)
    m_draw = ImageDraw.Draw(mask)
    m_draw.rounded_rectangle(
        [margin, margin, size - margin, size - margin],
        radius=corner_radius,
        fill=255
    )

    for y in range(margin, size - margin):
        ratio = (y - margin) / float(size - 2 * margin)
        # Gradient from vibrant blue (#3564F5) to deep royal blue (#183AA5)
        r = int(53 * (1 - ratio) + 24 * ratio)
        g = int(100 * (1 - ratio) + 58 * ratio)
        b = int(245 * (1 - ratio) + 165 * ratio)
        g_draw.line([(margin, y), (size - margin, y)], fill=(r, g, b, 255))

    gradient.putalpha(mask)
    img.alpha_composite(gradient)

    # 3. Inner border highlight
    border = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    b_draw = ImageDraw.Draw(border)
    b_draw.rounded_rectangle(
        [margin + 2, margin + 2, size - margin - 2, size - margin - 2],
        radius=corner_radius - 2,
        outline=(255, 255, 255, 45),
        width=4
    )
    img.alpha_composite(border)

    # 4. Draw the Cuadra "C" & ledger motif in crisp white & soft cyan
    # Center area is around 512, 512
    # We draw a bold geometric "C" with thick lines and rounded caps
    cx, cy = 512, 512
    outer_r = 230
    thickness = 90
    inner_r = outer_r - thickness

    c_layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    c_draw = ImageDraw.Draw(c_layer)

    # Draw arc for C (from 48 degrees to 312 degrees)
    # Using pieslice trick or polygon
    c_draw.arc(
        [cx - outer_r, cy - outer_r, cx + outer_r, cy + outer_r],
        start=42, end=318,
        fill=(255, 255, 255, 255),
        width=thickness
    )

    # Draw rounded end caps for the "C"
    import math
    for angle in [42, 318]:
        rad = math.radians(angle)
        mid_r = (outer_r + inner_r) / 2.0
        cap_x = cx + mid_r * math.cos(rad)
        cap_y = cy + mid_r * math.sin(rad)
        cap_r = thickness / 2.0
        c_draw.ellipse(
            [cap_x - cap_r, cap_y - cap_r, cap_x + cap_r, cap_y + cap_r],
            fill=(255, 255, 255, 255)
        )

    # In the center right opening of the "C", add a subtle square dot (Cuadra precision badge)
    dot_size = 54
    dot_x = cx + 80
    dot_y = cy
    c_draw.rounded_rectangle(
        [dot_x - dot_size // 2, dot_y - dot_size // 2, dot_x + dot_size // 2, dot_y + dot_size // 2],
        radius=14,
        fill=(110, 155, 255, 255) # accent-light / cyan-blue
    )

    img.alpha_composite(c_layer)

    # 5. Downsample to 512x512 with high quality Lanczos filter
    final_512 = img.resize((512, 512), Image.Resampling.LANCZOS)

    # Ensure build/ directory exists
    os.makedirs("build", exist_ok=True)

    # Save 512x512 PNG
    final_512.save("build/icon.png", format="PNG")
    print("Saved build/icon.png (512x512)")

    # Save multi-resolution ICO for Windows
    ico_sizes = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    final_512.save("build/icon.ico", format="ICO", sizes=ico_sizes)
    print("Saved build/icon.ico (with sizes 16, 24, 32, 48, 64, 128, 256)")

if __name__ == "__main__":
    create_cuadra_icon()
