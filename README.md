# Umbral

> Entrá antes de entrar.

Plataforma multi-tenant para inmobiliarias: cada inmobiliaria publica y administra su catálogo de propiedades, y quien busca puede explorarlas en un mapa interactivo, guardarlas, comentarlas y — a futuro — recorrerlas en 3D con Digital Twins (Matterport).

No es un catálogo más: combina portal inmobiliario, red social de propiedades, mapa interactivo, recomendaciones por lógica tradicional (sin IA de pago) y notificaciones internas, con panel de gestión propio para cada inmobiliaria.

## Stack

Next.js 16 (App Router) · TypeScript · TailwindCSS v4 · MongoDB / Mongoose · MapLibre GL + OpenFreeMap (mapas gratis, sin API key) · GSAP · Auth.js · Cloudinary (opcional).

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

Este es un desarrollo incremental por sesiones. Estado actual:

- ✅ Fundación: design system (tokens OKLCH, tipografía, componentes UI), modelos de datos completos (Agency, User, Property, Interaction, Comment, Rating, Favorite, Notification, SavedSearch), storage abstraído (Cloudinary/local).
- ✅ Mapa interactivo (`/mapa`): clustering, pins, popup animada, filtros, panel de resultados, tema claro/oscuro.
- 🔜 Landing de 3 caminos (Explorar / Ingresar / Publicá tu inmobiliaria) + autenticación completa.
- 🔜 Listado con filtros avanzados + detalle de propiedad con galería y recorrido 3D.
- 🔜 Capa social (likes, favoritos, comentarios, ratings).
- 🔜 Dashboard de inmobiliaria (ABM de propiedades, estadísticas, recomendaciones).
- 🔜 Recomendador personalizado + notificaciones internas.
- 🔜 Panel de admin/proveedor + deploy.

Ver el plan completo en `C:\Users\Mi PC\.claude\plans\clever-roaming-micali.md`.

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
