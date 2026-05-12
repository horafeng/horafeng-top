import heapq
import json
import math
import struct
import sys
from pathlib import Path

from PIL import Image

SH_C0 = 0.28209479177387814
DEFAULT_INPUT = Path(r"D:\MLSharp_3D_Maker\MLSharp-3D-Maker-by-GemosDodo\temp_workspace\4e8add0f\output.ply")
DEFAULT_IMAGE = Path(r"D:\素材\室内.jpg")
DEFAULT_OUTPUT = Path(r"D:\Horafeng.top\assets\models\interior-mlsharp-splats.bin")
DEFAULT_META = Path(r"D:\Horafeng.top\assets\models\interior-mlsharp-splats.json")
TARGET_COUNT = 480000
MIN_OPACITY = 0.025
RECORD_FLOATS = 15
INTRINSIC = {
    "width": 3840,
    "height": 2160,
    "fx": 3054.882568359375,
    "fy": 3054.882568359375,
    "cx": 1920,
    "cy": 1080,
}


def sigmoid(value):
    return 1 / (1 + math.exp(-value))


def clamp01(value):
    return min(1.0, max(0.0, value))


def parse_header(data):
    marker = b"end_header"
    header_end = data.find(marker)
    if header_end < 0:
        raise RuntimeError("PLY header not found")

    body_start = header_end + len(marker)
    while data[body_start : body_start + 1] in (b"\r", b"\n"):
        body_start += 1

    type_size = {
        "float": 4,
        "float32": 4,
        "double": 8,
        "uchar": 1,
        "uint8": 1,
        "char": 1,
        "int": 4,
        "uint": 4,
    }
    offsets = {}
    props = []
    current = ""
    vertex_count = 0

    for raw in data[:header_end].decode("ascii", errors="ignore").splitlines():
        parts = raw.strip().split()
        if not parts:
            continue
        if parts[0] == "element":
            current = parts[1]
            if current == "vertex":
                vertex_count = int(parts[2])
            continue
        if parts[0] == "property" and current == "vertex":
            props.append((parts[-1], type_size.get(parts[1], 4)))

    stride = 0
    for name, size in props:
        offsets[name] = stride
        stride += size

    required = [
        "x",
        "y",
        "z",
        "f_dc_0",
        "f_dc_1",
        "f_dc_2",
        "opacity",
        "scale_0",
        "scale_1",
        "scale_2",
        "rot_0",
        "rot_1",
        "rot_2",
        "rot_3",
    ]
    missing = [name for name in required if name not in offsets]
    if missing:
        raise RuntimeError(f"PLY properties missing: {', '.join(missing)}")

    return body_start, vertex_count, stride, offsets


def unpack_vertex(data, base, offsets):
    x = struct.unpack_from("<f", data, base + offsets["x"])[0]
    y = struct.unpack_from("<f", data, base + offsets["y"])[0]
    z = struct.unpack_from("<f", data, base + offsets["z"])[0]
    opacity = sigmoid(struct.unpack_from("<f", data, base + offsets["opacity"])[0])
    scale0 = math.exp(struct.unpack_from("<f", data, base + offsets["scale_0"])[0])
    scale1 = math.exp(struct.unpack_from("<f", data, base + offsets["scale_1"])[0])
    scale2 = math.exp(struct.unpack_from("<f", data, base + offsets["scale_2"])[0])
    ply_color = (
        clamp01(0.5 + SH_C0 * struct.unpack_from("<f", data, base + offsets["f_dc_0"])[0]),
        clamp01(0.5 + SH_C0 * struct.unpack_from("<f", data, base + offsets["f_dc_1"])[0]),
        clamp01(0.5 + SH_C0 * struct.unpack_from("<f", data, base + offsets["f_dc_2"])[0]),
    )

    return {
        "x": x,
        "y": y,
        "z": z,
        "opacity": opacity,
        "scale": (scale0, scale1, scale2),
        "rot": (
            struct.unpack_from("<f", data, base + offsets["rot_1"])[0],
            struct.unpack_from("<f", data, base + offsets["rot_2"])[0],
            struct.unpack_from("<f", data, base + offsets["rot_3"])[0],
            struct.unpack_from("<f", data, base + offsets["rot_0"])[0],
        ),
        "ply_color": ply_color,
    }


def priority(vertex, index):
    random = math.sin(index * 12.9898 + 78.233) * 43758.5453
    random = random - math.floor(random)
    scale_max = max(vertex["scale"])
    scale_boost = min(1.7, math.sqrt(max(scale_max, 0.0001)) * 9)
    return vertex["opacity"] * (0.74 + random * 0.42) * (0.75 + scale_boost * 0.32)


def sample_source_color(image, vertex):
    z = max(vertex["z"], 0.001)
    px = INTRINSIC["fx"] * vertex["x"] / z + INTRINSIC["cx"]
    py = INTRINSIC["fy"] * vertex["y"] / z + INTRINSIC["cy"]
    sx = px * image.width / INTRINSIC["width"]
    sy = py * image.height / INTRINSIC["height"]

    if sx < 0 or sy < 0 or sx >= image.width or sy >= image.height:
        return vertex["ply_color"]

    ix = min(image.width - 1, max(0, int(round(sx))))
    iy = min(image.height - 1, max(0, int(round(sy))))
    r, g, b = image.getpixel((ix, iy))[:3]
    source = (r / 255, g / 255, b / 255)

    # Blend a little PLY color back in so reflective/high-opacity splats still
    # retain the MLSharp reconstruction character instead of becoming flat texels.
    return tuple(clamp01(source[i] * 0.86 + vertex["ply_color"][i] * 0.14) for i in range(3))


def main():
    ply_path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_INPUT
    image_path = Path(sys.argv[2]) if len(sys.argv) > 2 else DEFAULT_IMAGE
    output_path = Path(sys.argv[3]) if len(sys.argv) > 3 else DEFAULT_OUTPUT
    meta_path = Path(sys.argv[4]) if len(sys.argv) > 4 else DEFAULT_META

    data = ply_path.read_bytes()
    image = Image.open(image_path).convert("RGB")
    body_start, vertex_count, stride, offsets = parse_header(data)
    heap = []

    for index in range(vertex_count):
        base = body_start + index * stride
        vertex = unpack_vertex(data, base, offsets)
        finite = (
            math.isfinite(vertex["x"])
            and math.isfinite(vertex["y"])
            and math.isfinite(vertex["z"])
            and all(math.isfinite(value) for value in vertex["scale"])
        )
        if not finite or vertex["opacity"] < MIN_OPACITY:
            continue

        item = (priority(vertex, index), index, vertex)
        if len(heap) < TARGET_COUNT:
            heapq.heappush(heap, item)
        elif item[0] > heap[0][0]:
            heapq.heapreplace(heap, item)

    selected = sorted(heap, key=lambda item: item[1])
    floats = []
    bounds = {"min": [math.inf, math.inf, math.inf], "max": [-math.inf, -math.inf, -math.inf]}

    for _, index, vertex in selected:
        color = sample_source_color(image, vertex)
        seed = math.sin(index * 3.17) * 43758.5453
        seed = seed - math.floor(seed)
        floats.extend(
            [
                vertex["x"],
                vertex["y"],
                vertex["z"],
                *vertex["rot"],
                *vertex["scale"],
                *color,
                vertex["opacity"],
                seed,
            ]
        )

        bounds["min"][0] = min(bounds["min"][0], vertex["x"])
        bounds["min"][1] = min(bounds["min"][1], vertex["y"])
        bounds["min"][2] = min(bounds["min"][2], vertex["z"])
        bounds["max"][0] = max(bounds["max"][0], vertex["x"])
        bounds["max"][1] = max(bounds["max"][1], vertex["y"])
        bounds["max"][2] = max(bounds["max"][2], vertex["z"])

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("wb") as file:
        file.write(struct.pack(f"<{len(floats)}f", *floats))

    meta = {
        "source": "MLSharp_3D_Maker output.ply with source-image projected color",
        "input": str(ply_path),
        "image": str(image_path),
        "count": len(selected),
        "recordFloats": RECORD_FLOATS,
        "minOpacity": MIN_OPACITY,
        "bounds": bounds,
        "intrinsic": INTRINSIC,
    }
    meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Converted {len(selected)} splats with projected source colors -> {output_path}")


if __name__ == "__main__":
    main()
