// All anchors share the same physical scale, even when a gesture has a wider source.
const motionAspect = 1.2;
function presenterRect(width, height, sourceAspect) {
  const h = Math.min(height, width / Math.max(motionAspect, sourceAspect));
  const w = h * sourceAspect;
  return { left: (width - w) / 2, top: (height - h) * 0.8, width: w, height: h };
}
function fitPresenter(canvas, source, maxHeight) {
  const aspect = (source.videoWidth || source.naturalWidth) / (source.videoHeight || source.naturalHeight);
  if (!aspect || !canvas.clientWidth || !canvas.clientHeight) return null;
  const scale = Math.min(devicePixelRatio, maxHeight / canvas.clientHeight, 2560 / canvas.clientWidth);
  const width = Math.max(1, Math.round(canvas.clientWidth * scale));
  const height = Math.max(1, Math.round(canvas.clientHeight * scale));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  return presenterRect(width, height, aspect);
}
function createKeyer(canvas) {
  const gl = canvas.getContext("webgl", {
    alpha: true,
    premultipliedAlpha: false,
    antialias: false,
  });
  if (gl) {
    const program = gl.createProgram();
    const shaders = [
      [
        gl.VERTEX_SHADER,
        "attribute vec2 a; varying vec2 uv; void main(){gl_Position=vec4(a,0.,1.);uv=a*vec2(.5,-.5)+.5;}",
      ],
      [
        gl.FRAGMENT_SHADER,
        `precision mediump float;
        varying vec2 uv;
        uniform sampler2D source;
        uniform float atSill;
        void main() {
          vec3 c = texture2D(source, uv).rgb;
          float spill = c.g - max(c.r, c.b);
          float alpha = 1. - smoothstep(.07, .44, spill);
          // The wrists first clear the ledge, then the fingers can hang over its front.
          float inFront = smoothstep(.01, .065, c.r - c.b);
          float belowEdge = step(0., atSill) * smoothstep(.7995, .8005, uv.y);
          alpha *= mix(1., max(0., atSill) * inFront, belowEdge);
          c.g = mix(c.g, min(c.g, max(c.r, c.b) + .035), smoothstep(.02, .26, spill));
          gl_FragColor = vec4(c, alpha);
        }`,
      ],
    ];
    for (const [type, src] of shaders) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, src);
      gl.compileShader(shader);
      gl.attachShader(program, shader);
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
      throw Error("Bildlagret kunde inte starta.");
    gl.useProgram(program);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const a = gl.getAttribLocation(program, "a");
    gl.enableVertexAttribArray(a);
    gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    for (const p of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER])
      gl.texParameteri(gl.TEXTURE_2D, p, gl.LINEAR);
    for (const p of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T])
      gl.texParameteri(gl.TEXTURE_2D, p, gl.CLAMP_TO_EDGE);
    const atSill = gl.getUniformLocation(program, "atSill");
    return (source, ledgeHands = null) => {
      const rect = fitPresenter(canvas, source, 1440);
      if (!rect) return;
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.viewport(Math.round(rect.left), Math.round(canvas.height - rect.top - rect.height),
        Math.round(rect.width), Math.round(rect.height));
      gl.uniform1f(atSill, ledgeHands ?? -1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };
  }
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  return (source, ledgeHands = null) => {
    const rect = fitPresenter(canvas, source, 560);
    if (!rect) return;
    const x = Math.round(rect.left), y = Math.round(rect.top),
      w = Math.max(1, Math.round(rect.width)), h = Math.max(1, Math.round(rect.height));
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(source, x, y, w, h);
    const img = ctx.getImageData(x, y, w, h),
      p = img.data;
    const ledge = Math.round(h * 0.8) * w * 4;
    for (let i = 0; i < p.length; i += 4) {
      const rb = Math.max(p[i], p[i + 2]),
        excess = p[i + 1] - rb;
      if (excess > 18) {
        const t = Math.min(1, (excess - 18) / 94);
        p[i + 3] = 255 * (1 - t * t * (3 - 2 * t));
        p[i + 1] = Math.min(p[i + 1], rb + 10);
      }
      if (ledgeHands !== null && i >= ledge) {
        const skin = Math.min(1, Math.max(0, (p[i] - p[i + 2] - 2.55) / 14.025));
        p[i + 3] *= ledgeHands * skin * skin * (3 - 2 * skin);
      }
    }
    ctx.putImageData(img, x, y);
  };
}
