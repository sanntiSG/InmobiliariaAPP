Debemos usar las siguientes skills para el frontend: skillsgpt-tasteskill, emil-desing-eng, impeccable y animate. Siempre que termines una tarea, realiza el commit de todo lo realizado, para ver cómo quedaron los cambios, y luego sigamos con la siguiente tarea, algo importante, cuando estemos cerca de terminar con el límite de la sesión, debemos finalizar rápido la última tarea que se esté realizando y dejar todo listo para que la página funcione haciendo el commit y luego continuaremos en otra sesión.

Quiero desarrollar un sistema web completo y escalable para una inmobiliaria, pero con una propuesta diferencial respecto de las inmobiliarias tradicionales.

El sistema debe combinar las funciones esenciales de una plataforma inmobiliaria moderna con una experiencia similar a una red social y, principalmente, con una experiencia inmersiva para explorar propiedades.

La plataforma debe permitir publicar y administrar propiedades con toda la información inmobiliaria habitual: fotografías, descripción, precio, ubicación, características, ambientes, superficie, tipo de operación, estado, información de contacto, etc. También debe incluir búsqueda y filtros avanzados, visualización detallada de cada propiedad, galerías de imágenes, información de ubicación mediante mapas, datos relevantes de la propiedad y las funciones que normalmente se esperan de una inmobiliaria profesional.

El principal diferencial será la incorporación de Digital Twins (gemelos digitales) y recorridos 3D mediante Matterport. Cada propiedad podrá tener asociada una experiencia inmersiva para que el usuario pueda recorrer virtualmente la casa o departamento, además de visualizar sus fotografías tradicionales. La arquitectura debe quedar preparada desde el inicio para integrar esta funcionalidad posteriormente y permitir que una propiedad pueda tener o no un Digital Twin/recorrido 3D.

El segundo gran diferencial será convertir la plataforma en una experiencia similar a una red social inmobiliaria. Los usuarios deberán poder registrarse e iniciar sesión, explorar propiedades, guardar propiedades de interés, dar "Me gusta", comentar, valorar/rankear propiedades y consultar su actividad. La interacción de los usuarios debe estar contemplada desde el diseño inicial para poder ampliarla posteriormente.

También debe existir un mapa general e interactivo donde puedan visualizarse las propiedades disponibles de la inmobiliaria, permitiendo explorar propiedades según su ubicación.

Cada usuario deberá contar con una experiencia personalizada. Inicialmente no se utilizará inteligencia artificial avanzada ni APIs de IA de pago. Las recomendaciones deberán generarse mediante lógica tradicional basada en datos y preferencias, como ubicación, rango de precio, tipo de propiedad, cantidad de ambientes, características buscadas, propiedades vistas, likes, guardados y otras interacciones. El sistema debe quedar preparado para evolucionar posteriormente hacia sistemas de recomendación más avanzados.

También se deberán contemplar notificaciones personalizadas para cada usuario. En la primera versión las notificaciones serán internas y visibles cuando el usuario ingrese a la plataforma. Deben poder utilizarse para informar sobre nuevas propiedades que coincidan con sus preferencias, cambios de precio, propiedades recomendadas, actividad relacionada con sus interacciones u otros eventos relevantes. Más adelante se podrá evolucionar hacia notificaciones push, email u otros canales.

La experiencia debe ser completamente responsive y estar diseñada para funcionar correctamente en desktop, tablet y especialmente dispositivos móviles. La interfaz debe priorizar una experiencia visual moderna, fluida y atractiva, evitando el aspecto genérico de una inmobiliaria tradicional. Se deben aprovechar animaciones y transiciones cuando aporten valor a la experiencia, sin perjudicar rendimiento ni accesibilidad.

El sistema debe contemplar desde el principio dos grandes áreas: la experiencia del usuario que busca propiedades y la gestión de la inmobiliaria. La inmobiliaria deberá poder administrar propiedades, información, fotografías, disponibilidad, precios, ubicación, características, publicaciones y posteriormente gestionar los Digital Twins/recorridos 3D asociados.

La arquitectura general debe quedar preparada para escalar en cantidad de usuarios, propiedades, interacciones y funcionalidades. Las propiedades deben poder incorporar diferentes tipos de contenido multimedia y experiencias inmersivas sin tener que rediseñar el sistema posteriormente.

El objetivo final es crear una plataforma inmobiliaria que no sea simplemente un catálogo de casas, sino una combinación de:

Portal inmobiliario profesional.
Red social enfocada en propiedades.
Sistema personalizado de descubrimiento y recomendaciones.
Mapa interactivo de propiedades.
Sistema de favoritos, likes, rankings y comentarios.
Notificaciones personalizadas.
Experiencia multimedia con fotografías.
Digital Twins y recorridos 3D mediante Matterport.
Base preparada para incorporar posteriormente nuevas tecnologías de visualización 3D/360°.
Panel de gestión para la inmobiliaria.
Arquitectura preparada para evolucionar hacia funcionalidades más avanzadas.

la idea es crear una plataforma para inmobiliarias. O sea, algo más como un Shopify de las inmobiliarias, donde cada una pueda crear su perfil, cargar propiedades, pero ojo, por ahora, al entrar a la web, se podra elegir si se quiere solo explorar (sin iniciar sesion o crear cuenta (no recibira feedback, recomendaciones, notificaciones, etc)) (inciciar sesion o crear cuenta) o publicar tu inmobiliara (si se elige esto, se debera poner en contacto via whatsapp con el proovedor +5491137796683, solo el proovedor o el admin puede crear, eliminar, editar o administrar una inmobiliaria, las propiedades etc se manejan desde el dashboard de cada inmobiliaria. Dentro de las estadisticas de cada panel de inmobiliaria podremos ver la informacion de los usuarios interesados en sus propiedades,likes, favoritos, comentarios, visualizaciones, recomendaciones por estadisticas (no ia) por ejemplo, crecio la visualizacion un 10% mas que la semana pasada, 300 me gusta nuevos, 50 comentarios nuevos, etc. Decayeron las vistas, se recomienda subir nuevas fotos, se recomeinda subir videos, se recomeinda subir el recorrido en 3d, se recomienda subir nuevas propiedades, etc (la idea es que sea muy visual y limpio el aspecto de la web, acompañado de efectos y animaciones con GSAP, en un apartado tendremos un mapa de la zona, y podremos ver como identificadores en el mapa, de las casas o departamentos disponibles por inmobiliaria, y al hacer click aparecera toda la informacion necesaria (contacto, datos, fotos, el recorrido en 3d, ETC) como si fuera google maps pero sin usar nada pago ni con limite de tokens, todo debe ser gratis. si suguieres algo, o tienes preguntas, hazlas antes de comenzar para ahorrar errores. 

Tecnologias a utilizar:
ReactJS
NextJS
NodeJS
Typescript
TailwindCSS
GSAP
MongoDB
ThreeJS (si lo requiere)
Render
Netlify
Github: ssantii200@gmail.com — Repositorio: InmobiliariaAPP (autenticación vía `gh auth login` o un Personal Access Token; nunca la contraseña de la cuenta en texto plano)
Cuida la seguridad de la aplicacion. No subas nada peligroso

No utilizar IA de pago.
No utilizar APIs de IA de pago.

REFERENCIA VISUAL

Existe una carpeta:

/UIreference

Dentro de esa carpeta hay una imagen de referencia visual.

DEBES ANALIZAR ESA IMAGEN ANTES DE DISEÑAR LA UI.

Utilizá la referencia como inspiración principal para:

lenguaje visual
composición
espaciado
jerarquía visual
tipografías
tamaños
bordes
cards
botones
navegación
tratamiento de imágenes
estética general
animaciones
