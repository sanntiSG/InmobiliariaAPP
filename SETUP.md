# Setup — Umbral

Guía para dejar el proyecto corriendo en local con datos reales. Todo lo que se usa acá es **gratis**, sin tarjeta de crédito obligatoria y sin límite de tokens.

## 1. Requisitos

- Node.js 20.9+ (verificado: v20.20.2 ✔)
- Una cuenta de MongoDB Atlas (gratis)
- Una cuenta de Cloudinary (gratis) — opcional para esta primera versión, el mapa funciona sin ella

## 2. Instalar dependencias

```bash
npm install
```

## 3. Crear `.env.local`

```bash
cp .env.example .env.local
```

### 3.1 MongoDB Atlas (base de datos)

1. Entrá a https://www.mongodb.com/cloud/atlas/register y creá una cuenta gratis.
2. Creá un cluster **M0 (Free)**.
3. En **Database Access**, creá un usuario y contraseña.
4. En **Network Access**, agregá `0.0.0.0/0` (permitir acceso desde cualquier IP) para desarrollo.
5. En **Database > Connect > Drivers**, copiá el connection string y pegalo en `MONGODB_URI` dentro de `.env.local`, reemplazando `<password>` por la contraseña real.

### 3.2 Auth.js (sesiones)

Generá un secreto y pegalo en `AUTH_SECRET`:

```bash
npx auth secret
```

### 3.3 Cloudinary (fotos de propiedades)

1. Entrá a https://cloudinary.com/users/register/free
2. En el Dashboard copiá `Cloud name`, `API Key` y `API Secret` a las variables `CLOUDINARY_*`.

> Sin Cloudinary configurado, la app sigue funcionando: el seed usa URLs de imágenes públicas (Unsplash), y el dashboard de cada inmobiliaria guarda las fotos que suban en `/public/uploads` (solo development — en producción ese filesystem es efímero). **Para producción, Cloudinary es obligatorio** si vas a subir fotos desde el dashboard.

## 4. Cargar datos de prueba

```bash
npm run seed
```

Esto crea ~4 inmobiliarias y ~40 propiedades demo distribuidas en CABA/AMBA (coordenadas reales), con features variadas y ~30% con recorrido 3D simulado, para poder ver el mapa poblado sin cargar nada a mano.

**Cuentas demo creadas por el seed** (todas con contraseña `Umbral2026!`):

| Rol | Email | Para qué |
|---|---|---|
| Admin (proveedor) | `admin@umbral.app` | `/admin` — dar de alta/baja inmobiliarias |
| Dueño de inmobiliaria | `admin@<slug-inmobiliaria>.com.ar` (ver log del seed) | `/dashboard` — ABM de propiedades de esa inmobiliaria |

Un usuario común (rol `user`, sin inmobiliaria) se crea normalmente desde `/crear-cuenta`.

## 5. Levantar el proyecto

```bash
npm run dev
```

Abrí http://localhost:3000/mapa

## 6. Comandos útiles

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo (Turbopack) |
| `npm run build` | Build de producción |
| `npm run lint` | ESLint |
| `npm run typecheck` | Chequeo de tipos TypeScript |
| `npm run seed` | Carga datos demo en MongoDB |

## 7. Deploy (Netlify + MongoDB Atlas)

El repo ya incluye `netlify.toml` (build command + `@netlify/plugin-nextjs`). No hace falta configurar nada más ahí — Netlify detecta Next.js automáticamente.

1. **MongoDB Atlas para producción**
   - En **Network Access**, además de tu IP, dejá habilitado `0.0.0.0/0` (o la lista de IPs salientes de Netlify si preferís restringir) para que las funciones de Netlify puedan conectarse.
   - Usá el mismo cluster M0 gratuito, o creá uno separado de "producción" si querés aislar los datos demo.

2. **Crear el sitio en Netlify**
   - [app.netlify.com](https://app.netlify.com) → **Add new site → Import an existing project** → conectá el repo `InmobiliariaAPP` de GitHub.
   - Build command y publish directory ya vienen de `netlify.toml`, no hace falta tocarlos.

3. **Variables de entorno en Netlify** (Site settings → Environment variables) — las mismas de `.env.local`, con valores de producción:

   | Variable | Valor |
   |---|---|
   | `MONGODB_URI` | connection string de Atlas |
   | `AUTH_SECRET` | uno **nuevo**, generado con `npx auth secret` (no reuses el de dev) |
   | `NEXTAUTH_URL` | la URL final del sitio, ej. `https://umbral.netlify.app` |
   | `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | de tu cuenta de Cloudinary (obligatorio en producción, ver punto 3.3) |
   | `NEXT_PUBLIC_PROVIDER_WHATSAPP` | tu número real, si es distinto al de `.env.example` |

4. **Deploy** — Netlify buildea y publica automáticamente en cada push a la rama principal. Corré `npm run seed` apuntando a la base de producción (variable `MONGODB_URI` de prod en tu shell local) solo si querés datos de demo ahí; para un lanzamiento real, las inmobiliarias se dan de alta a mano desde `/admin`.

## Nota de seguridad

`CLAUDE.md` en la raíz del repo contenía una contraseña de GitHub en texto plano. **Recomendado:** cambiar esa contraseña, activar 2FA en la cuenta, y no volver a escribir credenciales reales en archivos versionados. Usá `gh auth login` o un Personal Access Token para el push, nunca la contraseña de la cuenta.
