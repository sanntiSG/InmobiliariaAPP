Prompt — Mejora y ampliación de plataforma inmobiliaria existente
antes de comenzar lee el archivo context.md para tener contexto, y pregunta todo lo necesario antes de comenzar para evitar errores. cuando termines de desarrollar todo actualiza context.md con lo nuevo y si se reemplazo algo actual que menciona ahi, cambialo, y haz mucha incapie en la seguridad, deja todo funcional, y entiende con atencion todo:
Quiero mejorar y ampliar una plataforma inmobiliaria que ya está desarrollada y funcionando.

# PROMPT — Sistema de generación automática de contenido para redes

Quiero agregar una nueva funcionalidad a una **plataforma inmobiliaria que ya está desarrollada y funcionando**.

**No reconstruir la aplicación ni modificar funcionalidades existentes que no estén relacionadas con esta nueva función.**
La funcionalidad debe integrarse al sistema actual de inmobiliarias y propiedades.

El objetivo es crear un sistema de **generación de publicaciones para redes sociales**, para que las inmobiliarias puedan generar contenido promocional de sus propiedades de forma rápida y automática.

---

## 1. Sección "Contenido para redes"

Agregar dentro del panel de cada inmobiliaria una sección llamada:

**Contenido para redes**

Esta sección permitirá generar publicaciones visuales a partir de las propiedades que ya tiene cargadas la inmobiliaria.

El objetivo es que la inmobiliaria pueda mantener contenido constante para sus redes sin tener que diseñar manualmente cada publicación.

---

## 2. Utilizar las propiedades existentes

El sistema debe utilizar únicamente propiedades pertenecientes a la inmobiliaria actual.

Al seleccionar una propiedad, utilizar sus datos existentes, como:

* Tipo de propiedad.
* Precio.
* Ubicación.
* Metros cuadrados.
* Cantidad de ambientes.
* Cantidad de habitaciones.
* Otras características disponibles.
* Nombre o información de la inmobiliaria.

---

## 3. Utilizar únicamente fotografías normales

Al generar una publicación:

* Buscar fotografías normales de la propiedad.
* **Excluir completamente las fotografías 360°.**
* No utilizar imágenes correspondientes a recorridos 360°.
* Seleccionar automáticamente una fotografía disponible cuando el sistema genere contenido de forma automática.

---

# 4. Sistema de templates

No utilizar inteligencia artificial paga ni generación mediante tokens.

La generación debe realizarse mediante **templates prediseñados**.

Crear diferentes diseños para las publicaciones.

Los templates pueden variar:

* Posición de la fotografía.
* Posición del título.
* Tamaño y posición del precio.
* Información de la propiedad.
* Distribución de los elementos.
* Tipografía.
* Composición visual.
* Elementos gráficos.

Los datos de la propiedad deben insertarse automáticamente dentro del template.

Por ejemplo:

**Casa en Ezeiza**
**$120.000.000**
120 m² · 3 ambientes · 2 habitaciones

También incluir la identidad de la inmobiliaria cuando corresponda.

El objetivo es que las publicaciones no sean siempre iguales y que el sistema vaya rotando los diferentes templates.

---

# 5. Generación sin inteligencia artificial

No utilizar:

* APIs de inteligencia artificial.
* Tokens de IA.
* Servicios pagos de generación de imágenes.
* Modelos de IA externos.

La generación debe ser completamente basada en:

**fotografías + datos de propiedades + templates + reglas de selección.**

La finalidad es que la generación sea rápida, gratuita y sin límites derivados del uso de IA.

---

# 6. Dos modos de funcionamiento

El sistema debe tener dos modos:

### Automático

La plataforma decide automáticamente:

* Qué propiedad utilizar.
* Qué fotografía utilizar.
* Qué template utilizar.

Debe intentar evitar repetir inmediatamente la misma propiedad, fotografía o diseño.

### Manual

La inmobiliaria puede seleccionar específicamente qué propiedad quiere promocionar.

Una vez seleccionada, el sistema genera rápidamente una publicación utilizando esa propiedad.

---

# 7. Configuración inicial

La primera vez que una inmobiliaria entre a **Contenido para redes** y todavía no tenga contenido generado, mostrar:

### ¿Cómo querés preparar tus publicaciones?

**Automático — recomendado**

> La plataforma seleccionará propiedades, fotografías y diseños automáticamente y preparará contenido para vos.

**Manual**

> Vos elegís qué propiedad querés promocionar cada día.

Por defecto debe estar seleccionado:

**Automático.**

---

# 8. La configuración debe mantenerse

La elección entre **Automático** y **Manual** no debe preguntarse nuevamente todos los días.

Debe funcionar como una configuración persistente.

Si el usuario selecciona:

**Automático**

permanece en automático hasta que decida cambiarlo.

Si selecciona:

**Manual**

permanece en manual hasta que decida cambiarlo.

Debe existir siempre una opción visible para modificar esta configuración.

---

# 9. Sistema de publicación actual y siguiente

La plataforma debe manejar dos estados:

### Publicación actual

Es el contenido disponible para utilizar durante el día actual.

### Próxima publicación

Es el contenido que queda preparado para el día siguiente.

Esto permite que la plataforma genere contenido anticipadamente sin depender de que el servidor esté funcionando durante la madrugada.

---

# 10. Funcionamiento en modo automático

Cuando la inmobiliaria utiliza el modo automático:

1. Se genera la publicación actual.
2. Se genera también una segunda publicación.
3. Esa segunda publicación queda preparada para el día siguiente.
4. La publicación del día siguiente queda almacenada y lista.
5. Cuando llega el siguiente día, esa publicación pasa a ser la publicación actual.
6. El sistema genera una nueva publicación para el día siguiente.

El objetivo es mantener siempre:

**Publicación actual + próxima publicación preparada.**

No depender de una tarea que tenga que ejecutarse exactamente a determinada hora durante la madrugada.

Esto debe funcionar correctamente incluso si el servidor gratuito se encuentra dormido o inactivo.

---

# 11. Primera entrada de la inmobiliaria

Si la inmobiliaria nunca utilizó esta sección:

Mostrar las opciones de generación.

Si elige automático:

**Generar la publicación actual + preparar la siguiente.**

Si elige manual:

**Generar la publicación actual según la propiedad elegida.**

No generar automáticamente una publicación futura en modo manual, porque el usuario deberá elegir qué propiedad quiere promocionar posteriormente.

---

# 12. Cambio de automático a manual

Si actualmente está funcionando en modo automático y existen:

**Publicación actual + próxima publicación**

y el usuario cambia a:

**Manual**

la publicación preparada para el día siguiente debe eliminarse.

Esto es importante porque esa publicación fue generada automáticamente y ya no corresponde al nuevo comportamiento.

Al día siguiente, el usuario deberá elegir manualmente qué propiedad quiere promocionar.

---

# 13. Cambio de manual a automático

Si la inmobiliaria estaba utilizando el modo manual y cambia a:

**Automático**

el sistema debe retomar el funcionamiento automático.

Debe generar una nueva publicación futura y comenzar nuevamente el ciclo:

**Actual → Próxima → Nueva próxima.**

---

# 14. Regeneración de la publicación

La inmobiliaria debe poder utilizar un botón:

**Regenerar**

para crear otra versión de la publicación actual.

Cada regeneración debe:

* Utilizar otro template cuando sea posible.
* Poder utilizar otra fotografía.
* Mantener los datos correctos de la propiedad.
* Reemplazar la versión anterior.

No conservar múltiples imágenes innecesarias.

---

# 15. Límite de regeneraciones

Para una inmobiliaria/usuario normal:

**Máximo 3 regeneraciones por día.**

Las 3 regeneraciones no son acumulativas.

Al comenzar un nuevo día vuelve a disponer de:

**3 regeneraciones.**

El límite debe aplicarse únicamente a la generación/regeneración de la publicación actual.

La publicación preparada para el día siguiente no debe consumir esas regeneraciones.

---

# 16. Administrador general

El administrador general de la plataforma tendrá:

**Regeneraciones ilimitadas.**

No debe tener el límite de 3 generaciones diarias.

---

# 17. Liberación de almacenamiento

Las imágenes generadas dentro de la plataforma deben gestionarse para evitar ocupar almacenamiento innecesariamente.

Cuando se genere una nueva versión:

**la versión anterior debe ser reemplazada/eliminada.**

Cuando la publicación actual pase a ser reemplazada por una nueva, también debe eliminarse la anterior.

La publicación preparada para el día siguiente debe conservarse hasta que corresponda utilizarla.

El sistema debe mantener únicamente las imágenes necesarias:

**Actual + Próxima.**

No almacenar indefinidamente generaciones anteriores.

---

# 18. Experiencia del usuario

La sección debe mostrar claramente:

### Publicación de hoy

[Vista previa]

**Regenerar**
**Descargar**

Mostrar también el estado:

### Próxima publicación

**Preparada ✓**

La publicación futura puede mantenerse preparada internamente sin necesidad de mostrar todas sus opciones al usuario.

---

# 19. Selección manual

Cuando el usuario está en modo manual, debe poder seleccionar:

**"Elegir propiedad"**

y visualizar las propiedades disponibles de su inmobiliaria.

Después de seleccionar una propiedad:

1. Seleccionar una fotografía normal.
2. Seleccionar un template.
3. Insertar automáticamente los datos.
4. Generar la publicación.
5. Mostrarla inmediatamente.

---

# 20. Generación automática

Cuando está en modo automático:

El sistema debe seleccionar automáticamente:

**Propiedad → Fotografía → Template → Datos → Publicación**

Debe evitar repeticiones innecesarias y rotar los contenidos disponibles.

No es necesario utilizar inteligencia artificial para esto.

---

# 21. Notificación dentro de la plataforma

Cuando se genere una nueva publicación, mostrar una notificación dentro de la plataforma.

Por ejemplo:

> **Tu publicación está lista.**

> Ya tenés nuevo contenido para compartir en redes.

Desde la notificación se debe poder acceder rápidamente a la sección de contenido.

---

# 22. Descarga

La inmobiliaria debe poder descargar fácilmente la publicación generada para utilizarla en sus redes sociales.

La primera versión de esta funcionalidad debe centrarse en:

**Generar → Notificar → Descargar.**

---

# Objetivo final

La funcionalidad debe conseguir que una inmobiliaria pueda entrar a la plataforma y sentir que:

> **La plataforma ya está trabajando en su contenido.**

En modo automático, la inmobiliaria no debería tener que entrar todos los días para elegir una propiedad.

El sistema mantiene preparado:

**Contenido de hoy + contenido del próximo día.**

En modo manual, la inmobiliaria mantiene el control y decide qué propiedad quiere promocionar cada día.

El sistema debe ser rápido, simple y visual.

**No agregar funcionalidades adicionales que no estén especificadas en este prompt.**

La funcionalidad debe integrarse con la aplicación existente, respetando las propiedades, usuarios, inmobiliarias, permisos y estructura actual de la plataforma.

**Puedes proponer nuevas ideas y tecnologias que no esten en este promp siempre y cuando preguntes y despejes todas las dudas antes de comenzar a crear para evitar problemas y perdida de tiempo**
