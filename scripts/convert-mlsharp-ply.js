#!/usr/bin/env node

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const SH_C0 = 0.28209479177387814;
const DEFAULT_INPUT = "D:/MLSharp_3D_Maker/MLSharp-3D-Maker-by-GemosDodo/temp_workspace/4e8add0f/output.ply";
const DEFAULT_OUTPUT = "D:/Horafeng.top/assets/models/interior-mlsharp-splats.bin";
const DEFAULT_META = "D:/Horafeng.top/assets/models/interior-mlsharp-splats.json";
const TARGET_COUNT = 480000;
const MIN_OPACITY = 0.025;
const RECORD_FLOATS = 15;

const input = process.argv[2] || DEFAULT_INPUT;
const output = process.argv[3] || DEFAULT_OUTPUT;
const metaOutput = process.argv[4] || DEFAULT_META;

function sigmoid(value) {
  return 1 / (1 + Math.exp(-value));
}

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

function parseHeader(buffer) {
  const marker = Buffer.from("end_header");
  const headerEnd = buffer.indexOf(marker);
  if (headerEnd < 0) {
    throw new Error("PLY header not found");
  }

  let bodyStart = headerEnd + marker.length;
  while (buffer[bodyStart] === 10 || buffer[bodyStart] === 13) {
    bodyStart += 1;
  }

  const header = buffer.subarray(0, headerEnd).toString("ascii").split(/\r?\n/);
  const typeSize = new Map([
    ["float", 4],
    ["float32", 4],
    ["double", 8],
    ["uchar", 1],
    ["uint8", 1],
    ["char", 1],
    ["int", 4],
    ["uint", 4],
  ]);

  let currentElement = "";
  let vertexCount = 0;
  let currentOffset = 0;
  let stride = 0;
  const offsets = {};

  for (const line of header) {
    const parts = line.trim().split(/\s+/);
    if (!parts[0]) {
      continue;
    }
    if (parts[0] === "element") {
      if (currentElement === "vertex") {
        stride = currentOffset;
      }
      currentElement = parts[1];
      currentOffset = 0;
      if (currentElement === "vertex") {
        vertexCount = Number.parseInt(parts[2], 10);
      }
      continue;
    }
    if (parts[0] === "property") {
      const size = typeSize.get(parts[1]) || 4;
      if (currentElement === "vertex") {
        offsets[parts[parts.length - 1]] = currentOffset;
      }
      currentOffset += size;
    }
  }

  if (currentElement === "vertex") {
    stride = currentOffset;
  }

  for (const name of ["x", "y", "z", "f_dc_0", "f_dc_1", "f_dc_2", "opacity", "scale_0", "scale_1", "scale_2", "rot_0", "rot_1", "rot_2", "rot_3"]) {
    if (offsets[name] === undefined) {
      throw new Error(`PLY property missing: ${name}`);
    }
  }

  return { bodyStart, vertexCount, stride, offsets };
}

function readVertex(buffer, base, offsets) {
  const opacity = sigmoid(buffer.readFloatLE(base + offsets.opacity));
  const scale0 = Math.exp(buffer.readFloatLE(base + offsets.scale_0));
  const scale1 = Math.exp(buffer.readFloatLE(base + offsets.scale_1));
  const scale2 = Math.exp(buffer.readFloatLE(base + offsets.scale_2));
  const color0 = clamp01(0.5 + SH_C0 * buffer.readFloatLE(base + offsets.f_dc_0));
  const color1 = clamp01(0.5 + SH_C0 * buffer.readFloatLE(base + offsets.f_dc_1));
  const color2 = clamp01(0.5 + SH_C0 * buffer.readFloatLE(base + offsets.f_dc_2));

  return {
    x: buffer.readFloatLE(base + offsets.x),
    y: buffer.readFloatLE(base + offsets.y),
    z: buffer.readFloatLE(base + offsets.z),
    color0,
    color1,
    color2,
    opacity,
    scale0,
    scale1,
    scale2,
    rot0: buffer.readFloatLE(base + offsets.rot_0),
    rot1: buffer.readFloatLE(base + offsets.rot_1),
    rot2: buffer.readFloatLE(base + offsets.rot_2),
    rot3: buffer.readFloatLE(base + offsets.rot_3),
  };
}

function priorityFor(vertex, index) {
  const hash = Math.sin(index * 12.9898 + 78.233) * 43758.5453;
  const random = hash - Math.floor(hash);
  const scaleMax = Math.max(vertex.scale0, vertex.scale1, vertex.scale2);
  const scaleBoost = Math.min(1.7, Math.sqrt(Math.max(scaleMax, 0.0001)) * 9);
  return vertex.opacity * (0.74 + random * 0.42) * (0.75 + scaleBoost * 0.32);
}

function insertTopCandidate(top, candidate) {
  if (top.length < TARGET_COUNT) {
    top.push(candidate);
    if (top.length === TARGET_COUNT) {
      top.sort((a, b) => a.score - b.score);
    }
    return;
  }

  if (candidate.score <= top[0].score) {
    return;
  }

  top[0] = candidate;
  let index = 0;
  while (true) {
    const left = index * 2 + 1;
    const right = left + 1;
    let smallest = index;
    if (left < top.length && top[left].score < top[smallest].score) {
      smallest = left;
    }
    if (right < top.length && top[right].score < top[smallest].score) {
      smallest = right;
    }
    if (smallest === index) {
      break;
    }
    const temp = top[index];
    top[index] = top[smallest];
    top[smallest] = temp;
    index = smallest;
  }
}

const plyBuffer = readFileSync(input);
const { bodyStart, vertexCount, stride, offsets } = parseHeader(plyBuffer);
const top = [];

for (let index = 0; index < vertexCount; index += 1) {
  const base = bodyStart + index * stride;
  const vertex = readVertex(plyBuffer, base, offsets);
  const finite =
    Number.isFinite(vertex.x) &&
    Number.isFinite(vertex.y) &&
    Number.isFinite(vertex.z) &&
    Number.isFinite(vertex.scale0) &&
    Number.isFinite(vertex.scale1) &&
    Number.isFinite(vertex.scale2);

  if (!finite || vertex.opacity < MIN_OPACITY) {
    continue;
  }

  insertTopCandidate(top, { index, score: priorityFor(vertex, index), vertex });
}

top.sort((a, b) => a.index - b.index);

const floats = new Float32Array(top.length * RECORD_FLOATS);
const bounds = {
  min: [Infinity, Infinity, Infinity],
  max: [-Infinity, -Infinity, -Infinity],
};

top.forEach(({ index, vertex }, itemIndex) => {
  const offset = itemIndex * RECORD_FLOATS;
  floats[offset] = vertex.x;
  floats[offset + 1] = vertex.y;
  floats[offset + 2] = vertex.z;
  floats[offset + 3] = vertex.rot1;
  floats[offset + 4] = vertex.rot2;
  floats[offset + 5] = vertex.rot3;
  floats[offset + 6] = vertex.rot0;
  floats[offset + 7] = vertex.scale0;
  floats[offset + 8] = vertex.scale1;
  floats[offset + 9] = vertex.scale2;
  floats[offset + 10] = vertex.color0;
  floats[offset + 11] = vertex.color1;
  floats[offset + 12] = vertex.color2;
  floats[offset + 13] = vertex.opacity;
  floats[offset + 14] = (Math.sin(index * 3.17) * 43758.5453) % 1;

  bounds.min[0] = Math.min(bounds.min[0], vertex.x);
  bounds.min[1] = Math.min(bounds.min[1], vertex.y);
  bounds.min[2] = Math.min(bounds.min[2], vertex.z);
  bounds.max[0] = Math.max(bounds.max[0], vertex.x);
  bounds.max[1] = Math.max(bounds.max[1], vertex.y);
  bounds.max[2] = Math.max(bounds.max[2], vertex.z);
});

mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, Buffer.from(floats.buffer));
writeFileSync(
  metaOutput,
  `${JSON.stringify(
    {
      source: "MLSharp_3D_Maker output.ply",
      input,
      count: top.length,
      recordFloats: RECORD_FLOATS,
      minOpacity: MIN_OPACITY,
      bounds,
      intrinsic: {
        width: 3840,
        height: 2160,
        fx: 3054.882568359375,
        fy: 3054.882568359375,
        cx: 1920,
        cy: 1080,
      },
    },
    null,
    2,
  )}\n`,
);

console.log(`Converted ${top.length} splats -> ${output}`);
