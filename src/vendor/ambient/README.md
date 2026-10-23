# Reproductor de la portada viva

Código de terceros (el proveedor del servicio), copiado tal cual de la carpeta `vendor/ambient/` que trae cada
experiencia. No se edita a mano: si el proveedor entrega una versión nueva, se reemplazan los 9 archivos
(`ambient*.js`, `ambient.css`, `index.js`) y se corre `npm run ambient:check`.

- Sin dependencias ni compilación; WebGL2 con respaldo de imágenes con fundido.
- Los `.d.ts` de esta carpeta los escribimos nosotros (el JS no se tipa).
- Lo usa `src/components/property/AmbientCover.tsx` (ficha) y, sólo `ambient-manifest.js`, `src/lib/ambient/validate.ts`
  (validación en el navegador y en el servidor).
- Licencia (de `LEEME.txt` de la experiencia): se puede usar para propiedades propias o de clientes; ofrecer la
  generación como servicio de pago o vender el reproductor por separado requiere permiso escrito del titular.
- El aviso "Ambientación digital generada a partir de una fotografía; no es un registro fotográfico real." debe
  mostrarse siempre: la plataforma lo fuerza al registrar cada portada (`AMBIENT_DISCLOSURE`).
