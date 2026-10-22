# Recorrr(ese nombre sera por ahora como provisional, luego quiza lo cambie) — Contexto maestro del proyecto

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
3. **Gestionar una inmobiliaria** — al crear la cuenta (`/crear-cuenta`) se elige con dos tarjetas: *Explorar propiedades* o *Gestionar una inmobiliaria*. La segunda lleva a `/solicitar-inmobiliaria` (requiere cuenta): el formulario guarda una `AgencyRequest`, **notifica dentro de la plataforma a todos los admins** y ofrece abrir WhatsApp con el proveedor (+54 9 11 3779-6683) — el WhatsApp se mantiene como canal de validación, la notificación web es el recordatorio y punto de gestión. El admin aprueba o rechaza en `/admin/solicitudes` (badge con pendientes); aprobar usa `grantAgencyAccess()` (el mismo flujo de `/admin/accesos`), el usuario recibe una notificación `agency_approved` ("¡Felicitaciones! Ya tenés permiso para crear tu inmobiliaria.") y un cartel que se muestra **una sola vez** (se marca leída al mostrarlo) y refresca su sesión. Después crea su inmobiliaria en `/publicar`. **Solo el proveedor o un admin** (quien entre con el correo de Google del admin ssantii200@gmail.com, `ADMIN_EMAILS`) pueden crear, editar o eliminar inmobiliarias y dar permisos; una inmobiliaria solo gestiona, edita y ve métricas de **su propia** inmobiliaria.

**Accesos al panel (hero, mapa y menú).** `resolvePanelLink()` (`src/lib/auth/panel-link.ts`, módulo puro) decide a dónde va cada persona: inmobiliaria con agencia → `/dashboard`; sin agencia → `/publicar`; admin → `/admin`; quien sólo explora → **Mi espacio** (`/espacio`). En el mapa hay un atajo (círculo de 40 px en mobile, ícono + texto desde `sm`); el servidor lo calcula con `getFreshAccount` (rol de la base, no de la cookie). En el hero, **sólo quien explora con cuenta** ve "Explorar" como menú con dos opciones (Mapa / Mi espacio); visitantes, inmobiliarias y admin siguen con Explorar directo al mapa.

**Mi espacio (`/espacio`)**: panel de quien explora — indicadores (guardadas, me gusta, comentarios, siguiendo, sin leer), recomendados con su motivo, guardadas, me gusta, vistas recientemente, comentarios, novedades, inmobiliarias que sigue y preferencias. Exige sesión; quien tiene inmobiliaria o es admin es redirigido a su panel. `/perfil` se conserva para editar preferencias.

**Eliminar una inmobiliaria (admin)**: `DeleteAgencyButton` abre `ConfirmDialog` (cartel centrado, Esc/clic afuera cancelan, no se cierra mientras borra) con lo que se pierde. La cascada (`deleteAgencyCascade`) crea antes de purgar las cuentas un `AgencyDeletionNotice` por email (TTL 180 días); la primera vez que esa persona vuelve a entrar (cuenta recreada) `NotificationBell` muestra `AgencyDeletedNotice` — qué pasó, "Contactar con el admin" (WhatsApp) y "Cerrar" — **una sola vez** (`PATCH /api/notifications` con `deletionNoticeId`, sólo del propio email). Quien vuelve queda como usuario común y debe pedir permiso otra vez.

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
- Clustering numerado cuando hay muchas propiedades cercanas. Un pin suelto es un **punto de acento** con zoom < 12 y el **logo de la inmobiliaria** (círculo con su inicial si no tiene logo; insignia si tiene recorrido 360°) desde zoom 12; el precio ya no va en el pin sino en el popup y las tarjetas (`lib/map/markers.ts`, `PIN_DETAIL_ZOOM` en `MapCanvas.tsx`).
- **Rendimiento de imágenes**: `next/image` usa un loader global (`lib/images/loader.ts`, `images.loaderFile`) que pide a Cloudinary/Unsplash la foto ya reducida (`w_…,q_auto,f_auto`) en vez de pasar por el optimizador de Next (que bajaba el original; medido 4,6 s la primera vez). Las fotos comunes se limitan a 2560 px al subirlas; la 360° no. El loader redondea los anchos a 128/640/1080/1920 px (máx. 4 versiones por foto en Cloudinary). **El mapa abre encuadrando todo AMBA** (`MAP_DEFAULTS.bounds` como `bounds` del mapa, con padding por el panel): con centro+zoom fijos en CABA, propiedades del conurbano como Ezeiza quedaban fuera de la pantalla y parecía que no estaban. La vista inicial del mapa (sin filtros) se cachea 5 min en `sessionStorage` y se refresca en segundo plano.
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
- Recomendaciones por **lógica tradicional basada en datos** (`lib/recommendations/engine.ts`): preferencias explícitas + **perfil de gustos** calculado de la actividad real (vistas, permanencia, comentarios, me gusta, compartidas, guardados, consultas, puntajes y seguir inmobiliarias; decaimiento con vida media de 30 días, ver `lib/intelligence/user-profile.ts`) + filtrado colaborativo simple ("quienes guardaron lo mismo también guardaron…") + calidad/frescura. Excluye lo ya guardado o consultado. Cada recomendación trae su **motivo** en lenguaje simple ("Encontramos una propiedad similar a las que guardaste.", "…coincide con tus preferencias de ubicación y precio.", "…está cerca de una zona que te interesa."), visible en la card. Arranque en frío: lo que más interés tiene en la plataforma esta semana. Mejora sola a medida que el usuario interactúa.
- Arquitectura preparada para evolucionar a sistemas de recomendación más avanzados en el futuro, sin romper lo existente.

### Notificaciones
- Primera versión: **internas**, visibles al ingresar a la plataforma (campana + página `/notificaciones` con filtros por grupo; no push, no email todavía).
- Tipos: `new_match`, `price_drop`, `recommendation`, `comment_reply`, `activity`, `system`, `agency_request`, `agency_approved`, `agency_rejected`, `lead`, `opportunity`, `follow_new_property`, `admin_alert`, `social_post`. Icono y grupo por tipo en `components/notifications/notification-meta.ts`.
- `Notification.dedupeKey` (índice único parcial por usuario) evita repetir avisos (`reco:<propiedad>`, `opp:<hallazgo>:<semana>`, `follow:<propiedad>`…). `createNotification`/`createNotificationForMany`/`notifyAdmins` nunca lanzan.
- Sin cron: las notificaciones "inteligentes" se generan **de forma lazy en `after()`** cuando alguien consulta sus notificaciones (recomendaciones, máx. 2/día), abre su panel (oportunidades, 1/hora por agencia) o abre `/admin` (alertas, cada 30 min). Ver `lib/intelligence/notify.ts`.
- Al publicar una propiedad por primera vez (alta o publicar un borrador) se avisa a seguidores de la inmobiliaria y a quienes encajan por preferencias o gustos (`lib/notifications/new-property.ts`).
- Preparado para evolucionar a push/email/otros canales más adelante.

### Dashboard de inmobiliaria (gestión)
Navegación: Resumen · Propiedades · Clientes · Oportunidades · Contenido para redes · Mi inmobiliaria · **Asesor** (abre el escenario del asesor, no es una página; ver §13). El admin agrega "Inmobiliarias" y elige la agencia con `?agencyId=`.
- ABM completo de propiedades: fotos, fotos 360° y recorrido navegable, **videos de YouTube**, precios, ubicación, características, publicación.
- **Resumen inteligente** (`/dashboard`): 9 indicadores con variación contra la semana anterior y miniatura (propiedades publicadas, visitas, visitas únicas, favoritos, me gusta, consultas, compartidas, visitas a recorridos 360°, tiempo promedio), tendencia de 30 días, embudo de conversión (visitas→favoritos, visitas→consultas, consultas→visitas presenciales) contra propiedades similares, y los bloques "¿Qué funciona? / ¿Qué necesita atención? / Oportunidades".
- **Centro de oportunidades** (`/dashboard/oportunidades`): hallazgos por reglas sobre datos reales, con explicación, evidencia numérica y acción sugerida con link; filtros por tipo y prioridad.
- **Estadísticas por propiedad** (`/dashboard/propiedades/[id]/estadisticas`): diagnóstico, conversión y ambientes del recorrido 360° más visitados.
- **Clientes potenciales / leads** (`/dashboard/clientes`): consultas del formulario de la ficha, etapas nuevo → contactado → visita solicitada → visita realizada → oferta → cerrado, notas, último contacto y detección de "sin seguimiento" (nuevo > 24 h, o abierto > 7 días sin contacto). Sólo los ve la inmobiliaria dueña.
- **Contenido para redes** (`/dashboard/contenido`): publicaciones 4:5 (1080×1350) listas para compartir, armadas **sin IA** con fotos normales + datos de la propiedad + 6 templates (Editorial, Split, Marco, Columna, Tarjeta flotante, Nocturno; todos con nombre/logo y color de la inmobiliaria). Sólo propiedades `published` con fotos de `media.images`; **las fotos 360° (`media.tours`) y los planos nunca se usan**. Ver §11 para el motor.
  - **Primera vez**: "¿Cómo querés preparar tus publicaciones?" con *Automático (recomendado, preseleccionado)* y *Manual*. La elección es **persistente** (`SocialContent.mode`) y siempre se puede cambiar desde "Modo de preparación".
  - **Automático**: siempre hay *Publicación de hoy* + *Próxima publicación (Preparada ✓)*. Al cambiar el día la próxima pasa a ser la de hoy y se prepara otra nueva; evita repetir propiedad, foto y template recientes. **Sin cron**: se avanza de forma perezosa cuando alguien de la inmobiliaria abre el panel o consulta notificaciones, así funciona aunque el servidor gratuito haya estado dormido.
  - **Manual**: "Elegir propiedad" → se genera y se muestra al instante. No se prepara nada para mañana; al día siguiente hay que volver a elegir. Pasar de automático a manual **elimina la próxima** (con cartel de confirmación); de manual a automático se retoma el ciclo (actual + próxima).
  - **Regenerar**: otro template y, si hay, otra foto; reemplaza la anterior. **3 por día por inmobiliaria** (no acumulables, se reinician al cambiar el día en hora Argentina); la primera publicación del día es gratis, y en manual cambiar de propiedad también consume 1. La próxima no consume. **El admin no tiene límite.**
  - **Descargar** el PNG; notificación interna `social_post` ("Tu publicación está lista.") con link a la sección cuando se genera una publicación nueva sola.
- **Mi inmobiliaria** (`/dashboard/inmobiliaria`): edita su perfil público (logo y portada por upload propio, contacto, descripción) y vincula su canal de YouTube.
- Panel de administración global (rol admin/proveedor): gestiona todas las inmobiliarias y puede publicar/reasignar propiedades entre ellas. Pestañas: Inmobiliarias · Solicitudes · Propiedades · Accesos · Estadísticas · **Asesor** (`/admin/asesor`, el estudio del asesor, ver §13). `/admin/estadisticas`: actividad por inmobiliaria, propiedades con más interés, qué crece (comportamientos, zonas, tipos), crecimiento de usuarios y "requiere atención" (solicitudes +48 h, clientes sin seguimiento, inmobiliarias sin visitas o sin propiedades).

### Perfil público de inmobiliaria y seguidores
- `/inmobiliarias/[slug]` (sólo activas): portada, logo, descripción, contacto, propiedades por tipo, **Seguir** (idempotente, `AgencyFollow` + `Agency.stats.followers`) y **Ver en mapa** → `/mapa?agency=<id>` (mismo mapa general, filtrado y encuadrado, con chip removible).
- La ficha de propiedad y el popup del mapa muestran la inmobiliaria (logo + nombre) enlazada a su perfil.

### Videos de YouTube
- Sin OAuth ni API key: el canal se vincula por link/@handle y se leen sus videos públicos con el **feed RSS** (`lib/media/youtube-server.ts`, últimos ~15 incluidos Shorts); un video suelto se valida con **oEmbed**. Hosts fijos y ids validados por regex (sin SSRF). Sólo se guarda el `videoId`; `url` y miniatura las deriva el servidor.
- En la ficha viven **debajo de descripción y comodidades** (no junto a fotos/360°): carrusel con snap, Shorts 9:16 y videos 16:9, fachada con miniatura y reproductor `youtube-nocookie` que carga al tocar play. Hasta 8 por propiedad.

### Multi-tenant ("Shopify de las inmobiliarias")
- Cada inmobiliaria tiene su propio perfil, catálogo de propiedades y dashboard aislado.
- Alta de inmobiliarias controlada exclusivamente por admin/proveedor (vía contacto de WhatsApp, no autoservicio).
- **Eliminar una inmobiliaria** (sólo admin) la borra **en cascada** (`lib/admin/delete-agency.ts`): propiedades con sus me gusta, favoritos, puntajes, comentarios y estadísticas; fotos, fotos 360°, logo y portada en el storage (`deleteAgencyAssets`, por prefijo `umbral/agencies/<id>/` en Cloudinary); clientes potenciales, seguidores, permisos, solicitudes y las **cuentas completas** de quienes la gestionaban con su actividad (`lib/admin/purge-user.ts`, que además corrige los contadores de otras propiedades/inmobiliarias). Nunca toca a un admin. Si esas personas se registran de nuevo empiezan de cero y deben pedir permiso otra vez. El panel de admin muestra con números qué se va a perder antes de confirmar.

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
- **Lenguaje del hero en el resto del sitio (en voz baja).** El hero y las secciones del landing (`HeroStage`, `HomeSections`, reglas `.hero-*`/`.home-*`) no se tocan. Las demás páginas toman su vocabulario con piezas compartidas y livianas: `PageHeader` (eyebrow en pastilla `.hero-eyebrow` + `.page-title` de Bricolage liviano + bajada, entra con `.rise-group`), `.rise` (CSS puro: sube 14 px y se funde con `animation-fill-mode: backwards`, retraso `--rise-i`; sin JS, así no parpadea al hidratar; se usa en cards de `PropertyCard`/`PropertyGrid` con `revealIndex`), `Reveal` (aparición al hacer scroll sólo para bloques que están **debajo** de la primera pantalla; un único IntersectionObserver, sin ScrollTrigger), `CountUp` (cuenta hasta el valor real al verse; el servidor ya manda el número final), sombras en capas `shadow-layer`/`shadow-layer-hover` globales (hover de cards, tarjetas grandes), subrayado `.nav-link`, y en el panel `.chart-draw` / `.chart-fade` / `.bar-grow` (líneas, áreas y barras que se dibujan una vez). Quedan **fuera a propósito**: el mapa, la galería y el visor 360, los formularios del panel y el estudio del asesor.
- **Reglas de rendimiento para cualquier movimiento nuevo:** sólo `transform`, `opacity`, `clip-path` y `stroke-dashoffset` (nunca layout ni el tamaño de un canvas); desenfoque sólo en títulos y sólo con puntero fino; nada de ScrollTrigger fuera del landing; no ocultar contenido que ya está a la vista al hidratar; todo se apaga con `prefers-reduced-motion`.
- **La mascota del asesor se achica con el scroll de forma continua** (`components/advisor/useHeroCollapse.ts`, sólo <1024 px): el progreso sigue al scroll con una curva suave e inercia (`quickTo`, power3.out) y sólo escribe `transform` (la mascota escala y un velo del color del fondo sube); el canvas 3D nunca se redimensiona y el alto del hilo no depende de la mascota, por eso no hay saltos ni rebote. En desktop el escenario no cambia.

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
  - **Vista 360° vs Recorrido 360°**: la ficha tiene tres tabs — *Fotos*, *Vista 360°* (fotos 360 sueltas, como antes) y *Recorrido 360°* (navegable). El recorrido es un grafo: `media.tours[]` son escenas (`id`, `label`, `photo360Url`, `links[]`, `graph{x,y}`) y cada `link` es un marcador anclado en la esfera (`yaw/pitch` en radianes) con `targetId` y la vista de llegada (`arrivalYaw/Pitch`). `media.virtualTour = { enabled, startId }`. Hasta 20 fotos y 12 marcadores por foto. Plugin: `@photo-sphere-viewer/markers-plugin` (los marcadores se arman con DOM + `textContent`, nunca `html`, por XSS). Código compartido en `src/components/tour/`; visor público `VirtualTourViewer`; editor (overlay a pantalla completa, portal) en `src/components/dashboard/tour-editor/` (click en la esfera → título → destino → alinear vista de llegada; el vínculo de vuelta se crea solo y es editable) y vista de nodos con `@xyflow/react`.
- **Asesor inteligente (mascota 3D)**: GLB propio (`public/advisor/agent.glb`, 6 animaciones) renderizado con three.js "plano" (sin React Three Fiber: `GLTFLoader` + `AnimationMixer`, `RoomEnvironment` para los materiales sheen/clearcoat), cargado de forma diferida sólo al abrir el escenario. El motor de consultas es **100 % reglas** (sin IA ni APIs de pago). Ver §13.
- **Deploy**: pensado para Netlify (frontend/fullstack) y/o Render; repositorio en GitHub.
- **Cero IA de pago y cero APIs de IA pagas** en todo el proyecto — recomendaciones y estadísticas se resuelven con lógica de reglas sobre los datos propios.

---

## 9. Seguridad

- No se debe subir nada peligroso ni introducir vulnerabilidades típicas (inyección, XSS, exposición de datos, etc.).
- Alta de inmobiliarias restringida exclusivamente a admin/proveedor — nunca autoservicio: la persona **solicita**, el admin aprueba. `/api/agency/onboarding` confirma rol y agencia contra la base (no contra el JWT, que puede estar desactualizado 5 min) y reserva la agencia de forma atómica.
- **Aislamiento entre inmobiliarias**: todo endpoint/página del panel pasa por `agencyScope(access, requested)` (`lib/auth/agency-scope.ts`): dueños/agentes siempre quedan en su propia `agencyId` (cualquier otra se ignora); sólo el admin puede elegir. El filtro va dentro de la query, así un recurso ajeno es indistinguible de uno inexistente (404).
- **Sesión y permisos siempre al día**: el JWT guarda el rol y la agencia con los que la persona se logueó y puede quedar desactualizado (recién aprobada la solicitud, recién creada la inmobiliaria, inmobiliaria borrada). Por eso **toda decisión de acceso o de qué mostrar según el rol sale de la base** (`getFreshAccount`, `lib/auth/fresh-account.ts`): `requireDashboardAccess`, `/publicar`, `/solicitar-inmobiliaria`, el CTA del hero y el menú del header (el layout raíz reemplaza el rol del JWT por el real). El middleware (`proxy.ts`) sólo exige tener sesión para `/dashboard` y `/publicar` (no puede consultar la base); `/admin` sigue exigiendo rol admin. El JWT se relee cada 60 s, y cada 10 s mientras la persona espera la aprobación o aún no creó su inmobiliaria; si la cuenta ya no existe el callback `jwt` devuelve `null` y la sesión se cierra sola. Los flujos del cliente no dependen de `useSession().update()` (no hace nada si hay otra carga de sesión en curso): navegan con carga completa.
- **Rate limiting** (`lib/security/rate-limit.ts`): `rateLimit`/`limitOr429` respaldados por Mongo (ventana fija, `$inc` atómico, TTL — válido entre instancias serverless) y `softLimitOr429` en memoria para lecturas públicas muy frecuentes. Aplicado a tracking, consultas, solicitudes, contenido para redes (modo, generar, imagen), registro, comentarios, like/favorito/rating, subidas, seguir, YouTube y geocodificación; los endpoints sensibles fallan cerrado.
- Formularios públicos (consulta, solicitud): honeypot que responde 201 en silencio, validación con zod, nada de `dangerouslySetInnerHTML`; los textos de usuario se renderizan como texto.
- Render de publicaciones (`resolveImage`): sólo se leen fotos de Cloudinary, Unsplash (demo) por https o `/uploads/` local (basename validado), nunca otra URL (sin SSRF); el color de marca se valida como hex y los textos se dibujan como texto, no HTML.
- Imágenes de logo/portada: sólo URLs de nuestro storage (Cloudinary o `/uploads/`), nunca externas. YouTube: hosts fijos + ids por regex; el cliente sólo manda `videoId`.
- `callbackUrl` de login validado (`lib/auth/safe-redirect.ts`): sólo rutas internas, sin open redirect.
- Datos personales: los leads los ve únicamente la inmobiliaria dueña (y el admin); las estadísticas son agregadas. La cookie de visitante `rid` es anónima, httpOnly y sólo sirve para contar visitantes únicos.
- **Asesor**: el modo y el alcance se resuelven en el servidor (`lib/advisor/access.ts`: `requireDashboardAccess` + `agencyScope`; admin sin agencia = toda la plataforma) y NUNCA salen del cliente; los ids del contexto/consultas estructuradas se vuelven a validar contra la cartera real (lo ajeno desaparece), zod estricto, rate limit por usuario/IP. Sin cuenta sólo existe el modo explorador, con cupo de 2 preguntas controlado en el servidor (cookie `rid` + respaldo por IP, falla cerrado). Las preguntas no entendidas se guardan anónimas y enmascaradas (sin emails, links ni teléfonos), 90 días. Las rutas `/api/admin/advisor/*` exigen admin confirmado contra la base (`requireFreshAdmin`); el modelo 3D sólo puede ser el incluido o un `.glb` de NUESTRA carpeta de Cloudinary, verificado en el servidor (peso, ubicación y firma glTF) — una URL ajena se descarta al normalizar.
- ⚠️ **Credencial expuesta (acción del dueño de la cuenta, urgente)**: la contraseña de GitHub estuvo en texto plano en `CLAUDE.md` del **primer commit (`062f5b6`), que está en `origin/main` de un repositorio público**. Se quitó del archivo en `1f12f22`, pero eso no la borra del historial. La única forma de invalidarla es **cambiarla en github.com** (Settings → Password and authentication), **activar 2FA** y cambiarla en cualquier otro sitio donde se reutilice. Se decidió no reescribir el historial (no des-filtra la clave: puede haber forks, cachés o clones). No volver a escribir credenciales en `CLAUDE.md` ni en ningún archivo versionado: usar `gh auth login` o un token.
- El secret de Google OAuth **nunca llegó al repositorio** (verificado: 0 coincidencias en el árbol y en todo el historial; `.env*` está en `.gitignore`). Rotarlo en Google Cloud es sólo una precaución, porque alguna vez estuvo en un archivo sin ignorar del working tree.

---

## 10. Forma de trabajo (proceso)

- Al terminar una tarea, hacer commit de todo lo realizado antes de pasar a la siguiente, para poder ver cómo quedaron los cambios.
- Cuando se esté por agotar el límite de la sesión, cerrar rápido la tarea en curso dejando la web funcional, commitear, y continuar en la siguiente sesión.
- Verificar siempre `npm run typecheck` / `lint` / `build` en verde antes de cada commit (patrón ya establecido en las sesiones anteriores).

---

## 11. Datos e inteligencia (arquitectura)

**Principio**: una sola inteligencia basada en datos (reglas, estadísticas, comparaciones), sin IA ni servicios pagos, que alimenta recomendaciones, panel, diagnósticos, oportunidades, admin y notificaciones.

- **Captura de eventos**: `POST /api/track` (beacon, cookie anónima `rid`, descarta bots, dedupe de vistas a 30 min) registra vista, permanencia, compartir, contacto (WhatsApp/llamada/email), apertura del 360° y escena vista. `recordEvent()` (`lib/tracking/record.ts`) es el punto único de escritura: agrega al log `Interaction` e incrementa el rollup diario `PropertyDailyStat` (`$inc` + upsert por propiedad y día, día en hora Argentina). Las vistas del dueño/admin y de borradores no cuentan.
- **Escalabilidad**: dashboards e inteligencia leen el rollup (O(propiedades × días)), nunca escanean `Interaction`. Cálculos pesados cacheados en memoria con TTL (`lib/intelligence/cache.ts`): benchmarks 10 min, inteligencia por agencia 60 s.
- **Módulos** (`src/lib/intelligence/`): `metrics` (ventanas 7d / 7d previos / 30d, embudos, serie diaria, escenas), `benchmarks` (medianas de la plataforma y por tipo+operación), `diagnostics` (12 reglas puras con umbrales mínimos de datos en `THRESHOLDS`), `opportunities` (`getIntelligence(agencyId|null)`), `admin` (`getAdminIntelligence`), `user-profile` (perfil de gustos, cacheado en `UserTasteProfile`, se recalcula a las 6 h o con actividad nueva), `notify`.
- **Modelos nuevos**: `RateLimit`, `PropertyDailyStat`, `AgencyRequest`, `Lead`, `AgencyFollow`, `UserTasteProfile`. `Interaction` suma `inquiry`/`dwell`/`tour_scene`/`follow`; `Agency` suma `stats.followers` y `youtube`; `Property.media.videos` guarda `videoId`/`title`/`orientation`.
- **Honestidad con pocos datos**: no se diagnostican tasas con < 30 visitas, "pocas visitas" sólo si la plataforma ya tiene tráfico medido, y las alertas de "sin actividad" no se emiten si nadie recibió visitas.
- **Contenido para redes** (`src/lib/social/`): **no se guarda ninguna imagen**. `SocialContent` (uno por inmobiliaria, `agencyId` único) guarda `mode`, y dos *recetas* (`current`, `next`: propiedad + foto + template + día + versión), el contador `regen{day,count}` y colas `recent` para rotar. El PNG se dibuja al vuelo con `next/og` (`render.tsx`, `templates.tsx`, tipografías Bricolage/Manrope `.woff` OFL en `src/lib/social/fonts/`, incluidas en el deploy vía `outputFileTracingIncludes`). Por eso nunca hay archivos que borrar y la imagen siempre refleja el precio actual; sólo existen actual + próxima. `engine.ts`: `ensureToday` (avance del día idempotente, bloqueo optimista por `updatedAt`, descarta propiedades despublicadas o sin esa foto), `generateCurrent`, `setMode`, `getState`, `maybeAdvanceSocial` (lazy, 10 min por inmobiliaria, se dispara desde `dashboard/layout.tsx` y `/api/notifications`). API: `/api/dashboard/social` (GET estado, PATCH modo), `/generate`, `/image?slot=current|next[&download=1]`. Todas con `requireDashboardAccess` + `agencyScope` (el admin elige con `?agencyId=`). Se borra en cascada con la inmobiliaria.
- **Datos de prueba**: para verificar reglas y pantallas se insertan filas sintéticas y se borran al terminar; nunca dejar datos de prueba en la base.

### Pendiente / siguientes pasos
- **Asesor**: el usuario todavía no le puso nombre (se muestra "Asesor"); definirlo en `/admin/asesor`. Falta probarlo en un celular real (se verificó en Chrome a 390×844) y con `prefers-reduced-motion`. Ideas fuera de alcance: más intenciones/sinónimos a partir de "Preguntas que no entendió", llevar el motor a un modelo de lenguaje sólo si algún día conviene (la capa de interpretación está separada), cron real para el briefing.
- En Cloudinary quedan 2 carpetas de septiembre (`umbral/agencies/6a9a1285…` y `6a9daf06…`, 4 archivos) de inmobiliarias borradas antes de existir la cascada; ya no tienen dueño y se pueden eliminar.
- Probar visualmente en navegador real (esta etapa se verificó por API, HTML servido y scripts; los gráficos SVG se renderizan en el cliente).
- Deploy a Netlify/Render con las variables de entorno (ver SETUP.md) y confirmar el límite real de payload en subidas.
- **Cambiar ya la contraseña de GitHub** (quedó en el historial público; ver sección 9) y activar 2FA. Rotar el secret de Google OAuth es opcional.
- Contenido para redes, ideas fuera del alcance de la v1: formato historia 9:16, programar/publicar directo en redes, más templates, textos/hashtags sugeridos.
- Ideas para vender (no implementadas): informe compartible para el propietario, precio por comparables, agenda de visitas, QR para carteles, exportación a portales, asignación de leads a agentes, micrositio propio.

---

## 12. Propuesta de valor (qué vendemos)

**En una línea**: una plataforma lista para usar donde cada inmobiliaria tiene su vitrina, su panel y sus recorridos 360° propios, y recibe —con datos reales— qué hacer para vender más, sin armar nada ni pagar IA.

**Qué problema resuelve**

| Problema de la inmobiliaria | Cómo lo resolvemos |
|---|---|
| No sabe si una publicación funciona | Panel con visitas únicas, conversiones y un diagnóstico en lenguaje simple por propiedad |
| Las consultas se pierden o se enfrían en WhatsApp | Clientes con etapas (nuevo → cerrado), notas y alertas de "sin seguimiento" |
| Fotos planas que no logran visitas | Recorridos 360° navegables propios, sin Matterport ni hardware especial |
| Depende de portales ajenos donde es un aviso más | Perfil propio con seguidores, mapa filtrado y videos de su canal de YouTube |
| No sabe qué mejorar | Centro de oportunidades con la acción sugerida y el link para hacerla |
| Los compradores no encuentran ni vuelven | Recomendaciones con su motivo, favoritos, me gusta y notificaciones |

**En qué se diferencia**
- Los portales tradicionales son un catálogo anónimo con métricas básicas; acá hay **identidad propia + inteligencia accionable**.
- **Costo marginal bajo**: mapa gratuito tipo Google Maps, y análisis y recomendaciones por reglas sobre datos propios (sin IA ni APIs pagas).
- Modelo **multi-tenant** ("Shopify de las inmobiliarias"): alta controlada por el proveedor y datos de cada inmobiliaria aislados.

**Para quién**: inmobiliarias chicas y medianas, empezando por AMBA.

---

## 13. Asesor inteligente (motor sin IA + mascota 3D)

**Qué es.** Un asesor con identidad propia (nombre, descripción y modelo 3D que define el admin) que responde preguntas en lenguaje natural con los datos reales de la plataforma, **sin IA ni APIs de pago**: es un motor de reglas (sinónimos, entidades, puntajes) que se apoya en lo que ya existía (`getIntelligence`, rollup diario, diagnósticos, recomendador). Vive en una capa flotante del layout raíz: botón en pantalla → **escenario a pantalla completa** (desktop: mascota a la izquierda + charla a la derecha; mobile: mascota arriba, chips en carrusel y compositor fijo). La charla está **sólo en memoria del navegador**: sobrevive a la navegación y se pierde al refrescar.

**Dos públicos.** *Inmobiliaria* (admin o gestor con inmobiliaria ya creada; el admin sin agencia ve toda la plataforma): analiza su negocio. *Explorador* (cualquiera): busca, recomienda y compara con datos públicos; sin sesión tiene **2 preguntas gratis en total** (el saludo, las sugerencias que se muestran al abrir, las aclaraciones y lo que no entiende no cuentan) y después pide crear cuenta/ingresar.

**Arquitectura (4 capas, `src/lib/advisor/`).** (A) datos: `data/portfolio.ts` (propiedades + métricas + diagnósticos reutilizando `getIntelligence`), `data/market.ts` (mercado público), `data/activity.ts`, `data/periods.ts`. (B) interpretación: `nlu/` — `normalize` (tildes, "120 mil", "u$s", %, números en letras, stemmer liviano), `fuzzy` (errores de tipeo), `lexicon` (conceptos y sinónimos), `entities` (zonas y propiedades reales del alcance, tipos, montos, ambientes, período, referencias "esa"/"la primera"), `intents` (señales + frases de ejemplo), `classify` (puntaje; con poca confianza **pide aclaración** y nunca inventa; resuelve seguimientos tipo "¿y en Canning?"). (C) análisis: `analysis/agency/*` (23 handlers) y `analysis/explorer/handlers.ts` (10), `analysis/correlate.ts` (cruza resultados con cambios recientes y diagnósticos). (D) presentación: `compose/` (frases con variantes deterministas, bloques, sugerencias). `engine.ts` orquesta; agregar una intención = una entrada en `nlu/intents.ts` + su handler.

**Intenciones de inmobiliaria**: resumen · una métrica puntual · peor/mejor rendimiento · muchas visitas y pocas consultas · investigar por qué (compara con las que sí convierten: precio/m², fotos, descripción, video, 360°, tiempo en ficha, cambios recientes) · cambios contra el período anterior · qué revisar primero · comparar zonas · qué tipo de propiedad rinde más · rasgos de las que mejor funcionan · acciones recomendadas · fotos · publicaciones incompletas · sin consultas · oportunidades · **simulación de precio (hipotética, nunca promete resultados)** · precios similares con distinto interés · qué promocionar · qué cambié (línea de tiempo) · **impacto de un cambio** (antes/después en ventanas iguales + grupo de control = resto de la inmobiliaria en las mismas fechas; si no hay datos suficientes lo dice) · cómo va una propiedad · clientes sin seguimiento. **Honestidad**: con poco tráfico dice que no hay datos para rankear en vez de listar al azar; compara por publicación, informa mínimos de datos y distingue cálculo hipotético de resultado real.

**Explorador**: búsqueda natural ("departamento de 2 ambientes en Palermo hasta 120 mil dólares con cochera", afloja un criterio por vez y lo informa) · recomendaciones con motivo · bajas de precio (últimos 30 días, misma moneda) · precio típico por zona/tipo · comparar propiedades · "¿está bien de precio?" contra comparables (no es una tasación) · con recorrido 360° · novedades · populares · inmobiliarias por zona.

**El asesor sabe lo que hace la inmobiliaria.** `ActivityLog` (`lib/db/models/ActivityLog.ts`, `lib/activity/{diff,log}.ts`) registra cada cambio (precio, descripción, fotos y portada, videos, 360°, estado, ubicación, comodidades, perfil, YouTube, etapa de un cliente, modo de redes; el admin también) con antes/después acotados y **sin datos personales de clientes**; se escribe en `after()` y nunca rompe la acción original; TTL 2 años; se borra con la inmobiliaria. `touchAgencyData()` descarta las cachés al instante tras cada mutación (`invalidateAgency`). Sólo se usa dentro del asesor (no hay vista de "Actividad" en el panel).

**Briefing proactivo** (`briefing.ts`, `POST /api/advisor/briefing`): al abrir, saludo + 1–2 titulares + hasta 6 preguntas sugeridas con el dato de adelanto ("+68 % visitas/día", "4 clientes"), generadas de cambios recientes (¿sirvió bajar el precio?), hallazgos severos, clientes sin seguimiento, variaciones de la semana y huecos de demanda; la clave de caché incluye la última acción registrada, así cambia apenas se edita algo. El explorador recibe sugerencias según su perfil de gustos y, en una ficha, sobre esa propiedad. Los botones "Investigar por qué" en los hallazgos del panel abren el escenario ya con la pregunta hecha (consulta estructurada: sin pasar por el lenguaje). El botón "Preguntale al asesor" de la ficha pública se sacó por ahora (se veía mal en el celular); `AdvisorTrigger` y `focusPropertyId` siguen listos para volver a ponerlo.

**API.** `POST /api/advisor/ask` y `/briefing` (cuerpo validado con `lib/advisor/schema.ts`, `preview` sólo para admin, respetan `enabled` de la configuración). `quota.ts` (cupo anónimo sobre `RateLimit`, ventana ~60 días), `unmatched.ts` + modelo `AdvisorUnmatched` (preguntas no entendidas), `tracking/visitor.ts` (cookie anónima `rid` compartida con `/api/track`).

**Mascota y animaciones.** `components/advisor/mascot/{scene.ts,MascotCanvas.tsx,MascotFallback.tsx,MascotCanvasLazy.tsx}`. El modelo incluido trae 6 animaciones **por nombre**: *Normal* (reposo, siempre por defecto), *Hablando* (mientras aparece el texto de la respuesta), *Sorprendido* (cuando el hallazgo es fuera de lo común), y *Parpadeando*, *Asintiendo*, *Feliz* (al tocar a la mascota, sin repetir la anterior); al terminar cada gesto vuelve a Normal. Crossfade de 0,3 s, parallax suave con mouse, pausa fuera de pantalla/pestaña oculta, baja el pixel ratio si la máquina no da abasto, `prefers-reduced-motion` = quieta, y sin WebGL queda un orbe/póster. El texto principal aparece palabra por palabra con GSAP (mismo lenguaje del hero: `power2.out`, blur-in sólo con puntero fino); tocarlo lo completa; los bloques entran después con stagger.

**Bloques de respuesta** (`components/advisor/blocks.tsx`): métricas con variación, tendencia (`TrendChart`), barras (`BarList`), tablas (se apilan en mobile), propiedades (miniatura, chips, nota de contexto, accesos a Estadísticas/Editar/Ver ficha), tarjetas (`PropertyCard`), hallazgos (`DiagnosticCard`), línea de tiempo, simulación (insignia "Hipotético") y avisos de datos insuficientes.

**Estudio del admin (`/admin/asesor`, `components/admin/advisor/AdvisorStudio.tsx`).** Se trabaja sobre un **borrador con autoguardado**; lo que ve la gente es lo **publicado** hasta que se aprieta Publicar (Descartar vuelve al publicado). Permite: nombre y descripción, habilitar por público, **subir/eliminar el GLB** (hasta 10 MB, subida firmada directa a Cloudinary `umbral/advisor`, biblioteca de hasta 5, no se borra uno en uso; sin Cloudinary sube por el servidor a `/public/uploads`), ver las animaciones detectadas, reproducir cada una, activarlas/desactivarlas y asignarlas por caso (reposo / habla / sorpresa / toque), encuadre (distancia, altura, giro, escala, luz), capturar el póster del botón flotante, **probar como inmobiliaria o explorador** con el borrador, y ver/borrar las preguntas que no entendió. Configuración en `AdvisorConfig` (`lib/advisor/config.ts`: `normalizeContent` sanea todo, `getPublishedConfig` memo 60 s, `toPublicConfig` es lo único que recibe el navegador).

**Pruebas.** `npm run advisor:check` corre 120 casos de regresión del interpretador (sin base de datos): correrlo al tocar `lexicon.ts` o `intents.ts`. Las analíticas se probaron con datos sintéticos insertados y borrados por id (la base real casi no tiene tráfico), el aislamiento entre inmobiliarias y las rutas de admin por HTTP, y la interfaz en Chrome (desktop y 390×844).
