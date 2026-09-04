# Umbral

> Entrá antes de entrar.

Plataforma multi-tenant para inmobiliarias ("Shopify de las inmobiliarias"): cada inmobiliaria publica y administra su catálogo desde su propio dashboard, y quien busca puede explorar propiedades en un mapa interactivo, guardarlas, comentarlas, calificarlas y recorrerlas en 3D con Digital Twins (link a Matterport/Polycam/Kuula, o un escaneo propio en glb/gltf/usdz).

No es un catálogo más: combina portal inmobiliario, red social de propiedades, mapa interactivo, recomendaciones por lógica tradicional (sin IA de pago), notificaciones internas, dashboard de inmobiliaria con estadísticas, y panel de administración para el proveedor de la plataforma.

## Stack

Next.js 16 (App Router) · TypeScript · TailwindCSS v4 · MongoDB / Mongoose · MapLibre GL + OpenFreeMap (mapas gratis, sin API key) · GSAP · Auth.js v5 · Cloudinary.

Todo el stack es gratuito — sin APIs de IA de pago, sin límites de tokens en el mapa.

## Empezar

Ver **[SETUP.md](./SETUP.md)** para el paso a paso completo (crear MongoDB Atlas, cargar datos demo, etc).

```bash
npm install
cp .env.example .env.local   # completar MONGODB_URI (ver SETUP.md)
npm run seed                  # ~4 inmobiliarias + ~40 propiedades demo en AMBA
npm run dev
```

Abrir [http://localhost:3000](http://localhost:3000).

## Estado del proyecto

Las 7 sesiones del plan original están completas:

- ✅ Fundación: design system (tokens OKLCH, tipografía, componentes UI), modelos de datos completos, storage abstraído (Cloudinary/local).
- ✅ Mapa interactivo (`/mapa`): clustering, pins, popup animada, filtros, panel de resultados, tema claro/oscuro.
- ✅ Landing de 3 caminos (Explorar / Ingresar / Publicá tu inmobiliaria) + autenticación completa (Auth.js).
- ✅ Listado (`/propiedades`) + detalle con galería, lightbox y recorrido 3D (link embebido o mesh propio con `<model-viewer>`).
- ✅ Capa social: likes, favoritos, comentarios, ratings, perfil de usuario.
- ✅ Dashboard de inmobiliaria (`/dashboard`): ABM de propiedades, subida de fotos, estadísticas semanales, recomendaciones por umbrales.
- ✅ Recomendador personalizado (`/recomendaciones`) + notificaciones internas.
- ✅ Panel de admin/proveedor (`/admin`) para dar de alta inmobiliarias + config de deploy (Netlify).

Ver el plan original en `C:\Users\Mi PC\.claude\plans\clever-roaming-micali.md`. El producto sigue abierto a nuevas iteraciones (más tipos de Digital Twin, notificaciones por email/push, moderación de contenido, etc.).

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Build de producción |
| `npm run lint` | ESLint |
| `npm run typecheck` | Chequeo de tipos |
| `npm run seed` | Carga datos demo en MongoDB |

## Seguridad

Ningún secreto se versiona: `.env.local` está en `.gitignore`, solo `.env.example` (vacío, documentado) va al repo. Ver la nota de seguridad en [SETUP.md](./SETUP.md).
