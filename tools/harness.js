(() => {
  let cbs = [], ft = 0;
  window.requestAnimationFrame = (cb) => { cbs.push(cb); return cbs.length; };
  window.__advance = async (frames) => {
    window.__skipRender = true;
    for (let i = 0; i < frames; i++) { if (i === frames - 1) window.__skipRender = false; ft += 1000 / 60; const c = cbs; cbs = []; c.forEach(f => f(ft)); }
    await window.__fakeCtx.dev.queue.onSubmittedWorkDone();
  };
  const orig = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
    if (type !== 'webgpu') return orig.call(this, type, ...rest);
    const canvas = this;
    const ctx = {
      canvas, tex: null, dev: null, format: 'bgra8unorm',
      configure(o) { this.dev = o.device; this.format = o.format; },
      getCurrentTexture() {
        if (!this.tex || this.tex.width !== canvas.width || this.tex.height !== canvas.height) {
          this.tex && this.tex.destroy();
          this.tex = this.dev.createTexture({ size: [canvas.width, canvas.height], format: this.format, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
        }
        return this.tex;
      },
    };
    window.__fakeCtx = ctx;
    return ctx;
  };
  window.__grab = async () => {
    const c = window.__fakeCtx, t = c.tex, d = c.dev, w = t.width, h = t.height;
    const bpr = Math.ceil(w * 4 / 256) * 256;
    const buf = d.createBuffer({ size: bpr * h, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    const e = d.createCommandEncoder(); e.copyTextureToBuffer({ texture: t }, { buffer: buf, bytesPerRow: bpr }, [w, h]); d.queue.submit([e.finish()]);
    await buf.mapAsync(GPUMapMode.READ);
    const src = new Uint8Array(buf.getMappedRange()), img = new ImageData(w, h);
    const bgra = c.format.startsWith('bgra');
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const s = y * bpr + x * 4, o = (y * w + x) * 4;
      img.data[o] = src[s + (bgra ? 2 : 0)]; img.data[o + 1] = src[s + 1]; img.data[o + 2] = src[s + (bgra ? 0 : 2)]; img.data[o + 3] = 255;
    }
    buf.unmap();
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h; cv.getContext('2d').putImageData(img, 0, 0);
    return cv.toDataURL('image/png');
  };
})();
