/*
 * Service worker de los avisos del dispositivo (push). A propósito NO guarda nada en caché ni intercepta pedidos: la web siempre
 * se ve actualizada y esto sólo recibe avisos y los muestra. El título, el texto y la dirección llegan en el propio aviso (el
 * nombre de la plataforma no está escrito acá). Es un archivo estático: no puede importar código de la aplicación.
 */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

/** Sólo rutas internas: una dirección completa o "//otro-sitio" se cambia por la página de avisos. */
function safeHref(href) {
  return typeof href === "string" && /^\/(?!\/)[^\s\\]*$/.test(href) ? href : "/notificaciones";
}

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = typeof data.title === "string" && data.title ? data.title : "Aviso";
  // En iOS cada `push` tiene que terminar mostrando un aviso (si no, el navegador deja de entregarlos).
  event.waitUntil(
    self.registration.showNotification(title, {
      body: typeof data.body === "string" ? data.body : "",
      tag: typeof data.tag === "string" ? data.tag : undefined,
      icon: "/pwa-icon/192",
      badge: "/pwa-icon/192",
      data: { href: safeHref(data.href) },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(safeHref(event.notification.data && event.notification.data.href), self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (windows) => {
      // Si la plataforma ya está abierta en alguna ventana, se la lleva a ese aviso; si no, se abre una.
      for (const w of windows) {
        if (new URL(w.url).origin === self.location.origin && "focus" in w) {
          await w.focus();
          if ("navigate" in w) return w.navigate(url).catch(() => self.clients.openWindow(url));
          return undefined;
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
