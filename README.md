# Umbral

> Entrá antes de entrar.

Plataforma multi-tenant para inmobiliarias ("Shopify de las inmobiliarias"): cada inmobiliaria publica y administra su catálogo desde su propio panel, y quien busca explora propiedades en un mapa interactivo, las guarda, comenta, califica y las recorre con fotos, fotos 360°, un recorrido navegable y videos.

No es un catálogo más: combina portal inmobiliario, red social de propiedades, mapa interactivo, recomendaciones por lógica tradicional (sin IA de pago), avisos personalizados (dentro de la plataforma y en el dispositivo), un panel por inmobiliaria con estadísticas y recomendaciones por datos, y un panel de administración para quien provee la plataforma.

> El nombre que se ve en pantalla sale de un único lugar, `src/config/brand.ts`. "Umbral" es el nombre del repositorio y del paquete.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · TailwindCSS v4 · MongoDB / Mongoose · MapLibre GL + OpenFreeMap (mapas gratis, sin clave) · GSAP · Auth.js v5 · Cloudinary · Web Push (`web-push`).

Todo es gratuito: sin APIs de IA de pago, sin límites de tokens en el mapa.

## Empezar

Ver **[SETUP.md](./SETUP.md)** para el paso a paso completo (crear MongoDB Atlas, cargar datos demo, publicar, activar correo y avisos).

```bash
npm install
# crear .env.local con MONGODB_URI y AUTH_SECRET (ver SETUP.md, sección 3)
npm run seed -- --wipe        # 4 inmobiliarias + ~40 propiedades demo en AMBA (borra la base: sólo una de pruebas)
npm run dev
```

Abrir [http://localhost:3000](http://localhost:3000).

## Qué hace

- **Tres puertas de entrada:** explorar sin cuenta, ingresar o crear cuenta, o publicar tu inmobiliaria (se coordina con el proveedor; sólo el proveedor o el admin da de alta y baja inmobiliarias).
- **Mapa general** (`/mapa`) con clusters, pines por inmobiliaria, ficha completa en el popup y filtros avanzados que se pueden sumar y quitar de uno en uno. **Listado** (`/propiedades`) con los mismos filtros y **ficha** con galería, 360°, recorrido, videos, ubicación y consulta.
- **Alquileres temporales:** el precio puede ser por noche, día, semana, quincena o mes; cada propiedad lleva su disponibilidad (períodos ocupados y un interruptor manual), distancia a la playa y pin verde/rojo en el mapa. El filtro "Libre en mis fechas" y el presupuesto por noche (equivalente) ayudan a comparar. Se puede pedir un aviso para cuando una propiedad se libere.
- **Capa social:** me gusta, favoritos, comentarios, puntajes, perfil de usuario y perfil público de cada inmobiliaria con seguidores y redes.
- **Recomendaciones** (`/recomendaciones`) por preferencias, gustos calculados de la actividad real y filtrado colaborativo simple; cada una explica su motivo.
- **Avisos** sólo para quien tiene sesión: campana y página `/notificaciones`, y **avisos del dispositivo** (Web Push, instalable como app) que cada persona activa y configura por grupo desde su panel. Texto genérico en la pantalla bloqueada; el detalle se ve al entrar.
- **Panel de la inmobiliaria** (`/dashboard`): propiedades, clientes y consultas, estadísticas (vistas, me gusta, favoritos, comentarios y su variación semanal) con recomendaciones por datos, contenido para redes y agentes (asesor, marketing y correo).
- **Agente de correo** que lee la casilla de consultas, prepara la respuesta con firma corporativa, avisa cuando hay una duda que debe contestar una persona y permite responderla desde el panel.
- **Panel de administración** (`/admin`): altas y permisos de inmobiliarias, propiedades, agentes, correo y avisos del dispositivo.

## Estado del proyecto

Producto en uso y en evolución continua. Lo último incorporado (sesiones 21 y 22): filtros reversibles y sin desborde en pantallas chicas, resultados vacíos con alternativas, correo con seguimiento, firma, bandeja por lo que hay que hacer y analista, alquileres temporales con sus seeds, y avisos (campana y dispositivo) para todos los roles con guía ilustrada de activación.

El detalle de decisiones, arquitectura y lecciones está en **[context.md](./context.md)**; las secciones 18 a 20 cubren las últimas sesiones.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Build de producción |
| `npm run lint` | ESLint |
| `npm run typecheck` | Chequeo de tipos |
| `npm run seed -- --wipe` | Carga el seed original (borra la base: sólo para una de pruebas) |
| `npm run seedVacacional` | Agrega 14 alquileres de temporada (Mar del Plata, Aguas Verdes, Mar del Tuyú y Cariló) a las 4 inmobiliarias del seed original. Es idempotente. Con `-- --dry-run` muestra qué crearía sin escribir nada |
| `npm run eliminarSeedVacacional` | Simula qué borraría el seed anterior. Con `-- --confirm` borra sólo lo que ese seed creó (y lo asociado), sin tocar inmobiliarias ni usuarios |
| `npm run filters:check` · `mail:check` · `agents:check` · `advisor:check` · `ambient:check` · `rentals:check` · `push:check` | Pruebas de la lógica (sin red ni base de datos de producción) |

## Seguridad

Ningún secreto se versiona: `.env.local` está en `.gitignore` y las variables necesarias se documentan en [SETUP.md](./SETUP.md). Las claves del correo y de los avisos se cargan en el panel del proveedor del hosting. La clave privada de los avisos se genera en el navegador del admin y no pasa por el servidor. Ver la nota de seguridad en [SETUP.md](./SETUP.md).
