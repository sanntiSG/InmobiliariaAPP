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
npm run seed -- --wipe
```

> ⚠️ El seed **borra** todos los usuarios, inmobiliarias, propiedades e interacciones de la base antes de crear los datos demo. Por eso exige `--wipe`: usalo **solo** contra una base de pruebas, nunca contra una con datos reales.

Esto crea ~4 inmobiliarias y ~40 propiedades demo distribuidas en CABA/AMBA (coordenadas reales), con features variadas y ~30% con recorrido 3D (mitad con un mesh `.glb` de muestra vía `<model-viewer>`, mitad con un link de Matterport de demo), para poder ver el mapa y los dos tipos de recorrido poblados sin cargar nada a mano.

**Cuentas demo creadas por el seed** (la contraseña es **distinta en cada corrida**: el seed la imprime una sola vez al terminar; con la variable `SEED_PASSWORD` podés fijar una propia en tu máquina — nunca la escribas en un archivo del repo, que es público):

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

## 8. Agente de correo (opcional)

El agente de correo lee las consultas que llegan a la casilla de una inmobiliaria y le deja la respuesta lista. Está **apagado** hasta que el admin lo publica en *Admin → Agentes → Correo*.

**Qué se carga, y cuántas veces.** Una sola cosa, **una sola vez para toda la plataforma** (no una por casilla ni una por inmobiliaria): la clave de seguridad con la que se cifran las contraseñas de las casillas. La contraseña de cada casilla la escribe la propia inmobiliaria en su panel; queda cifrada en la base y el admin nunca la ve.

| Dónde | Qué hay que hacer |
|---|---|
| **Netlify** | Cargar **una** variable: `MAIL_CREDENTIALS_KEY`. |
| **GitHub** | Nada. (La revisión cada 5 minutos la hace una función programada de Netlify, `netlify/functions/mail-poll.mts`.) |
| **Render** | Nada. Es la web de respaldo: ahí se ve y se confirma, pero no se conectan casillas ni se envía (el plan gratis bloquea el envío de mails); lo confirmado lo manda Netlify. |

### Activarlo (admin, unos 3 minutos)

Todo se explica también dentro de *Admin → Agentes → Correo*, con un botón que genera la clave.

1. En *Admin → Agentes → Correo* tocá **Generar la clave** y **Copiar clave**. Se crea en tu navegador; guardala en tu gestor de contraseñas (si se pierde, cada inmobiliaria tiene que volver a conectar su casilla).
2. En Netlify: tu sitio → **Site configuration → Environment variables → Add a variable → Add a single variable**. En *Key* escribí `MAIL_CREDENTIALS_KEY`, en *Values* pegá la clave, y **Create variable**.
3. **Deploys → Trigger deploy → Deploy site** y esperá a que termine.
4. Volvé a *Admin → Agentes → Correo* y tocá **Actualizar estado**: "Clave de seguridad" tiene que decir *Cargada*, y a los 5 minutos "Revisión automática" muestra la última corrida.
5. Más abajo, en **Disponible para**, marcá *Inmobiliarias y admin* y tocá **Publicar**.

Listo: cada inmobiliaria ya puede conectar su casilla.

### Conectar una casilla (cada inmobiliaria, unos 5 minutos)

Desde su panel: *Agentes → Correo → Conectar mi casilla*. El asistente explica cada paso y trae el enlace directo a la página donde el proveedor (Gmail, Yahoo, iCloud) entrega la **contraseña de aplicación** (una clave especial para una sola app; no es la contraseña de la cuenta y se puede borrar cuando se quiera). Para un correo de hosting propio, se piden los datos del servidor (IMAP y SMTP). Outlook/Hotmail queda para una segunda etapa.

Si el correo todavía no está activado en la plataforma, la inmobiliaria lo ve apenas entra y tiene un botón **Avisar al administrador** (llega como notificación) y otro de WhatsApp. No hay que pasarle ninguna credencial al admin.

### Cómo funciona y cómo probarlo

La clave sólo **enciende el servicio**: no conecta ningún correo. El correo se vincula **por inmobiliaria**, con la casilla donde ella recibe las consultas de sus clientes (la de sus avisos y portales). El correo del admin no se vincula a nada.

1. Cada 5 minutos (o con **Revisar ahora**) el agente mira esa bandeja en sólo lectura, **sólo los mails que llegan después de conectar**.
2. Descarta lo que no es una consulta; si lo es, busca la propiedad **de esa inmobiliaria** (enlace, título o lo que pide), prepara el borrador y avisa.
3. Una persona lo revisa y sale **desde esa misma casilla** (en modo automático, sólo si es claro y el remitente está verificado).

El formulario de consulta de la ficha **no** manda mails: crea un cliente en *Clientes* y una notificación. El agente de correo atiende los mails que escriben directo a la casilla.

**Qué entiende y qué hace con lo que no entiende.** El agente suma evidencia (una propiedad nombrada, lo que pide —tipo, operación, zona, presupuesto, ambientes—, cómo lo pide y las palabras del rubro) y distingue tres casos: una **consulta clara** (borrador), **"quizás es una consulta"** (una persona con algo del rubro que pregunta o pide: llega a "Para confirmar" marcada "no estoy seguro, revisala", nunca se tira) y **no es una consulta** (automático, lista, rebote, spam, agradecimientos, facturas, currículums, ofertas de servicios). Entiende búsquedas sin verbo ("Casas en venta en Ezeiza") y responde con lo que la inmobiliaria tiene publicado; si no tiene nada, lo dice y ofrece lo más reciente. Las búsquedas **nunca** salen solas en modo automático. De lo ignorado que escribió una persona se guarda el texto 14 días: en la pestaña **Ignorados** se ve el motivo y el botón **Era una consulta** prepara la respuesta. Las pruebas de comprensión (un banco de ~200 mails en castellano rioplatense) corren con `npm run mail:check`.

**Modo automático: cuándo sale sola una respuesta.** Sólo si se cumple todo: es una consulta clara de un tipo permitido, **nombra una propiedad o pide algo que la inmobiliaria tiene publicado** (por ejemplo "casas en venta en Ezeiza" con propiedades que coinciden; se puede apagar en la configuración), quien escribe pasó las verificaciones del correo, no hay nada que deba contestar una persona (financiación, garantía, permuta, reclamos), está dentro del horario y de los topes (por día y **por persona por día, 3 por defecto**). Si algo no se cumple queda en "Para confirmar" con un aviso que dice por qué no salió sola. Lo que sale solo se envía en la misma pasada de la revisión. Para probarlo desde una misma cuenta de a varios mails, hay que subir el tope por persona. En "Probá cómo respondería" también se ve qué pasaría si se pasara a automático.

**Contraseñas de aplicación identificadas.** El asistente le pide a cada inmobiliaria que cree la contraseña con el nombre **«Recorrr - nombre de la inmobiliaria»** (con botón para copiarlo): en la lista de contraseñas de Google, Yahoo o Apple queda claro de quién es cada una, y el administrador la reconoce si se la mandan. La inmobiliaria la pega ella misma en su panel (queda cifrada; el admin no la ve). Si no puede, "¿Te trabaste? Pedí ayuda al administrador" le muestra **qué mandarle** (nombre de la inmobiliaria, email de la casilla y la contraseña con ese nombre), le arma el mensaje de WhatsApp y te avisa con su nombre; vos la conectás en *Agentes → Correo → Conectar casilla* "viendo como" ella.

**Probar sin conectar nada.** En *Agentes → Correo* de cualquier inmobiliaria (el admin entra "viendo como"), la tarjeta **Probá cómo respondería** toma una consulta de ejemplo con una propiedad publicada, la entiende y muestra el borrador con la configuración actual. No guarda, anota ni envía nada.

**Probar con un mail de verdad.** Conectá una casilla de prueba (no la personal) a una inmobiliaria — el admin puede hacerlo por ella desde *Admin → Agentes → Correo → Conectar casilla* — y escribile desde **otra** cuenta un mail que nombre una de sus propiedades. Lo que manda la propia casilla se ignora, y los mails anteriores a la conexión no cuentan. Aparece en "Para confirmar" en hasta 5 minutos.

**Avisar a las inmobiliarias.** Con el agente publicado, el botón **Avisar a las inmobiliarias** (Admin → Agentes → Correo) manda una notificación a los dueños, una sola vez.

### Variables opcionales (casi nunca hacen falta)

| Variable | Para qué |
|---|---|
| `PUBLIC_SITE_URL` | Dirección (con https) que usan los enlaces dentro de los mails. Si falta, se usa `AUTH_URL`. |
| `MAIL_SITE_HOSTS` | Otros dominios propios, separados por coma, para reconocer enlaces a tus fichas dentro de un mail. |
| `MAIL_CREDENTIALS_KEY_PREVIOUS` | Para cambiar la clave sin desconectar a nadie: poné acá la clave vieja y cargá la nueva en `MAIL_CREDENTIALS_KEY`. |
| `MAIL_POLLER_ENABLED` / `MAIL_SEND_ENABLED` | Con el valor `false` apagan la revisión o el envío. Con `true` fuerzan encenderlos (por ejemplo, en un Render de pago). Normalmente no se cargan. |
| `CRON_SECRET` | Sólo si querés llamar a `/api/cron/mail-poll` desde un programador externo (mínimo 32 caracteres, con `Authorization: Bearer <valor>`). La clave que usa Netlify se deriva sola de `MAIL_CREDENTIALS_KEY`. |

Si ya tenías cargadas `MAIL_POLLER_ENABLED=true`, `MAIL_SEND_ENABLED=true`, `CRON_SECRET` o los secretos de GitHub (`CRON_SECRET`, `MAIL_POLL_URL`), se pueden dejar o borrar: ya no hacen falta.

### Cómo funciona y cómo revisarlo

- Netlify ejecuta `mail-poll` cada 5 minutos (en *Logs → Functions → mail-poll* se ve cada corrida). Esa función llama a `POST /api/cron/mail-poll`, que revisa las casillas y manda lo que quedó en cola. La ruta devuelve sólo conteos y no existe (404) donde el correo no corre, como en Render.
- Cada corrida deja una señal de vida en la base: el panel del admin la muestra ("Última revisión hace 3 min"). Si pasan 15 minutos sin corrida, el panel avisa.
- El botón **Revisar ahora** del panel de cada inmobiliaria sirve de respaldo (1 por minuto).
- Las funciones programadas de Netlify sólo corren en el despliegue publicado, no en vistas previas.

**Qué hace y qué no.** Sólo lee la bandeja de entrada en modo lectura y sólo los mails que llegan *después* de conectar; no borra ni mueve nada. Guarda el texto (sin adjuntos) 60 días (14 si lo ignoró) y todo se borra al desconectar. Empieza en modo *con confirmación*: nada se envía sin que una persona lo confirme. El modo automático sólo responde consultas claras, con una propiedad identificada, de remitentes que pasan las verificaciones SPF/DKIM/DMARC y dentro de los topes configurados. Las pruebas de la lógica (sin red ni base): `npm run mail:check`.

**Datos personales (Ley 25.326).** El agente trata nombre, email y texto de las consultas de terceros. La finalidad (atender la consulta), la retención (60 días) y el borrado al desconectar están en el aviso que acepta quien conecta la casilla; la política de privacidad del sitio la redacta el dueño de la plataforma.

## Nota de seguridad

`CLAUDE.md` en la raíz del repo tenía una contraseña de GitHub en texto plano — ya se sacó del archivo, pero como estuvo ahí (y el repo se sube a GitHub), **cambiala en github.com → Settings → Password and authentication** y activá 2FA si todavía no lo tenés. No vuelvas a escribir credenciales reales en archivos versionados — usá `gh auth login` o un Personal Access Token para el push, nunca la contraseña de la cuenta.
