# Brío

Un juego de plataformas y exploración en 3D, en un solo archivo (`index.html`), hecho desde cero con WebGPU y shaders WGSL. No usa motores, librerías, imágenes ni modelos externos: cada malla, textura, animación y sonido se genera con código.

**Brío** es un aventurero de orejas puntiagudas, con espada, escudo y capa, al estilo de los juegos de acción y aventura en 3D. Su cuerpo es una malla deformada por un esqueleto de 17 huesos que se anima por completo con código.

## Presentación

- Pantalla de carga con emblema del sol, barra de progreso real por etapas (isla, rocas y árboles, armas, héroe, luz, cielo) y frases del mundo.
- Pantalla de título cinematográfica con franjas de cine sobre la escena en 3D.
- Cinemática de introducción con tres planos (grúa aérea sobre la isla, barrido por el prado y primer plano del héroe) y subtítulos que cuentan la historia de las Chispas. Se salta con cualquier tecla, clic o botón.
- Interfaz limpia, sin guías: solo vida y chispas; las misiones aparecen como un rótulo breve; los controles y opciones están en el menú de pausa.

## Código

El juego se publica como un único `index.html`, generado desde `src/` con `python3 src/build.py`. Las pruebas están en `tools/`.

## Cómo jugar

Abre `index.html` en un navegador con WebGPU (Chrome o Edge 113+, Safari 26+, Firefox 141+).

| Acción | Teclado | Mando | Táctil |
| --- | --- | --- | --- |
| Correr | `WASD` / flechas | Stick izquierdo | Arrastrar a la izquierda |
| Cámara | Ratón (clic para fijarlo), `Q` `E` | Stick derecho | Arrastrar a la derecha |
| Saltar · doble salto · planear | `Espacio` (mantener para planear) | A | Saltar |
| Espada: combo de 3 golpes (mantener para ataque giratorio) | `J` / clic | X | Espada |
| Cambiar de arma (espada, lanza, martillo, arco) | `1`–`4`, `Tab` para rotar | Cruceta ◀ ▶ | Botón dorado de arma |
| Arco: tensar y disparar | Mantener `J` / clic, soltar | Mantener X, soltar | Mantener Arco, soltar |
| Voltereta para esquivar · dash en el aire | `Shift` (pulsar) | RB / RT | Esquivar |
| Esprintar (gasta aguante) | Mantener `Shift` más de 0,25 s mientras corres | Mantener RB / RT | Mantener Esquivar |
| Estocada descendente (en el aire) | `K` / `Ctrl` | B | Estocada |
| Ver esqueleto, IK y capa | `B` | Select | Botón Esqueleto |
| Pausa | `P` / `Esc` | Start | Botón Pausa |

Objetivo: recoge chispas (cristales dorados tallados con un halo que gira) para despertar el santuario de la colina y cruza su portal. Hay corazones extra (contenedores de corazón abombados y brillantes con marco dorado) en las islas flotantes.

## Qué hay dentro

**Personaje**
- Modelo construido con código: cara esculpida con proporciones reales (ojos a media altura, nariz a mitad de camino hasta la barbilla, boca a un tercio bajo la nariz), cuencas, arco ciliar, pómulos, mandíbula, nariz con puente, punta y aletas, surco nasolabial, filtrum, labios con arco de Cupido y comisuras, barbilla; piel lisa con tonos que varían de forma suave (rubor en mejillas y nariz, labios, mandíbula más fría) sombras cálidas, dispersión subsuperficial rojiza, brillo húmedo fino y pelusa suave en los contornos, y una luz principal de personaje que sigue a la cámara para modelar la cara; globos oculares de tamaño real con iris azul con fibras, halo ámbar alrededor de la pupila y anillo oscuro, carúncula rosada, dos brillos que siguen la mirada, párpados que giran sobre el globo con línea de pestañas, cejas hechas de trazos de pelo individuales, orejas de elfo con hélice en relieve, concha y lóbulo; pelo con casquete y unos 150 mechones en capas, cada uno un manojo de tres hebras afiladas que se separan en las puntas, más oscuro en la raíz y con tono variable por mechón y hebras sueltas que rompen la silueta.
- Vestuario: túnica con falda de caída pesada (tela abullonada sobre el cinturón con frunces verticales, fruncida bajo él y abierta en pliegues profundos e irregulares con valles sombreados y bajo ondulado), bordado de rombos en hilo de oro en el bajo, canesú bordado con volutas y costuras pespunteadas en el pecho, cuello de tela drapeado con pliegues irregulares, broche con rubí, cordones en el escote, cota de malla de anillas que asoma bajo la túnica, cinturón plano de cuero con remaches, hebilla de marco y punta colgante, bolsas de cuero con solapa ribeteada y botón de latón, cuchillo al cinto (vaina cosida con contera dorada, guarda de acero, empuñadura envuelta y pomo), tahalí de cuero plano con cantos biselados y remaches, hombrera de acero articulada (casquete con arista y tres láminas superpuestas con ribete dorado, remaches y correa), mangas cortas de túnica con forma de deltoides, pliegues y bajo con ribete dorado sobre mangas de lino con pliegues, brazales con placa de acero ribeteada en oro, correas con hebilla y cordones cruzados, guantes sin dedos con placa y tachuela, manos con tres falanges por dedo, nudillos, uñas y largos distintos, pantalones con pliegues de tiro diagonales desde la entrepierna, pliegues apilados sobre y tras la rodilla y tela arrugada al entrar en la bota, rodilleras de acero articuladas (copa con arista, aleta lateral, láminas arriba y abajo, ribete dorado y correa), botas con vuelta de caña ondulada y ribete dorado, correas, hebillas y cordones, suela con vira y tacón, correa en el empeine con hebilla y puntera pespunteada.
- Capa hasta las rodillas con escudo del sol bordado, bordes dorados, greca dorada en el bajo, sombreado de pliegues en tiempo real y forro oscuro, simulada como tela (11×18 nodos con muelles de corte y de flexión) que cuelga bajo el escudo y se abre al correr.
- Escudo redondo de tablones con veta y juntas, bandas de hierro remachadas, sol pintado en azul y oro, borde de acero, umbo dorado y correas de cuero por detrás.
- Espada con empuñadura de cordón en espiral, guarda alada con gemas azules, pomo engastado y hoja con acanaladura central y punta biselada; vaina de cuero teñido de azul con brocal, abrazadera y contera doradas.
- Proporciones heroicas (unas 7,3 cabezas de alto). Esqueleto de 17 huesos con skinning lineal, IK de dos huesos en brazos y piernas, pies sobre el terreno y pelvis que baja en pendientes y aterrizajes. Oclusión ambiental precalculada.
- Animación procedural: reposo con respiración, cambio de peso y miradas, carrera con giro de cadera y hombros, saltos, voltereta, planeo con hoja gigante, combo de espada con estela de energía (borde azul blanco que se desvanece), ataque giratorio y estocada. Mirada y expresión que reaccionan a enemigos y chispas.

**Jugabilidad**
- Aceleración distinta en suelo y aire, coyote time, buffer de salto, salto variable y cuelgue en el punto más alto.
- Doble salto, planeo, voltereta de esquiva con invulnerabilidad, dash aéreo, estocada con onda expansiva, combo de 3 golpes y ataque giratorio cargado.
- Goblins articulados con piel curtida y moteada, brazos y piernas musculosos y garrote con aro de hierro: deambulan, persiguen y atacan; aguantan dos golpes, se tambalean con destello, y al caer salen girando y desaparecen en humo.
- Hitstop, chispas, sacudida de cámara, cambio de FOV y vibración del mando.

**Armas**
- Cuatro armas, cada una con su malla procedural al nivel de la espada, su animación de ataque guiada por el mismo rig (IK de brazos, la mano izquierda se ancla al asta en las armas a dos manos), su alcance, daño y retroceso, su respuesta al golpe (hitstop, chispas, sacudida de cámara, cambio de FOV, vibración) y sus sonidos sintetizados:
  - **Espada del Alba**: la de siempre (arma por defecto).
  - **Lanza del Vigía**: asta de fresno con empuñadura de cordón, virolas y regatón dorados, cubo alado con gemas y borla roja, hoja de hoja de laurel con arista. Combo de estocadas de largo alcance (la tercera, una embestida); manteniendo el ataque, ráfaga de estocadas rápidas que acaba en embestida.
  - **Martillo del Titán**: mango de madera oscura con cuero y lengüetas de hierro, cabeza forjada con caras de acero octogonales, bandas y sol de oro con gemas que brillan. Lento y pesado: barridos que lanzan a los goblins por los aires y un tercer golpe que machaca el suelo con onda expansiva (anillos, polvo, esquirlas). Manteniendo el ataque se carga un golpe sísmico con salto; la estocada aérea con el martillo también produce la onda.
  - **Arco del Halcón**: pala recurvada laminada sobre empuñadura tallada, culatines dorados, cuerda que se tensa hasta la mano y palas que se doblan al tensar; carcaj en la cadera con flechas visibles. Mantén el ataque para tensar (la cámara se acerca por encima del hombro con retícula), suelta para disparar. Flechas simuladas con gravedad y resistencia del aire que se clavan en el terreno, en árboles, rocas y goblins (tiro a la cabeza: crítico) y se pueden recoger pasando por encima. Si el módulo de física expone fuego (`fireNear`/`isBurningAt` e `igniteAt`), las flechas que pasan por una llama arden y prenden lo que tocan.
- Las armas están repartidas por la isla, clavadas en el suelo o tiradas con un destello dorado: se recogen pasando por encima. Los goblins a veces sueltan su **garrote**, que puede usarse como arma pesada (más rápido y más débil que el martillo). También hay haces de flechas.
- Selector de armas dorado sobre fondo oscuro (iconos SVG, tipografía Cinzel) que aparece un momento al cambiar, e indicador del arma actual (y flechas) bajo el contador de chispas.
- Todo vive en `src/mod_weapons.js`, que envuelve funciones del núcleo al cargar (simulación, pose, rig, cámara, instancias, flujo) sin editar los demás archivos; `window.__brio.weapons` expone la API para pruebas.

**Mundo vivo: hora, clima, viento y cuerpo** (`src/mod_world.js`)
- Reloj del mundo: un día completo dura unos 16 minutos reales y la partida empieza a media tarde. El sol recorre el cielo (las sombras lo siguen) y de noche la luna toma el relevo como luz principal fría con sus propias sombras.
- Cielo físicamente plausible según la altura del sol: mediodía azul, hora dorada, puesta de sol roja con resplandor en el horizonte, hora azul con resplandor violeta, noche con estrellas que titilan, una banda tenue de la Vía Láctea y la luna con mares y halo, y amanecer. La niebla, la luz ambiente, la exposición, la saturación (visión nocturna más fría y desaturada) y los rayos de sol siguen la hora.
- Luces cálidas de noche: los glifos del santuario brillan en ámbar, braseros con llamas y pavesas en lo alto de las columnas y una luz de fuego parpadeante que ilumina la plaza, los escalones y el portal. Luciérnagas sobre el prado en las noches despejadas.
- Indicador de hora en la interfaz: esfera dorada sobre fondo oscuro con el sol y la luna girando sobre el horizonte, cielo que cambia de color, hora y clima en letra Cinzel.
- Clima con transiciones suaves entre despejado, nublado, lluvia, tormenta y niebla (la niebla aparece sobre todo al amanecer). La cobertura de nubes del cielo, su color y las sombras de nubes dependen del clima; las tormentas traen nubes oscuras y pesadas, relámpagos que iluminan el cielo y la escena, y truenos retardados sintetizados.
- Lluvia en la GPU: miles de gotas instanciadas en una caja alrededor de la cámara (sin coste por gota en la CPU), inclinadas por el viento, salpicaduras en el suelo (anillo y corona), anillos de gotas en el mar y en los charcos, sonido de lluvia. Superficies mojadas: el terreno, las rocas, la corteza y la piedra se oscurecen y brillan, y se forman charcos que reflejan el cielo en el suelo llano y en el camino; tardan en secarse (más rápido al sol).
- Viento global (`wind`): dirección que cambia poco a poco, fuerza según el clima y ráfagas que recorren el prado a favor del viento. Mueve la hierba, las flores y las copas de los árboles, la capa del héroe, la inclinación de la lluvia y la deriva de las nubes; en las tormentas es mucho más fuerte.
- Cuerpo: aguante al estilo Zelda con una rueda verde junto al héroe que se desvanece cuando está llena. Esprintar (mantener el botón de esquivar más de 0,25 s mientras corres; un toque sigue siendo una voltereta), planear y nadar gastan aguante. Agotado: no puede esprintar ni planear, corre más lento y jadea (pecho y hombros que suben y bajan, cuerpo inclinado con las manos hacia las rodillas y la cabeza que cabecea) hasta recuperarse del todo; la rueda se vuelve naranja y late.
- Sudor y lluvia: tras un esfuerzo largo o con el calor del mediodía la piel gana un brillo húmedo; la lluvia empapa el pelo, la piel y la ropa (más oscuros y brillantes) y se secan poco a poco.
- Variables globales para otros sistemas: `wind` (`x`, `z`, `dirX`, `dirZ`, `strength`, `gust`), `weather` (nombre del estado) y `rainAmount` (0..1). Para pruebas: `__brio.world.setTime(19.5)`, `__brio.world.setWeather('storm')`, `__brio.world.freeze()`.

**Mundo y render**
- Isla procedural con terrazas, playa con arena mojada brillante junto al agua y marcas onduladas, camino de tierra con guijarros, suelo de hierba con manchas de tono y grandes zonas de pasto seco oliváceo y hondonadas de verde intenso, árboles de copa frondosa con ramas y corteza, rocas facetadas con grietas, líquenes y musgo, islas flotantes con repisas de estratos, roca facetada, estalactitas, raíces y enredaderas con hojas, un santuario con columnas estriadas de piedra envejecida con musgo a parches, glifos brillantes, portal de dovelas talladas en relieve con remolino de luz y plaza de mosaico envejecida (cada baldosa con su tono, suciedad en los bordes y musgo en las juntas) con escalones.
- Hierba en matas densas de hojas finas y curvadas (unas 8500 matas), más oscuras en la raíz, translúcidas al sol y mecidas por ráfagas de viento que recorren el prado y que se apartan y se aplastan al paso del héroe; las copas de los árboles se balancean suavemente. Flores silvestres con tallo curvo, hojas, siete pétalos ahuecados y centro abombado. Vida ambiental: mariposas, bandadas de pájaros y hojas que caen.
- WebGPU con MSAA 4x, dos cascadas de sombras (una fina alrededor del héroe), materiales por vértice (piel con dispersión subsuperficial, tela con brillo de borde, cuero, metal con reflejos de cielo y suelo separados por el horizonte y atenuados en sombra, pelo con brillo anisótropo, hojas translúcidas), relieve procedural por material (tejido, grano de cuero, poros, piedra, corteza), luz de tarde dorada, perspectiva atmosférica con bruma azulada que crece con la distancia, cielo con cúmulos autosombreados (cimas iluminadas, bases grises, borde plateado a contraluz) y cirros altos, islas y montañas lejanas difuminadas por la bruma en el horizonte, agua con ondulaciones de viento, destellos de sol, crestas turquesa a contraluz, reflejos planos de la isla, espuma de encaje con línea de oleaje que avanza y retrocede, cáusticas, rayos de sol, bloom, enfoque de detalle (máscara de desenfoque limitada), gradación de color y tonemapping ACES.
- Ajuste de calidad (Alta, Media, Baja) con bajada automática si el juego va lento.
- Música y efectos sintetizados con Web Audio.
