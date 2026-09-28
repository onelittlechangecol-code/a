# Brío

Un juego de plataformas y exploración en 3D, en un solo archivo (`index.html`), hecho desde cero con WebGPU y shaders WGSL. No usa motores, librerías, imágenes ni modelos externos: cada malla, textura, animación y sonido se genera con código.

**Brío** es un aventurero de orejas puntiagudas, con espada, escudo y capa, al estilo de los juegos de acción y aventura en 3D. Su cuerpo es una malla deformada por un esqueleto de 17 huesos que se anima por completo con código.

## Cómo jugar

Abre `index.html` en un navegador con WebGPU (Chrome o Edge 113+, Safari 26+, Firefox 141+).

| Acción | Teclado | Mando | Táctil |
| --- | --- | --- | --- |
| Correr | `WASD` / flechas | Stick izquierdo | Arrastrar a la izquierda |
| Cámara | Ratón (clic para fijarlo), `Q` `E` | Stick derecho | Arrastrar a la derecha |
| Saltar · doble salto · planear | `Espacio` (mantener para planear) | A | Saltar |
| Espada: combo de 3 golpes (mantener para ataque giratorio) | `J` / clic | X | Espada |
| Voltereta para esquivar · dash en el aire | `Shift` | RB / RT | Esquivar |
| Estocada descendente (en el aire) | `K` / `Ctrl` | B | Estocada |
| Ver esqueleto, IK y capa | `B` | Select | Botón Esqueleto |
| Pausa | `P` / `Esc` | Start | Botón Pausa |

Objetivo: recoge chispas para despertar el santuario de la colina y cruza su portal. Hay corazones extra en las islas flotantes.

## Qué hay dentro

**Personaje**
- Modelo construido con código: cabeza con ojos (esclerótica, iris, pupila y brillo), pestañas, cejas, nariz, boca y orejas de elfo; pelo con casquete y 30 mechones; túnica con falda, cinturón, hebilla, bolsas, tahalí y hombrera; mangas, brazales, manos con dedos; pantalón y botas.
- Esqueleto de 17 huesos con skinning lineal (hasta 3 huesos por vértice): codos, rodillas, hombros y la falda de la túnica se deforman con el movimiento.
- IK de dos huesos en brazos y piernas; los pies se apoyan en el terreno y la pelvis baja sola en pendientes y al aterrizar.
- Animación procedural: respiración y cambio de peso en reposo, carrera con giro de cadera y hombros, saltos, voltereta, planeo, combo de espada con estela, ataque giratorio y estocada.
- Capa de tela simulada con Verlet que choca con el torso y las piernas; mechones de pelo con resortes; mirada y cejas que reaccionan a enemigos y chispas; parpadeo.
- Materiales por vértice: piel con dispersión subsuperficial, tela con brillo de borde, cuero, acero y oro metálicos, ojos brillantes, pelo.

**Jugabilidad**
- Aceleración y frenado distintos en suelo y aire, coyote time, buffer de salto, salto corto o largo según cuánto mantengas, y un pequeño "cuelgue" en el punto más alto.
- Doble salto con voltereta, planeo con una hoja gigante, voltereta de esquiva con invulnerabilidad, dash aéreo, estocada descendente con onda expansiva, combo de espada de 3 golpes y ataque giratorio cargado.
- Hitstop, sacudida de cámara, cambio de FOV y vibración del mando en los impactos.
- Enemigos que deambulan, persiguen y atacan saltando; se derrotan con la espada, pisándolos, con el dash aéreo o con la estocada.

**Mundo y render**
- Isla procedural con terrazas, playa, camino, bosques, rocas, flores, islas flotantes (algunas móviles) y un santuario.
- WebGPU con MSAA 4x, sombras direccionales con PCF y encuadre estable, iluminación con wrap y especular GGX, niebla atmosférica, cielo con nubes procedurales, agua con olas, fresnel y espuma en la orilla según la profundidad real del terreno, bloom y tonemapping ACES.
- Música y efectos sintetizados con Web Audio.
