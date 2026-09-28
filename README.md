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
- Modelo construido con código: cara esculpida con proporciones reales (ojos a media altura, nariz a mitad de camino hasta la barbilla, boca a un tercio bajo la nariz), cuencas, arco ciliar, pómulos, mandíbula, nariz con puente, punta y aletas, surco nasolabial, filtrum, labios con arco de Cupido y comisuras, barbilla; piel lisa con tonos que varían de forma suave (rubor en mejillas y nariz, labios, mandíbula más fría) sombras cálidas, dispersión subsuperficial rojiza, brillo húmedo fino y pelusa suave en los contornos, y una luz principal de personaje que sigue a la cámara para modelar la cara; globos oculares de tamaño real con iris azul con fibras, halo ámbar alrededor de la pupila y anillo oscuro, carúncula rosada, dos brillos que siguen la mirada, párpados que giran sobre el globo con línea de pestañas, cejas hechas de trazos de pelo individuales, orejas de elfo con hélice en relieve, concha y lóbulo; pelo con casquete y unos 150 mechones en capas, cada uno un manojo de tres hebras afiladas que se separan en las puntas, más oscuro en la raíz y con tono variable por mechón.
- Vestuario: túnica con pliegues, bordado de rombos en hilo de oro en el bajo, canesú bordado con volutas y costuras pespunteadas en el pecho, cuello plegado, broche con rubí, cordones en el escote, cota de malla de anillas que asoma bajo la túnica, cinturón plano de cuero con remaches, hebilla de marco y punta colgante, bolsas, cuchillo al cinto, tahalí, hombrera de acero articulada (casquete con arista y tres láminas superpuestas con ribete dorado, remaches y correa), mangas cortas de túnica con forma de deltoides, pliegues y bajo con ribete dorado sobre mangas de lino con pliegues, brazales con placa de acero ribeteada en oro, correas con hebilla y cordones cruzados, guantes sin dedos con placa y tachuela, manos con tres falanges por dedo, nudillos, uñas y largos distintos, rodilleras de acero articuladas (copa con arista, aleta lateral, láminas arriba y abajo, ribete dorado y correa), botas con vuelta de caña ondulada y ribete dorado, correas, hebillas y cordones, suela con vira y tacón, correa en el empeine con hebilla y puntera pespunteada.
- Capa hasta las rodillas con escudo del sol bordado, bordes dorados y forro oscuro, simulada como tela (11×18 nodos con muelles de corte y de flexión) que cuelga bajo el escudo y se abre al correr.
- Escudo redondo de tablones con veta y juntas, bandas de hierro remachadas, sol pintado en azul y oro, borde de acero, umbo dorado y correas de cuero por detrás.
- Espada con empuñadura de cordón en espiral, guarda alada con gemas azules, pomo engastado y hoja con acanaladura central y punta biselada; vaina de cuero teñido de azul con brocal, abrazadera y contera doradas.
- Proporciones heroicas (unas 7,3 cabezas de alto). Esqueleto de 17 huesos con skinning lineal, IK de dos huesos en brazos y piernas, pies sobre el terreno y pelvis que baja en pendientes y aterrizajes. Oclusión ambiental precalculada.
- Animación procedural: reposo con respiración, cambio de peso y miradas, carrera con giro de cadera y hombros, saltos, voltereta, planeo con hoja gigante, combo de espada con estela, ataque giratorio y estocada. Mirada y expresión que reaccionan a enemigos y chispas.

**Jugabilidad**
- Aceleración distinta en suelo y aire, coyote time, buffer de salto, salto variable y cuelgue en el punto más alto.
- Doble salto, planeo, voltereta de esquiva con invulnerabilidad, dash aéreo, estocada con onda expansiva, combo de 3 golpes y ataque giratorio cargado.
- Goblins articulados con garrote: deambulan, persiguen y atacan; aguantan dos golpes, se tambalean con destello, y al caer salen girando y desaparecen en humo.
- Hitstop, chispas, sacudida de cámara, cambio de FOV y vibración del mando.

**Mundo y render**
- Isla procedural con terrazas, playa, camino, árboles de copa frondosa con ramas y corteza, rocas con musgo, islas flotantes con estratos y raíces, un santuario con columnas estriadas, glifos brillantes, portal de bloques con remolino de luz y plaza de mosaico con escalones.
- Vida ambiental: mariposas, bandadas de pájaros y hojas que caen.
- WebGPU con MSAA 4x, dos cascadas de sombras (una fina alrededor del héroe), materiales por vértice (piel con dispersión subsuperficial, tela con brillo de borde, cuero, metal con reflejos de cielo y suelo separados por el horizonte y atenuados en sombra, pelo con brillo anisótropo, hojas translúcidas), relieve procedural por material (tejido, grano de cuero, poros, piedra, corteza), luz de tarde dorada, niebla atmosférica, cielo con nubes, agua con reflejos planos de la isla, espuma y cáusticas, rayos de sol, bloom, enfoque de detalle (máscara de desenfoque limitada), gradación de color y tonemapping ACES.
- Ajuste de calidad (Alta, Media, Baja) con bajada automática si el juego va lento.
- Música y efectos sintetizados con Web Audio.
