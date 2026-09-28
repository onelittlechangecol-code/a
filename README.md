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
- Modelo construido con código: cabeza esculpida (cuencas, pómulos, puente nasal, labios, barbilla), ojos con iris con fibras, pupila y brillo, párpados que parpadean y entrecierran, pestañas, cejas arqueadas, sonrisa, orejas de elfo; pelo con casquete y unos 80 mechones en capas que se curvan pegados al cráneo.
- Vestuario: túnica con pliegues, bordado de rombos en hilo de oro en el bajo, canesú bordado con volutas y costuras pespunteadas en el pecho, cuello plegado, broche con rubí, cordones en el escote, cota de malla de anillas que asoma bajo la túnica, cinturón plano de cuero con remaches, hebilla de marco y punta colgante, bolsas, cuchillo al cinto, tahalí, hombrera de acero articulada (casquete con arista y tres láminas superpuestas con ribete dorado, remaches y correa), mangas con arrugas y ribete, brazales con placa de acero ribeteada en oro, correas con hebilla y cordones cruzados, guantes sin dedos con placa y tachuela, rodilleras, botas con correas, hebillas y cordones.
- Capa hasta las rodillas con escudo del sol bordado, bordes dorados y forro oscuro, simulada como tela (11×18 nodos con muelles de corte y de flexión) que cuelga bajo el escudo y se abre al correr.
- Escudo redondo de tablones con veta y juntas, bandas de hierro remachadas, sol pintado en azul y oro, borde de acero, umbo dorado y correas de cuero por detrás.
- Espada con empuñadura de cordón en espiral, guarda alada con gemas azules, pomo engastado y hoja con acanaladura central y punta biselada; vaina de cuero teñido de azul con brocal, abrazadera y contera doradas.
- Esqueleto de 17 huesos con skinning lineal, IK de dos huesos en brazos y piernas, pies sobre el terreno y pelvis que baja en pendientes y aterrizajes. Oclusión ambiental precalculada.
- Animación procedural: reposo con respiración, cambio de peso y miradas, carrera con giro de cadera y hombros, saltos, voltereta, planeo con hoja gigante, combo de espada con estela, ataque giratorio y estocada. Mirada y expresión que reaccionan a enemigos y chispas.

**Jugabilidad**
- Aceleración distinta en suelo y aire, coyote time, buffer de salto, salto variable y cuelgue en el punto más alto.
- Doble salto, planeo, voltereta de esquiva con invulnerabilidad, dash aéreo, estocada con onda expansiva, combo de 3 golpes y ataque giratorio cargado.
- Goblins articulados con garrote: deambulan, persiguen y atacan; aguantan dos golpes, se tambalean con destello, y al caer salen girando y desaparecen en humo.
- Hitstop, chispas, sacudida de cámara, cambio de FOV y vibración del mando.

**Mundo y render**
- Isla procedural con terrazas, playa, camino, árboles de copa frondosa con ramas y corteza, rocas con musgo, islas flotantes con estratos y raíces, un santuario con columnas estriadas, glifos brillantes, portal de bloques con remolino de luz y plaza de mosaico con escalones.
- Vida ambiental: mariposas, bandadas de pájaros y hojas que caen.
- WebGPU con MSAA 4x, dos cascadas de sombras (una fina alrededor del héroe), materiales por vértice (piel con dispersión subsuperficial, tela con brillo de borde, cuero, metal, pelo con brillo anisótropo, hojas translúcidas), relieve procedural por material (tejido, grano de cuero, poros, piedra, corteza), luz de tarde dorada, niebla atmosférica, cielo con nubes, agua con reflejos planos de la isla, espuma y cáusticas, rayos de sol, bloom, gradación de color y tonemapping ACES.
- Ajuste de calidad (Alta, Media, Baja) con bajada automática si el juego va lento.
- Música y efectos sintetizados con Web Audio.
