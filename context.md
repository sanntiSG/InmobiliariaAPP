# Umbral(ese nombre sera por ahora como provisional, luego quiza lo cambie) — Contexto maestro del proyecto

> Documento de referencia permanente. Léer esto antes de retomar cualquier tarea nueva sobre el proyecto para tener el contexto completo: qué es, qué debe tener, qué estilo seguir y cómo trabajar.

---

## 1. Qué estamos construyendo

**Umbral** es una plataforma inmobiliaria web, completa y escalable, pensada como el **"Shopify de las inmobiliarias"**: cada inmobiliaria puede crear su perfil y cargar/administrar sus propias propiedades desde un dashboard propio, dentro de una única plataforma multi-tenant.

No es un catálogo de casas más. Es la combinación de:

1. **Portal inmobiliario profesional** — todo lo esperable de una plataforma inmobiliaria moderna.
2. **Red social enfocada en propiedades** — perfiles, likes, comentarios, favoritos, actividad.
3. **Sistema personalizado de descubrimiento y recomendaciones** — basado en reglas/datos, sin IA de pago.
4. **Mapa interactivo** de propiedades, tipo Google Maps pero 100% gratuito.
5. **Digital Twins / recorridos 3D** por propiedad, como diferencial principal frente a portales tradicionales — mediante una **foto 360° (equirectangular) propia**, subida como una imagen común y visualizada con un visor embebido propio (`react-photo-sphere-viewer`), sin depender de links de proveedores externos ni de archivos 3D exportados.
6. **Notificaciones internas personalizadas.**
7. **Panel de gestión (dashboard) para cada inmobiliaria**, con estadísticas visuales y recomendaciones basadas en datos propios (no IA).

Tagline interno: **"Entrá antes de entrar."** — la idea de cruzar el umbral de una casa antes de visitarla en persona, gracias al 3D.

---

## 2. Las tres puertas de entrada (landing)

Al entrar a la web, sin fricción, se elige uno de tres caminos:

1. **Explorar sin cuenta** — ver propiedades, mapa, buscar y filtrar, pero **sin** recomendaciones, notificaciones, favoritos, likes ni comentarios (eso requiere cuenta).
2. **Iniciar sesión / crear cuenta** — desbloquea toda la experiencia social y personalizada: favoritos, likes, comentarios, valoraciones, recomendaciones, notificaciones, actividad.
3. **Publicar tu inmobiliaria** — deriva a contacto directo por WhatsApp con el proveedor (+54 9 11 3779-6683). **Solo el proveedor o un admin** pueden crear, editar o eliminar inmobiliarias (quien entre con el correo de la cuenta de google del admin ssantii200@gmail.com) el admin puede dar permiso a un mail y luego ese mail puede crear su inmobiliaria, crear publicaciones, subir fotos, comentar, dar like, lo mismo que puede hacer el admin, solo que la inmobiliaria solo puede gestionar, editar y ver metricas de su propia inmobiliaria.

Roles del sistema:
- **Visitante anónimo** — solo explora.
- **Usuario registrado** — experiencia social + recomendaciones + notificaciones.
- **Usuario de inmobiliaria (agencia)** — gestiona el dashboard y las propiedades de su propia inmobiliaria.
- **Admin/proveedor** — gestiona todas las inmobiliarias y todas las propiedades de la plataforma.

---

## 3. Alcance funcional completo

### Propiedades
- Publicación y administración con: fotos, descripción, precio, ubicación, características, ambientes, superficie, tipo de operación (venta/alquiler), estado, contacto.
- Búsqueda y filtros avanzados (tipo, precio, ambientes, ubicación, superficie, etc.).
- Vista detallada con galería de imágenes.
- Ubicación en mapa por propiedad.
- **Digital Twin / recorrido 3D opcional por propiedad** (puede tener o no tenerlo) — arquitectura preparada desde el inicio para esto, sin necesidad de rediseñar más adelante.

### Mapa interactivo general
- Visualización de todas las propiedades disponibles de la inmobiliaria/plataforma, geolocalizadas.
- Estilo "Google Maps" pero enteramente gratuito, sin APIs pagas ni límites de uso , usando mapa de la region de Argentina por ahora, que tenga buen filtro de ubicaciones para mejor precision.
- Click en un pin/cluster → card flotante con info clave (foto, precio, datos) y salida a la ficha completa de la propiedad. (deben verse sobre el mapa los pines, como en google maps,) debes apoyarte en las referencias visuales de la carpeta llamada UIreferences
- Clustering numerado cuando hay muchas propiedades cercanas.
- Buscador de direcciones/zonas integrado.

### Capa social (google OAuth)
- Registro/login de usuarios.
- Guardar propiedades (favoritos).
- Dar "me gusta".
- Comentar.
- Valorar/rankear propiedades.
- Ver actividad propia.
- Diseñado desde el inicio para poder ampliarse (más tipos de interacción a futuro).

### Personalización y recomendaciones
- Experiencia personalizada por usuario **sin IA de pago ni APIs de IA pagas**.
- Recomendaciones por **lógica tradicional basada en datos**: ubicación, rango de precio, tipo de propiedad, ambientes, características buscadas, propiedades vistas, likes, guardados y otras interacciones.
- Arquitectura preparada para evolucionar a sistemas de recomendación más avanzados en el futuro, sin romper lo existente.

### Notificaciones
- Primera versión: **internas**, visibles al ingresar a la plataforma (no push, no email todavía).
- Casos de uso: nuevas propiedades que matchean preferencias, cambios de precio, propiedades recomendadas, actividad relacionada a interacciones propias, otros eventos relevantes.
- Preparado para evolucionar a push/email/otros canales más adelante.

### Dashboard de inmobiliaria (gestión)
- ABM completo de propiedades: fotos, disponibilidad, precios, ubicación, características, publicación, y a futuro gestión de Digital Twins/recorridos 3D.
- **Estadísticas propias por inmobiliaria** (no IA), pensadas para ser muy visuales y accionables:
  - Usuarios interesados, likes, favoritos, comentarios, visualizaciones.
  - Comparativas temporales ("creció la visualización 10% respecto a la semana pasada", "300 likes nuevos", "50 comentarios nuevos").
  - Alertas de decaimiento ("decayeron las vistas") con **recomendaciones automáticas basadas en estadísticas**: subir más fotos, subir videos, subir el recorrido 3D, publicar nuevas propiedades, etc.
- Panel de administración global (rol admin/proveedor): gestiona todas las inmobiliarias y puede publicar/reasignar propiedades entre ellas.

### Multi-tenant ("Shopify de las inmobiliarias")
- Cada inmobiliaria tiene su propio perfil, catálogo de propiedades y dashboard aislado.
- Alta de inmobiliarias controlada exclusivamente por admin/proveedor (vía contacto de WhatsApp, no autoservicio).

---

## 4. Estilo visual — referencia en `/UIreference`

La carpeta `/UIreference` contiene 3 capturas que son la inspiración visual principal (analizadas antes de diseñar cualquier UI):

1. **RealEstate (estilo "Search")** — fondo gris muy claro, cards blancas con esquinas redondeadas grandes, sombras suaves y difusas, barra de filtros en **pills horizontales** (For sale, Type, Min/Max price, Floor area, More), precio como elemento tipográfico protagonista, badges pequeños ("New", "For Sale") en la esquina superior de cada foto, corazón de favorito flotante sobre la imagen, mapa dividido a la derecha con pines y una card flotante con "pico" (tooltip) al hacer click en un pin.
2. **SquareHome (Premium)** — layout mapa + listado lado a lado, filtros como chips removibles con "x" (New York, ZIP 10013, Listing Status, Type, Beds, Price, Area), clusters numerados en círculos sólidos sobre el mapa, cards de propiedad con rating (estrella + número), badge "3D Tour" superpuesto en la foto, CTA oscuro tipo pill ("View Details"), precio grande alineado a la derecha de la card, sección de contacto humano ("Connect with a local agent") con avatares.
3. **Housebuy** — mapa full-bleed como protagonista absoluto de la pantalla, panel de filtros lateral flotante con iconos grandes por tipo de propiedad (House/Commercial/Apartment/Land), slider de presupuesto, checkboxes de amenities, pines-casa personalizados sobre el mapa 3D/isométrico, popup de propiedad con foto grande + precio + datos clave al hacer hover/click sobre un pin.

**Síntesis de estilo a aplicar (ya definida en `.impeccable.md`):**
- Fondo gris muy claro (light) / modo oscuro pensado para exploración nocturna — **tema claro y oscuro desde el día uno**.
- Cards blancas grandes, radio ~20px, sombras muy suaves y difusas (nunca duras, nunca `border-left` como acento).
- Un único acento de color usado con disciplina (~10% del peso visual): marca "esto es interactivo/mío" (CTA primario, pin propio, link activo) — nunca decorativo.
- Precio y dirección como protagonistas tipográficos de cada card; badges e iconos son soporte silencioso, nunca compiten.
- Filtros en pills horizontales / chips removibles.
- El mapa **es la aplicación**, no una sección secundaria: full-bleed, con overlays flotantes (cards, filtros, panel de resultados) que respiran sobre él sin taparlo, especialmente en mobile.
- Clusters numerados en el mapa + popup card flotante con info clave al hacer click en un pin o card.
- Tipografía: **Bricolage Grotesque** (títulos, precios — con carácter propio, evita el default genérico tipo Inter/Plus Jakarta/Outfit) + **Manrope** (UI, cuerpo, chips, direcciones, muy legible en tamaños chicos).
- Paleta definida en **OKLCH**, neutros sutilmente teñidos hacia el hue del acento para que fondo y marca se sientan de una misma familia.
- Anti-referencia explícita: portales inmobiliarios argentinos recargados (banners, tipografía chica, azules corporativos genéricos, sombras duras, cards apiladas sin aire) y estética genérica "hecha por IA".
- Cada estado interactivo (hover/active/focus) responde de forma física y sutil (scale ~0.97–1.02, sombra), nunca instantáneo ni con rebote elástico.

---

## 5. Animaciones (GSAP)

- Se usa **GSAP** (+ `@gsap/react`) para animaciones y transiciones que aporten valor real a la experiencia — no decorativas porque sí.
- Deben mejorar la percepción de fluidez e inmersión (coherente con el eje "cálida, precisa, inmersiva" de la marca), sin perjudicar rendimiento ni accesibilidad (respetar `prefers-reduced-motion`).
- Casos de uso naturales: transiciones entre vistas/galería de fotos, entrada de cards de resultados, popups del mapa, micro-interacciones en hover/click de botones y pines, transiciones de dashboard/estadísticas, apertura de bottom sheets en mobile.
- La skill `skillsgpt-tasteskill` es la que rige específicamente el uso avanzado de GSAP (ScrollTrigger con pinning/stacking/scrubbing, tipografía editorial ancha, bento grids, espaciado de sección) y la skill `animate` se usa para revisar features ya construidas y sumarles micro-interacciones puntuales.

---

## 6. Responsive

- La experiencia debe funcionar perfectamente en **desktop, tablet y especialmente mobile** (uso mobile-first en la práctica, dado el perfil de usuario).
- El mapa, los filtros y las fichas de propiedad deben adaptarse sin perder la lógica de "mapa como protagonista": en mobile, overlays tipo bottom sheet en vez de paneles laterales fijos.
- Se usa la skill `adapt` para breakpoints, layouts fluidos y touch targets cuando haga falta ajustar algo específico de responsive.

---

## 7. Skills de frontend a usar (obligatorio, por instrucción del proyecto)

Siempre que se trabaje en frontend, usar:
- **`skillsgpt-tasteskill`** — motion engineering avanzado con GSAP, estructura AIDA, tipografía editorial ancha, bento grids, espaciado de sección.
- **`emil-design-eng`** — filosofía de pulido de UI, diseño de componentes, decisiones de animación y detalles invisibles que hacen que el software se sienta cuidado.
- **`impeccable`** — construcción de interfaces distintivas y de calidad de producción, evitando la estética genérica de IA (contexto de diseño ya seteado en `.impeccable.md`).
- **`animate`** — revisión de features ya construidas para sumar animaciones y micro-interacciones con propósito.

Complementarias, usar cuando el caso lo amerite (no obligatorias en cada tarea): `adapt` (responsive), `layout` (espaciado/jerarquía), `typeset` (tipografía), `polish` (pasada final pre-entrega), `optimize` (performance de UI), `audit` (accesibilidad/perf/theming).

---

## 8. Stack tecnológico

- **Next.js 16** fullstack único (App Router + Route Handlers) + **React 19** + **TypeScript strict**.
- **TailwindCSS v4** — tokens en OKLCH en `src/app/globals.css`.
- **GSAP** + `@gsap/react` para animaciones.
- **MongoDB Atlas + Mongoose 9** como base de datos.
- **Auth.js v5** (`next-auth@beta`), Credentials provider, sesiones JWT.
- **Mapa**: MapLibre GL + tiles de OpenFreeMap (`positron`/`dark`, gratis, sin API key) + clustering (si hay una mejor opcion recomienda) client-side con `supercluster`. Búsqueda de direcciones vía Nominatim (proxeado server-side).
- **Media**: Cloudinary detrás de una interfaz `StorageProvider` propia (con fallback local en dev).
- **Digital Twin / 3D**: foto 360° (equirectangular) subida por la inmobiliaria como una imagen común (mismo storage/flujo que las fotos de la propiedad) y renderizada con un visor propio, `react-photo-sphere-viewer` + `@photo-sphere-viewer/core` (WebGL/Three.js, gratuito) — ya no hay links de proveedores externos (Matterport/Polycam/Kuula) ni archivos `.glb/.gltf/.usdz`. **Modo inmersivo** opcional en mobile (`@photo-sphere-viewer/gyroscope-plugin`, gratuito): botón "Modo inmersivo" que, sólo en dispositivos con sensor de orientación, sigue el movimiento físico del teléfono para mirar alrededor (nunca aparece en desktop).
- **Deploy**: pensado para Netlify (frontend/fullstack) y/o Render; repositorio en GitHub.
- **Cero IA de pago y cero APIs de IA pagas** en todo el proyecto — recomendaciones y estadísticas se resuelven con lógica de reglas sobre los datos propios.

---

## 9. Seguridad

- No se debe subir nada peligroso ni introducir vulnerabilidades típicas (inyección, XSS, exposición de datos, etc.).
- Alta de inmobiliarias restringida exclusivamente a admin/proveedor — nunca autoservicio.
- **Pendiente de resolver**: el archivo `CLAUDE.md` (versionado en git) contiene una contraseña de GitHub en texto plano. No debe usarse nunca esa contraseña para operaciones reales — usar `gh auth login` o un token, y en algún momento sacar la contraseña del archivo y rotarla.

---

## 10. Forma de trabajo (proceso)

- Al terminar una tarea, hacer commit de todo lo realizado antes de pasar a la siguiente, para poder ver cómo quedaron los cambios.
- Cuando se esté por agotar el límite de la sesión, cerrar rápido la tarea en curso dejando la web funcional, commitear, y continuar en la siguiente sesión.
- Verificar siempre `npm run typecheck` / `lint` / `build` en verde antes de cada commit (patrón ya establecido en las sesiones anteriores).
