# Herramientas de prueba

Sirve la raíz del repo (`python3 -m http.server 8766`) y, desde `tools/`:

- `node test2.mjs`: regresión completa (recorre la isla y debe acabar con `"mode":"win","orbs":56` y sin errores).
- `SF=steps29.json node test3.mjs`: capturas según un guion de pasos (`*_gpu.png` es el fotograma WebGPU).

`BASE=http://localhost:PUERTO/` apunta a otro servidor (útil en worktrees). Construye antes con `python3 src/build.py`.
