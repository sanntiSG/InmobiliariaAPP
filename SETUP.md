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
>
> El mismo storage se usa para subir el **recorrido 3D como archivo** (`.glb`/`.gltf`/`.usdz`, ej. exportado de Polycam) desde "Recorrido 3D → Subir escaneo 3D" en el dashboard — límite 30MB. El plan free de Cloudinary puede rechazar archivos grandes; si tu escaneo no entra, usá "Link de recorrido" en su lugar y pegá el link que te da Polycam/Matterport/Kuula (sin límite de tamaño, no pasa por nuestro storage).

## 4. Cargar datos de prueba

```bash
npm run seed
```

Esto crea ~4 inmobiliarias y ~40 propiedades demo distribuidas en CABA/AMBA (coordenadas reales), con features variadas y ~30% con recorrido 3D (mitad con un mesh `.glb` de muestra vía `<model-viewer>`, mitad con un link de Matterport de demo), para poder ver el mapa y los dos tipos de recorrido poblados sin cargar nada a mano.

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

## 7. Deploy (Netlify + Render + MongoDB Atlas)

Umbral se publica **dos veces, en espejo completo** del mismo repo: una en Netlify
(URL primaria — funciones serverless, sin cold start) y otra en Render (respaldo/
staging — el free tier duerme a los 15 min de inactividad). Las dos apuntan a **la
misma** base de MongoDB Atlas de producción; no son entornos separados, son dos
puertas de entrada a los mismos datos.

El repo ya incluye `netlify.toml` (build command + `@netlify/plugin-nextjs`, Next.js
16 soportado sin config adicional) y `render.yaml` (Blueprint de Render: build/start/
health-check ya completos, sólo pide las variables secretas en un formulario).
`.node-version` fija Node 20.20.2 para que ambas plataformas usen la misma versión.

1. **MongoDB Atlas para producción**
   - **Network Access** → `0.0.0.0/0` — ni Netlify Functions ni el free tier de
     Render dan IP de salida fija en el plan gratuito, así que no hay forma de
     restringir por IP; la seguridad la da el usuario/contraseña de conexión.
   - Podés usar el mismo cluster M0 de desarrollo o uno de "producción" separado —
     para un lanzamiento real, dejalo **vacío** y dá de alta las inmobiliarias a
     mano desde `/admin` (nada de `npm run seed` ahí).

2. **Cloudinary** — obligatorio en producción (ver punto 3.3; el filesystem de
   Netlify/Render es efímero). Podés reusar la misma cuenta/credenciales de
   desarrollo.

3. **Google OAuth** — reusá el mismo Client ID de `console.cloud.google.com/apis/credentials`
   que ya usás en local. En **Authorized JavaScript origins** y **Authorized redirect
   URIs** agregá las dos URLs nuevas (sin sacar la de `localhost:3000`):
   - `https://<tu-sitio>.netlify.app` / `.../api/auth/callback/google`
   - `https://<tu-servicio>.onrender.com` / `.../api/auth/callback/google`

   Si el **Publishing status** del consent screen dice "Testing", sólo entran los
   emails que agregues como test users — click **Publish app** para que cualquier
   usuario real pueda loguearse con Google (los scopes básicos que usa este
   proyecto no requieren verificación de Google).

4. **Crear el sitio en Netlify** — [app.netlify.com](https://app.netlify.com) →
   **Add new site → Import an existing project** → GitHub → `InmobiliariaAPP`. Build
   command y publish directory ya vienen de `netlify.toml`.

5. **Crear el servicio en Render** — [dashboard.render.com](https://dashboard.render.com)
   → **New + → Blueprint** → mismo repo `InmobiliariaAPP`. Render lee `render.yaml`
   automáticamente y sólo pide los valores secretos.

6. **Variables de entorno** — mismos valores en las dos plataformas, salvo `AUTH_URL`:

   | Variable | Netlify | Render |
   |---|---|---|
   | `MONGODB_URI` | connection string de Atlas | mismo valor |
   | `AUTH_SECRET` | uno nuevo (`node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` — no usar `npx auth secret` acá, te pisa el de `.env.local`) | otro nuevo, **distinto** al de Netlify |
   | `AUTH_URL` | `https://<tu-sitio>.netlify.app` | `https://<tu-servicio>.onrender.com` (¡no la misma URL en las dos!) |
   | `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | de tu Client ID de Google | mismo valor |
   | `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | de tu cuenta de Cloudinary | mismo valor |

   `ADMIN_EMAILS` y `NEXT_PUBLIC_PROVIDER_WHATSAPP` no son obligatorias — `src/config/site.ts`
   ya tiene defaults; sólo agregalas si en producción querés valores distintos.

7. **Deploy** — cada plataforma buildea y publica automáticamente en cada push a
   `main`. Después de cargar las variables por primera vez, forzá un redeploy
   (Netlify: *Trigger deploy → Clear cache and deploy site*; Render: *Manual Deploy*)
   para que las tome.

8. **Verificar** — en cada URL: `/api/health` debe dar `{"ok":true,"db":"connected"}`;
   `/ingresar` → login con Google debe entrar con rol admin; `/admin` para dar de
   alta la primera inmobiliaria real; subir una foto desde ese dashboard confirma
   que Cloudinary quedó bien configurado.

## Nota de seguridad

`CLAUDE.md` en la raíz del repo tenía una contraseña de GitHub en texto plano — ya se sacó del archivo, pero como estuvo ahí (y el repo se sube a GitHub), **cambiala en github.com → Settings → Password and authentication** y activá 2FA si todavía no lo tenés. No vuelvas a escribir credenciales reales en archivos versionados — usá `gh auth login` o un Personal Access Token para el push, nunca la contraseña de la cuenta.
