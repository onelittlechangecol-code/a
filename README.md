# Brío

Un juego de plataformas y exploración en 3D, en un solo archivo (`index.html`), hecho desde cero con WebGPU y shaders WGSL. No usa motores, librerías, imágenes ni modelos externos: cada malla, textura, animación y sonido se genera con código.

**Brío** es un héroe sin brazos ni piernas, al estilo de los clásicos de plataformas. Sus manos y pies flotan, pero tiene un esqueleto completo: los huesos de los brazos y las piernas existen y se resuelven con IK, solo que no se dibujan. Su cuerpo es gelatina simulada de verdad.

## Cómo jugar

Abre `index.html` en un navegador con WebGPU (Chrome o Edge 113+, Safari 26+, Firefox 141+).

| Acción | Teclado | Mando | Táctil |
| --- | --- | --- | --- |
| Correr | `WASD` / flechas | Stick izquierdo | Arrastrar a la izquierda |
| Cámara | Ratón (clic para fijarlo), `Q` `E` | Stick derecho | Arrastrar a la derecha |
| Saltar · doble salto · planear | `Espacio` (mantener para planear) | A | Saltar |
| Puño bumerán (mantener para cargar) | `J` / clic | X | Puño |
| Dash (también en el aire) | `Shift` | RB / RT | Dash |
| Golpe al suelo (en el aire) | `K` / `Ctrl` | B | Golpe |
| Ver esqueleto y gelatina | `B` | Select | Botón Esqueleto |
| Pausa | `P` / `Esc` | Start | Botón Pausa |

Objetivo: recoge chispas para despertar el santuario de la colina y cruza su portal. Hay corazones extra en las islas flotantes.

## Qué hay dentro

**Personaje**
- Esqueleto procedural: pelvis, columna, pecho, cuello y cabeza, más brazos y piernas invisibles resueltos con IK de dos huesos y vector polar.
- Manos y pies flotantes que siguen poses con resortes críticamente amortiguados, así que se retrasan y rebotan de forma natural.
- Pies que se apoyan en el terreno real (colocación de pies sobre pendientes y plataformas).
- Torso de gelatina: cuerpo blando XPBD con tetraedros, restricciones de aristas y de volumen, anclado al esqueleto con rigidez distinta en el núcleo y en la superficie. La malla visible se deforma con pesos MLS que reproducen movimientos lineales, y el emblema del pecho va pegado a la superficie que tiembla.
- Cabeza con retraso elástico, parpadeo, boca expresiva y mirada que busca chispas y enemigos cercanos.
- Pelo que se balancea y se convierte en hélice al planear; bufanda simulada con Verlet.

**Jugabilidad**
- Aceleración y frenado distintos en suelo y aire, coyote time, buffer de salto, salto corto o largo según cuánto mantengas, y un pequeño "cuelgue" en el punto más alto.
- Doble salto con voltereta, planeo, dash (también encadenable con salto), golpe al suelo con onda expansiva, puño bumerán cargable con asistencia de apuntado.
- Hitstop, sacudida de cámara, cambio de FOV y vibración del mando en los impactos.
- Enemigos que deambulan, persiguen y atacan saltando; se derrotan con el puño, pisándolos, con dash o con el golpe al suelo.

**Mundo y render**
- Isla procedural con terrazas, playa, camino, bosques, rocas, flores, islas flotantes (algunas móviles) y un santuario.
- WebGPU con MSAA 4x, sombras direccionales con PCF y encuadre estable, iluminación con wrap y especular GGX, niebla atmosférica, cielo con nubes procedurales, agua con olas, fresnel y espuma en la orilla según la profundidad real del terreno, bloom y tonemapping ACES.
- Música y efectos sintetizados con Web Audio.
