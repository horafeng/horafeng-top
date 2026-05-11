const reduceMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

const MODEL_VERSION = "source-color-20260511a";
const MODEL_URL = `assets/models/interior-mlsharp-splats.bin?v=${MODEL_VERSION}`;
const MODEL_META_URL = `assets/models/interior-mlsharp-splats.json?v=${MODEL_VERSION}`;
const RECORD_FLOATS = 15;
const TOP_REASSEMBLE_THRESHOLD = 84;
const ASSEMBLE_DURATION_MS = 2800;
const COPY_LINES = ["\u6b22\u8fce\u6765\u5230\u6211\u7684\u535a\u5ba2", "\u79c1\u306e\u30d6\u30ed\u30b0\u3078\u3088\u3046\u3053\u305d", "Welcome to my blog"];
const COPY_TYPE_DELAY_MS = 120;
const COPY_DELETE_DELAY_MS = 70;
const COPY_HOLD_MS = 3600;

let copyTypingTimer = null;
let copyTypingStarted = false;

const vertexShaderSource = `
precision highp float;

attribute vec2 a_corner;
attribute vec3 a_position;
attribute vec4 a_rotation;
attribute vec3 a_scale;
attribute vec4 a_color;
attribute float a_seed;

uniform float u_time;
uniform float u_progress;
uniform float u_chaos;
uniform float u_viewAspect;
uniform float u_imageAspect;
uniform float u_splatScale;
uniform float u_flowAmp;
uniform float u_flowFreq;
uniform float u_flowSpeed;
uniform float u_near;
uniform float u_far;
uniform float u_fx;
uniform float u_fy;
uniform float u_cx;
uniform float u_cy;
uniform float u_imageWidth;
uniform float u_imageHeight;

varying vec2 v_corner;
varying vec4 v_color;
varying float v_depthFade;

float hash(float n) {
  return fract(sin(n) * 43758.5453123);
}

float easeOutCubic(float t) {
  float p = 1.0 - clamp(t, 0.0, 1.0);
  return 1.0 - p * p * p;
}

vec3 quatRotate(vec4 q, vec3 v) {
  q = normalize(q);
  return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v);
}

vec3 curl(vec3 p, float t, float freq) {
  vec3 p1 = p * freq + vec3(t * 0.5, t * 0.3, t * 0.2);
  vec3 p2 = p * freq * 2.0 - vec3(t, t, t);

  vec3 a = vec3(
    sin(p1.y) + cos(p1.z),
    sin(p1.z) + cos(p1.x),
    sin(p1.x) + cos(p1.y)
  );
  vec3 b = vec3(
    sin(p2.y) + cos(p2.z),
    sin(p2.z) + cos(p2.x),
    sin(p2.x) + cos(p2.y)
  );
  return a + b * 0.5;
}

vec4 projectCamera(vec3 p) {
  float z = max(p.z, u_near + 0.02);
  float xClip = (2.0 * u_fx / u_imageWidth) * p.x + (2.0 * u_cx / u_imageWidth - 1.0) * z;
  float yClip = (-2.0 * u_fy / u_imageHeight) * p.y + (1.0 - 2.0 * u_cy / u_imageHeight) * z;
  float zClip = ((u_far + u_near) / (u_far - u_near)) * z - (2.0 * u_far * u_near) / (u_far - u_near);
  vec4 clip = vec4(xClip, yClip, zClip, z);
  vec2 ndc = clip.xy / clip.w;

  if (u_viewAspect > u_imageAspect) {
    ndc.y *= u_viewAspect / u_imageAspect;
  } else {
    ndc.x *= u_imageAspect / u_viewAspect;
  }

  clip.xy = ndc * clip.w;
  return clip;
}

void main() {
  float seed = a_seed * 997.0 + a_position.x * 0.37 + a_position.y * 0.73 + a_position.z * 0.19;
  float progress = easeOutCubic(u_progress);
  float chaos = clamp(u_chaos, 0.0, 1.0);

  vec3 randomDir = normalize(vec3(
    sin(seed * 12.371 + 0.7),
    cos(seed * 8.153 + 1.9),
    sin(seed * 4.977 + 3.1)
  ));

  vec3 calmFlow = curl(a_position, u_time * 0.42, 0.16) * max(a_position.z, 4.0) * 0.0038;
  vec3 livelyFlow = curl(a_position, u_time * u_flowSpeed, u_flowFreq) * u_flowAmp;
  float scatterRadius = mix(18.0, 54.0, hash(seed + 2.0));
  vec3 scattered = a_position + randomDir * scatterRadius * vec3(1.25, 0.82, 0.78) + livelyFlow * 0.64;
  scattered.z = max(scattered.z, 1.2);

  vec3 settled = a_position + calmFlow;
  vec3 assembled = mix(scattered, settled, progress);
  vec3 chaotic = a_position + randomDir * scatterRadius * 0.62 + livelyFlow * (0.72 + hash(seed + 5.0) * 0.42);
  chaotic.z = max(chaotic.z, 1.2);

  vec3 centerPos = mix(assembled, chaotic, chaos);
  vec3 local = quatRotate(a_rotation, vec3(a_corner * a_scale.xy * u_splatScale, 0.0));
  vec3 world = centerPos + local;

  gl_Position = projectCamera(world);

  v_corner = a_corner;
  float shimmer = 0.96 + 0.04 * sin(u_time * 0.85 + seed * 11.0);
  vec3 sourceColor = clamp(a_color.rgb, 0.0, 1.0);
  float luma = dot(sourceColor, vec3(0.2126, 0.7152, 0.0722));
  float saturation = mix(1.36, 2.05, progress) * mix(1.0, 0.92, chaos);
  vec3 colorized = clamp(mix(vec3(luma), sourceColor, saturation), 0.0, 1.0);
  v_color = vec4(colorized * shimmer * mix(1.16, 1.34, progress), a_color.a * mix(0.86, 1.08, progress) * mix(1.0, 0.62, chaos));
  v_depthFade = smoothstep(0.6, 3.4, a_position.z);
}
`;

const fragmentShaderSource = `
precision highp float;

varying vec2 v_corner;
varying vec4 v_color;
varying float v_depthFade;

void main() {
  float dist2 = dot(v_corner, v_corner);
  if (dist2 > 1.0) {
    discard;
  }

  float core = exp(-dist2 * 2.15);
  float glow = exp(-dist2 * 4.8);
  float alpha = (core * 0.94 + glow * 0.28) * v_color.a * v_depthFade;
  if (alpha < 0.025) {
    discard;
  }

  vec3 color = v_color.rgb * (0.96 + glow * 0.2);
  gl_FragColor = vec4(color, alpha);
}
`;

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) || "Unable to compile shader");
  }
  return shader;
}

function createProgram(gl) {
  const program = gl.createProgram();
  gl.attachShader(program, compileShader(gl, gl.VERTEX_SHADER, vertexShaderSource));
  gl.attachShader(program, compileShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) || "Unable to link shader program");
  }
  return program;
}

function getInstancing(gl) {
  const extension = gl.getExtension("ANGLE_instanced_arrays");
  if (!extension) {
    throw new Error("ANGLE_instanced_arrays is unavailable");
  }

  return {
    vertexAttribDivisor: extension.vertexAttribDivisorANGLE.bind(extension),
    drawArraysInstanced: extension.drawArraysInstancedANGLE.bind(extension),
  };
}

function setupAttribute(gl, program, name, size, stride, offset, instancing, divisor = 0) {
  const location = gl.getAttribLocation(program, name);
  if (location < 0) {
    return;
  }

  gl.enableVertexAttribArray(location);
  gl.vertexAttribPointer(location, size, gl.FLOAT, false, stride, offset);
  instancing.vertexAttribDivisor(location, divisor);
}

function getChaosFromScroll() {
  const stage = document.querySelector(".home-stage");
  const height = Math.max(stage?.offsetHeight || window.innerHeight, 1);
  return Math.min(1, Math.max(0, (window.scrollY - TOP_REASSEMBLE_THRESHOLD) / (height * 0.5)));
}

function startGaussianCopyTyping() {
  if (copyTypingStarted) {
    return;
  }

  const element = document.querySelector("[data-home-gaussian-typing]");
  if (!element) {
    return;
  }

  copyTypingStarted = true;
  window.clearTimeout(copyTypingTimer);

  if (reduceMotionQuery.matches) {
    element.textContent = COPY_LINES[0];
    return;
  }

  let lineIndex = 0;
  let charIndex = 0;
  let deleting = false;

  const tick = () => {
    const line = COPY_LINES[lineIndex];
    if (!deleting) {
      charIndex = Math.min(line.length, charIndex + 1);
      element.textContent = line.slice(0, charIndex);
      if (charIndex >= line.length) {
        deleting = true;
        copyTypingTimer = window.setTimeout(tick, COPY_HOLD_MS);
        return;
      }
      copyTypingTimer = window.setTimeout(tick, COPY_TYPE_DELAY_MS);
      return;
    }

    charIndex = Math.max(0, charIndex - 1);
    element.textContent = line.slice(0, charIndex);
    if (charIndex <= 0) {
      deleting = false;
      lineIndex = (lineIndex + 1) % COPY_LINES.length;
      copyTypingTimer = window.setTimeout(tick, 220);
      return;
    }
    copyTypingTimer = window.setTimeout(tick, COPY_DELETE_DELAY_MS);
  };

  tick();
}

async function loadSplatModel() {
  const [metaResponse, dataResponse] = await Promise.all([fetch(MODEL_META_URL), fetch(MODEL_URL)]);
  if (!metaResponse.ok || !dataResponse.ok) {
    throw new Error("Unable to load MLSharp splat assets");
  }

  const meta = await metaResponse.json();
  const buffer = await dataResponse.arrayBuffer();
  const recordFloats = meta.recordFloats || RECORD_FLOATS;
  const recordBytes = recordFloats * 4;

  if (buffer.byteLength % recordBytes !== 0) {
    throw new Error("Unexpected MLSharp splat buffer size");
  }

  return {
    meta,
    data: new Float32Array(buffer),
    count: buffer.byteLength / recordBytes,
    recordFloats,
  };
}

function initGaussianScene() {
  const scene = document.querySelector("[data-home-gaussian]");
  const canvas = document.querySelector("[data-home-gaussian-canvas]");
  if (!scene || !canvas) {
    return;
  }

  document.body.classList.add("gaussian-home-enabled");

  if (reduceMotionQuery.matches) {
    document.body.classList.add("gaussian-reduced-motion", "gaussian-text-ready");
    startGaussianCopyTyping();
    return;
  }

  const gl = canvas.getContext("webgl", {
    alpha: true,
    antialias: false,
    depth: true,
    powerPreference: "high-performance",
    premultipliedAlpha: false,
  });

  if (!gl) {
    document.body.classList.add("gaussian-fallback-ready", "gaussian-text-ready");
    startGaussianCopyTyping();
    return;
  }

  let instancing;
  let program;
  try {
    instancing = getInstancing(gl);
    program = createProgram(gl);
  } catch (error) {
    console.warn("[home-gaussian]", error);
    document.body.classList.add("gaussian-fallback-ready", "gaussian-text-ready");
    startGaussianCopyTyping();
    return;
  }

  const uniforms = {
    time: gl.getUniformLocation(program, "u_time"),
    progress: gl.getUniformLocation(program, "u_progress"),
    chaos: gl.getUniformLocation(program, "u_chaos"),
    viewAspect: gl.getUniformLocation(program, "u_viewAspect"),
    imageAspect: gl.getUniformLocation(program, "u_imageAspect"),
    splatScale: gl.getUniformLocation(program, "u_splatScale"),
    flowAmp: gl.getUniformLocation(program, "u_flowAmp"),
    flowFreq: gl.getUniformLocation(program, "u_flowFreq"),
    flowSpeed: gl.getUniformLocation(program, "u_flowSpeed"),
    near: gl.getUniformLocation(program, "u_near"),
    far: gl.getUniformLocation(program, "u_far"),
    fx: gl.getUniformLocation(program, "u_fx"),
    fy: gl.getUniformLocation(program, "u_fy"),
    cx: gl.getUniformLocation(program, "u_cx"),
    cy: gl.getUniformLocation(program, "u_cy"),
    imageWidth: gl.getUniformLocation(program, "u_imageWidth"),
    imageHeight: gl.getUniformLocation(program, "u_imageHeight"),
  };

  const state = {
    count: 0,
    startTime: performance.now(),
    assembleStartedAt: performance.now(),
    lastTopState: window.scrollY <= TOP_REASSEMBLE_THRESHOLD,
    chaos: getChaosFromScroll(),
    targetChaos: getChaosFromScroll(),
    frame: 0,
    dpr: 1,
    intrinsic: {
      width: 3840,
      height: 2160,
      fx: 3054.882568359375,
      fy: 3054.882568359375,
      cx: 1920,
      cy: 1080,
    },
  };

  const resize = () => {
    state.dpr = Math.min(window.devicePixelRatio || 1, window.innerWidth < 768 ? 1.2 : 1.6);
    const width = Math.max(1, Math.floor(window.innerWidth * state.dpr));
    const height = Math.max(1, Math.floor(window.innerHeight * state.dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, width, height);
    }
  };

  const markTextReady = () => {
    window.setTimeout(() => {
      document.body.classList.add("gaussian-text-ready");
      startGaussianCopyTyping();
    }, 1500);
  };

  const handleScroll = () => {
    state.targetChaos = getChaosFromScroll();
    const isAtTop = window.scrollY <= TOP_REASSEMBLE_THRESHOLD;
    if (isAtTop && !state.lastTopState) {
      state.assembleStartedAt = performance.now();
      document.body.classList.remove("gaussian-text-ready");
      markTextReady();
    }
    state.lastTopState = isAtTop;
    document.body.classList.toggle("gaussian-chaos-mode", !isAtTop);
  };

  const render = (now) => {
    state.frame = window.requestAnimationFrame(render);
    resize();
    state.chaos += (state.targetChaos - state.chaos) * 0.055;

    const intrinsic = state.intrinsic;
    const elapsed = (now - state.startTime) / 1000;
    const progress = Math.min(1, (now - state.assembleStartedAt) / ASSEMBLE_DURATION_MS);
    const viewAspect = window.innerWidth / Math.max(window.innerHeight, 1);
    const imageAspect = intrinsic.width / intrinsic.height;
    const mobile = window.innerWidth < 768;

    if (progress > 0.58 && !document.body.classList.contains("gaussian-text-ready")) {
      document.body.classList.add("gaussian-text-ready");
      startGaussianCopyTyping();
    }

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(program);
    gl.uniform1f(uniforms.time, elapsed);
    gl.uniform1f(uniforms.progress, progress);
    gl.uniform1f(uniforms.chaos, state.chaos);
    gl.uniform1f(uniforms.viewAspect, viewAspect);
    gl.uniform1f(uniforms.imageAspect, imageAspect);
    gl.uniform1f(uniforms.splatScale, mobile ? 3.1 : 2.65);
    gl.uniform1f(uniforms.flowAmp, mobile ? 5.2 : 8.0);
    gl.uniform1f(uniforms.flowFreq, 0.28);
    gl.uniform1f(uniforms.flowSpeed, 0.58);
    gl.uniform1f(uniforms.near, 0.2);
    gl.uniform1f(uniforms.far, 180.0);
    gl.uniform1f(uniforms.fx, intrinsic.fx);
    gl.uniform1f(uniforms.fy, intrinsic.fy);
    gl.uniform1f(uniforms.cx, intrinsic.cx);
    gl.uniform1f(uniforms.cy, intrinsic.cy);
    gl.uniform1f(uniforms.imageWidth, intrinsic.width);
    gl.uniform1f(uniforms.imageHeight, intrinsic.height);

    instancing.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, state.count);
  };

  const cornerBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, cornerBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  setupAttribute(gl, program, "a_corner", 2, 2 * 4, 0, instancing, 0);

  loadSplatModel()
    .then(({ meta, data, count, recordFloats }) => {
      const recordBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, recordBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);

      const stride = recordFloats * 4;
      setupAttribute(gl, program, "a_position", 3, stride, 0, instancing, 1);
      setupAttribute(gl, program, "a_rotation", 4, stride, 3 * 4, instancing, 1);
      setupAttribute(gl, program, "a_scale", 3, stride, 7 * 4, instancing, 1);
      setupAttribute(gl, program, "a_color", 4, stride, 10 * 4, instancing, 1);
      setupAttribute(gl, program, "a_seed", 1, stride, 14 * 4, instancing, 1);

      if (meta?.intrinsic) {
        state.intrinsic = meta.intrinsic;
      }

      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.depthMask(true);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

      state.count = count;
      document.body.classList.add("gaussian-webgl-ready");
      markTextReady();
      handleScroll();
      resize();
      state.frame = window.requestAnimationFrame(render);
    })
    .catch((error) => {
      console.warn("[home-gaussian]", error);
      document.body.classList.add("gaussian-fallback-ready", "gaussian-text-ready");
      startGaussianCopyTyping();
    });

  window.addEventListener("resize", resize, { passive: true });
  window.addEventListener("scroll", handleScroll, { passive: true });
  window.addEventListener("pagehide", () => window.cancelAnimationFrame(state.frame), { once: true });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initGaussianScene, { once: true });
} else {
  initGaussianScene();
}
