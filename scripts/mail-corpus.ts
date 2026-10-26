/**
 * Banco de mails de ejemplo (castellano rioplatense) para medir qué tanto entiende el agente de correo. Cada mail tiene la
 * etiqueta que le pondría una persona:
 *   inq   → es una consulta: tiene que entenderse (como consulta clara o como "quizás", nunca descartarse);
 *   clear → es una consulta clara: además tiene que salir como consulta clara (no "quizás");
 *   no    → no es una consulta: tiene que descartarse;
 *   maybe → cualquiera de las dos salidas es razonable (no suma ni resta).
 * `mail:check` falla si baja de los umbrales de `THRESHOLDS`. Sumar un ejemplo nuevo es agregar una línea.
 */
import { buildEntityIndex } from "../src/lib/advisor/nlu/entities";
import { classifyMail } from "../src/lib/mail/classify";
import { cleanBody } from "../src/lib/mail/clean";
import { extractSlugs } from "../src/lib/mail/refs";
import { readRequest, searchSignal } from "../src/lib/mail/signals";

export type Label = "inq" | "clear" | "no" | "maybe";
export type Sample = {
  l: Label;
  s?: string;
  t: string;
  /** Viene de un portal reconocido. */
  portal?: boolean;
  /** Temas que tiene que contestar una persona (financiación, mascotas…). `[]` = ninguno. Si falta, no se mide. */
  h?: string[];
};

/** Catálogo de mentira: lo que sabe la inmobiliaria (zonas y títulos reales de sus propiedades). */
const INDEX = buildEntityIndex({
  zones: ["Ezeiza", "Canning", "Palermo", "Villa Crespo", "Flores", "Pilar", "Belgrano", "Tigre", "Quilmes", "Caballito"],
  properties: [
    { id: "a1", title: "casa de Alan" },
    { id: "a2", title: "Departamento luminoso en Palermo" },
    { id: "a3", title: "PH con patio en Villa Crespo" },
    { id: "a4", title: "Casa en Canning con pileta" },
    { id: "a5", title: "Oficina en alquiler en Flores" },
    { id: "a6", title: "Terreno en Pilar" },
  ],
});

export const CORPUS: Sample[] = [
  // ── Disponibilidad ────────────────────────────────────────────────────────
  { l: "clear", t: "¿Sigue disponible la casa de Alan?" },
  { l: "clear", t: "Hola, vi el departamento luminoso en Palermo. ¿Todavía está disponible?" },
  { l: "clear", t: "Buenas tardes, consulto si la casa en Canning con pileta continúa en venta." },
  { l: "clear", t: "Hola! El PH de Villa Crespo sigue en alquiler?" },
  { l: "clear", s: "Oficina en alquiler en Flores", t: "sigue disponible?" },
  { l: "clear", s: "Terreno en Pilar", t: "Disponible?" },
  { l: "clear", t: "Buen día, quería saber si ya se vendió la casa de Alan" },
  { l: "clear", t: "Hola, ¿ya se alquiló la oficina de Flores?" },
  { l: "clear", t: "La casa de Ezeiza todavía se vende? Gracias" },
  { l: "clear", t: "Estimados: ¿se encuentra disponible el departamento de Palermo? Saludos cordiales" },
  { l: "inq", t: "hola, el depto de palermo sigue? gracias" },
  { l: "clear", t: "Buenas, sigue en venta la casa de alan?" },
  // ── Precio ────────────────────────────────────────────────────────────────
  { l: "clear", t: "¿Cuánto sale la casa de Alan?" },
  { l: "clear", t: "Hola, me pasan el precio del departamento en Palermo por favor" },
  { l: "clear", t: "Precio y expensas de la oficina en Flores?" },
  { l: "clear", t: "Buenas, a cuánto está el PH en Villa Crespo?" },
  { l: "clear", t: "Cuánto piden por el terreno de Pilar" },
  { l: "clear", t: "Quisiera saber el valor de la casa en Canning, gracias" },
  { l: "clear", t: "¿En cuánto está el alquiler del depto de Palermo?" },
  { l: "clear", t: "Hola, tienen el precio de la casa de Ezeiza? lo vi en la web" },
  { l: "clear", s: "Casa en Canning con pileta", t: "Valor?" },
  { l: "clear", t: "Me interesa la casa de Alan, ¿cuál es el precio final?" },
  { l: "inq", t: "cuanto sale el depto de palermo" },
  { l: "inq", t: "precio casa canning" },
  { l: "clear", s: "Casa de Alan", t: "Precio?" },
  // ── Visita ────────────────────────────────────────────────────────────────
  { l: "clear", t: "Quiero visitar la casa de Alan, ¿cuándo puedo ir?" },
  { l: "clear", t: "Hola, queremos ver el departamento de Palermo este sábado. ¿Se puede?" },
  { l: "clear", t: "Buenas tardes, ¿podemos coordinar una visita a la oficina de Flores?" },
  { l: "clear", t: "Cuándo podría ir a ver el PH de Villa Crespo?" },
  { l: "clear", t: "Me gustaría conocer la casa de Canning, qué horarios tienen?" },
  { l: "clear", s: "Casa de Alan", t: "Hola, podría pasar a verla mañana por la tarde?" },
  { l: "inq", s: "Agendar visita", t: "departamento palermo" },
  { l: "clear", t: "Buen día. Quiero ver el terreno de Pilar con mi arquitecto, ¿cuándo se puede?" },
  { l: "inq", t: "Buenas, kisiera visitar la propiedad de flores" },
  // ── Características ───────────────────────────────────────────────────────
  { l: "clear", t: "¿Cuántos ambientes tiene la casa de Alan?" },
  { l: "clear", t: "Hola, el departamento de Palermo tiene cochera? y balcón?" },
  { l: "clear", t: "Cuántos m2 tiene el PH de Villa Crespo?" },
  { l: "clear", t: "La oficina de Flores incluye expensas? Cuántos baños tiene?" },
  { l: "clear", t: "¿Tiene pileta la casa en Canning? ¿Y cuántos dormitorios?" },
  { l: "clear", t: "¿Aceptan mascotas en el departamento de Palermo?" },
  { l: "clear", t: "El PH de Villa Crespo tiene patio? Qué orientación?" },
  { l: "inq", t: "Hola, ¿de qué año es la casa de Alan?" },
  // ── Búsquedas sin propiedad nombrada ──────────────────────────────────────
  { l: "clear", s: "Casas en venta en Ezeiza", t: "" },
  { l: "clear", s: "Casas en venta en Ezeiza", t: "Hola" },
  { l: "clear", t: "Busco un depto de 2 ambientes en Canning hasta 500 dólares" },
  { l: "clear", t: "Quiero comprar una casa por la zona sur" },
  { l: "clear", t: "Buenas, ¿tienen departamentos en alquiler en Belgrano?" },
  { l: "clear", s: "Alquiler departamento Palermo 2 ambientes", t: "" },
  { l: "clear", t: "Necesito una oficina en alquiler cerca del centro, unos 50 m2" },
  { l: "clear", t: "Hola, estoy buscando una casa con jardín en Pilar, presupuesto 200 mil dólares" },
  { l: "clear", s: "Terrenos en venta en Pilar", t: "" },
  { l: "clear", t: "Me gustaría ver casas en Ezeiza para comprar, tengo presupuesto de 150 mil dólares" },
  { l: "clear", t: "Hola, busco local comercial para alquilar en Quilmes" },
  { l: "clear", t: "Alguna opción de PH en Villa Crespo? Hasta 120 mil usd" },
  { l: "clear", s: "Departamentos 3 ambientes venta Tigre", t: "" },
  { l: "clear", t: "Hola, buenas tardes. Estamos buscando una casa de 3 dormitorios con cochera para comprar. Zona Canning o Ezeiza." },
  { l: "clear", s: "Dptos en alquiler en Caballito", t: "" },
  { l: "clear", t: "Quisiera alquilar un monoambiente por Palermo, hasta 400 usd" },
  { l: "inq", t: "tienen casas en ezeiza" },
  { l: "inq", t: "Hola busco depto en alquiler zona palermo 2 amb" },
  { l: "inq", t: "dpto 3 amb en venta? belgrano" },
  { l: "clear", t: "Hola, ¿tienen casas?" },
  { l: "inq", t: "Buenas, alquileres?" },
  { l: "clear", t: "Buen día, necesito un departamento de 2 dormitorios en alquiler, zona norte, con cochera" },
  { l: "clear", t: "Estoy viendo opciones de casas en venta en Tigre o Pilar, con pileta y quincho" },
  { l: "inq", t: "Hola, quiero alquilar. ¿Qué tienen?" },
  // ── Pedidos de información ────────────────────────────────────────────────
  { l: "clear", t: "Hola, me interesa la casa de Alan, ¿me pasan más información?" },
  { l: "clear", t: "Buenas, quiero información sobre el departamento de Palermo" },
  { l: "clear", s: "Casa en Canning con pileta", t: "Me interesa, pasame datos por favor" },
  { l: "clear", t: "Estoy interesado en la propiedad de Flores. ¿Pueden enviarme fotos y detalles?" },
  { l: "clear", t: "Hola, vi su aviso en Zonaprop del PH de Villa Crespo y quisiera más datos", portal: false },
  { l: "inq", s: "Consulta por la casa de Alan", t: "Hola, buen día. Quedo atento. Gracias" },
  { l: "clear", t: "Les escribo por el terreno de Pilar. ¿Me pueden llamar al 11 5555-1234?" },
  { l: "inq", t: "Buenas tardes, quisiera consultar por un departamento que vi en su página" },
  { l: "inq", t: "Vi su publicación y me interesa" },
  { l: "clear", t: "Hola! ¿Me pueden mandar el link de la casa de Alan? gracias" },
  { l: "clear", s: "Departamento luminoso en Palermo", t: "Información por favor" },
  { l: "inq", t: "Buenas tardes. Quiero saber si pueden mostrarme alguna opción para alquilar" },
  { l: "clear", s: "Terreno en Pilar", t: "Info" },
  { l: "inq", s: "Hola buenas", t: "Me interesa, ¿me pasan datos por favor?" },
  { l: "inq", t: "Quisiera más información sobre las propiedades que tienen disponibles" },
  // ── Portales y reenviados ─────────────────────────────────────────────────
  { l: "clear", t: "Hola, estoy interesado en el inmueble publicado en Argenprop (casa de Alan). Quiero más info.", portal: true },
  { l: "clear", s: "Consulta desde Zonaprop", t: "Departamento luminoso en Palermo. El cliente pregunta si sigue disponible.", portal: true },
  { l: "clear", s: "Fwd: Consulta", t: "Reenvío esta consulta: Casas en venta en Ezeiza, ¿tienen algo?" },
  { l: "clear", s: "Mercado Libre: te hicieron una pregunta", t: "Sobre Departamento luminoso en Palermo: ¿Tiene cochera?", portal: true },
  // ── Errores de tipeo y formas informales ──────────────────────────────────
  { l: "inq", t: "ola, sigue dispnible la casa de alan?" },
  { l: "inq", t: "buen dia, esta disponible el ph?" },
  { l: "inq", t: "Hola, kiero info del depto de palermo" },
  { l: "inq", t: "Consutla por casa en canning" },
  // ── Varias preguntas ──────────────────────────────────────────────────────
  { l: "clear", s: "Casa en Canning con pileta", t: "Hola, ¿sigue disponible? ¿Cuánto es? ¿Acepta mascotas? ¿Puedo ir mañana?" },
  { l: "clear", s: "PH con patio en Villa Crespo", t: "Buenas! 1) precio 2) expensas 3) si aceptan crédito hipotecario" },
  // ── Cosas que atiende una persona (financiación, permuta, venta propia…) ──
  { l: "inq", t: "Hola, quiero vender mi casa en Ezeiza, ¿cómo es el proceso de tasación?" },
  { l: "inq", t: "Tengo un departamento en Palermo para alquilar, ¿lo pueden publicar?" },
  { l: "inq", t: "Buenas tardes, queremos tasar una propiedad en Pilar" },
  { l: "clear", t: "Hola, me interesa la casa de Alan. ¿Podemos negociar el precio? Pago al contado" },
  { l: "clear", t: "El departamento de Palermo, ¿aceptan permuta por un auto?" },
  { l: "clear", t: "Quiero alquilar el PH de Villa Crespo, ¿qué garantía piden?" },
  // ── Mails largos y naturales ──────────────────────────────────────────────
  {
    l: "clear",
    s: "Consulta",
    t: "Buenos días. Mi nombre es Laura y estamos con mi pareja buscando mudarnos de Capital. Vimos en su página la casa en Canning con pileta y nos gustó mucho. ¿Nos podrían decir si todavía está disponible, cuánto es el valor y si podemos verla el fin de semana? Muchas gracias, quedamos atentos.",
  },
  {
    l: "clear",
    s: "Alquiler",
    t: "Hola, escribo porque necesito alquilar un departamento de 2 ambientes en Palermo o Villa Crespo, para entrar el mes que viene. Mi presupuesto es de hasta 600 dólares. Trabajo en relación de dependencia. ¿Tienen algo así? Gracias.",
  },
  {
    l: "clear",
    t: "Estimados, me comunico por el terreno de Pilar que figura en su sitio web. Quisiera conocer las medidas exactas, si tiene escritura y si es posible visitarlo. Saludos, Martín.",
  },
  // ── No son consultas ──────────────────────────────────────────────────────
  { l: "no", t: "Gracias por la información!" },
  { l: "no", t: "Perfecto, gracias. Quedo atento." },
  { l: "no", s: "Re: Casa de Alan", t: "Genial, muchas gracias" },
  { l: "no", t: "Hola, buenos días. Recibimos su factura N° 0001-00001234 con vencimiento el 15/11. Saludos" },
  { l: "no", t: "Adjunto mi currículum para el puesto de vendedor/a inmobiliario." },
  { l: "no", t: "Estimados: nos ponemos en contacto para ofrecerles nuestros servicios de marketing digital y posicionamiento SEO." },
  { l: "no", t: "Hola Santi, ¿cómo andás? ¿Nos juntamos el sábado a comer un asado?" },
  { l: "no", t: "Reunión de consorcio el jueves a las 19hs. Se ruega puntualidad." },
  { l: "no", s: "Las mejores ofertas de la semana", t: "Aprovechá descuentos exclusivos. Para darse de baja haga clic aquí." },
  { l: "no", t: "¡Felicitaciones! Ganaste un premio de 1.000.000. Verifica tu cuenta ingresando aquí." },
  { l: "no", s: "Delivery Status Notification (Failure)", t: "El mensaje no se pudo entregar. Undeliverable." },
  { l: "no", s: "Respuesta automática", t: "Estoy fuera de la oficina hasta el lunes. Responderé a mi regreso." },
  { l: "no", t: "Te paso el link de la reunión de mañana a las 10: meet.google.com/abc-defg-hij" },
  { l: "no", t: "Ok dale, nos vemos" },
  { l: "no", t: "Hola" },
  { l: "no", t: "Buen día, ¿cómo están? Les mando el contrato firmado." },
  { l: "no", t: "Orden de compra 4455 adjunta. Favor confirmar recepción." },
  { l: "no", s: "Tu compra fue enviada", t: "Mercado Libre: seguí tu envío desde la aplicación. Llega mañana." },
  { l: "no", t: "Recordatorio: el pago de expensas vence el 10 de este mes." },
  { l: "no", s: "Curso de capacitación", t: "Inscripciones abiertas al seminario de ventas inmobiliarias. Cupos limitados." },
  { l: "no", t: "Ganá dinero desde casa con esta inversión garantizada. Escribinos ya." },
  { l: "no", t: "Le informamos que debe regularizar su habilitación comercial antes del viernes." },
  { l: "no", t: "¿Tenés tiempo para una reunión mañana a las 15?" },
  { l: "no", t: "Perdón, me equivoqué de mail." },
  { l: "no", t: "Necesito que me envíes la factura del mes pasado." },
  { l: "no", s: "Prueba", t: "prueba de envío" },
  { l: "no", t: "Consulta técnica: el router no anda, ¿pueden revisar?" },
  { l: "no", s: "Cumpleaños", t: "¡Feliz cumpleaños! Que la pases genial, un abrazo." },
  { l: "no", t: "Les comparto el informe mensual de resultados del equipo comercial." },
  { l: "no", t: "Hola, soy de la municipalidad. Le recordamos el vencimiento de la tasa de alumbrado." },
  { l: "no", t: "Buenas tardes, ¿me pasás el número del contador?" },
  { l: "no", s: "Cotización de servicios", t: "Le ofrecemos nuestros servicios de limpieza de oficinas con propuesta comercial a medida." },
  { l: "no", t: "Confirmo asistencia a la reunión del lunes. Saludos." },
  { l: "no", t: "Estimado cliente: su tarjeta fue suspendida. Ingrese aquí para verificar su cuenta." },
  { l: "no", t: "Les escribo para pedirles una donación para el club del barrio." },
  { l: "no", s: "Presentación", t: "Hola, soy diseñador y hago diseño web para empresas. Mirá mi portfolio." },
  { l: "no", t: "gracias" },
  { l: "no", t: "Buenas tardes, ¿cómo va todo? Una consulta rápida sobre el sistema de facturación." },
  { l: "no", t: "Les envío el comprobante de pago de la transferencia de ayer." },
  { l: "no", t: "Felices fiestas les desea todo el equipo." },
  // ── Segunda tanda (escrita sin mirar cómo respondía el clasificador) ───────────
  { l: "clear", t: "Buenas! Les escribo por el departamento que está publicado en Palermo. Quería saber si aún está libre y cuál es el alquiler mensual." },
  { l: "clear", t: "Hola, vi una casa hermosa en Ezeiza en su web. ¿Podría coordinar para verla?" },
  { l: "clear", t: "Estimada inmobiliaria: Me contacto para consultar sobre propiedades en venta en la zona de Pilar. Busco algo de 4 ambientes." },
  { l: "inq", t: "Hola tengo interés en comprar un terreno en Pilar, qué lotes tienen?" },
  { l: "clear", t: "Buenas noches, soy inquilino y quiero mudarme a Belgrano. Necesito 2 ambientes con balcón, máximo 450 dólares. ¿Tienen?" },
  { l: "inq", t: "Che, la casa de Canning la tienen todavía? Me copó." },
  { l: "inq", t: "Consulta: ¿el PH de Villa Crespo permite uso profesional?" },
  { l: "inq", t: "Hola quería preguntar por el departamento de 3 ambientes, si tiene baulera" },
  { l: "inq", t: "Disculpen, ¿la oficina de Flores se puede alquilar por 6 meses?" },
  { l: "inq", t: "Buenos días, ¿cuánto cuesta alquilar un local comercial en Tigre?" },
  { l: "inq", t: "Hola, mi nombre es Carla. Busco alquilar una casa para vivir con mi familia (somos 4) cerca de colegios en Quilmes. Gracias!" },
  { l: "inq", t: "Quiero tasar mi departamento de Caballito" },
  { l: "inq", t: "Hola! Me interesa el lote, ¿tienen más información? ¿Se puede financiar?" },
  { l: "inq", t: "¿La casa de Alan es apta crédito?" },
  { l: "inq", t: "Hola, vi su cartel en la calle en Pilar y quería consultar por un lote" },
  { l: "inq", t: "Buen día, quisiera coordinar una visita para el sábado a las 11 por la casa en Canning" },
  { l: "inq", t: "Saludos, me interesa alquilar un depto de 1 ambiente en Palermo. Presupuesto 350 USD. Disponibilidad inmediata." },
  { l: "inq", t: "Hola, pregunto por el departamento: cuánto son las expensas?" },
  { l: "inq", t: "Hola, ¿ustedes manejan alquileres temporarios en Tigre?" },
  { l: "inq", t: "Buenas, necesito comprar una casa urgente en Ezeiza, tengo la plata disponible" },
  { l: "inq", t: "hola buenas tardes! precio de los terrenos?" },
  { l: "inq", t: "Hola. Casa en venta Canning 3 dormitorios?" },
  { l: "inq", t: "Vi publicado un PH. ¿Cuántos metros cubiertos tiene?" },
  { l: "inq", t: "Consulta por alquiler de oficina en Flores, necesitamos para 10 personas" },
  { l: "inq", t: "Hola, estoy en Madrid y me interesa comprar un departamento en Palermo para inversión. ¿Qué opciones tienen en dólares?" },
  { l: "inq", t: "Buen día. Soy arquitecto, quiero ver el terreno para un cliente. ¿Cuándo puedo?" },
  { l: "inq", t: "¿Me pasan el contacto del dueño de la casa de Canning?" },
  { l: "inq", t: "Hola! Una pregunta: el departamento de Palermo está en planta baja?" },
  { l: "inq", t: "Alquiler casa Ezeiza" },
  { l: "inq", t: "¿Tienen algo en venta por Belgrano hasta 200 mil dólares?" },
  { l: "inq", t: "Hola quiero saber si tienen cocheras en alquiler en Palermo" },
  { l: "no", t: "Hola, le escribo del banco para informarle sobre su cuenta. Ingrese a este enlace para actualizar sus datos." },
  { l: "no", t: "Querido cliente, te ofrecemos un plan de salud con 30% de descuento. Consultá sin compromiso." },
  { l: "no", t: "Confirmado el pago, gracias." },
  { l: "no", t: "Mañana paso a dejar los papeles de la oficina." },
  { l: "no", t: "Les confirmo la reunión del miércoles en la oficina." },
  { l: "no", t: "Aviso de vencimiento de su seguro de caución." },
  { l: "no", t: "Hola, ¿tienen tiempo para una videollamada hoy?" },
  { l: "no", t: "Les mandamos la propuesta de publicidad para el aviso en el diario." },
  { l: "no", t: "Feliz navidad a todo el equipo!" },
  { l: "no", t: "Tu cuenta de Zonaprop vence en 5 días. Renová tu plan." },
  { l: "no", t: "Te invito a mi casa el viernes." },
  { l: "no", t: "Comprobante de transferencia adjunto, saludos." },
  { l: "no", t: "¿Podés pasarme el contacto de un escribano?" },
  { l: "no", t: "Estimados, adjunto el balance del mes." },
  { l: "no", t: "Hola! Te escribo porque quiero vender un auto, ¿lo publicás?" },
  { l: "no", t: "Buenas, ¿cómo salió la reunión de ayer?" },
  { l: "no", t: "Les aviso que mañana no voy a poder asistir." },
  { l: "no", s: "Re: Factura", t: "Ya la pagué, te mando el comprobante." },
  { l: "no", t: "Hola, necesito un presupuesto de pintura para el local de mi cliente." },
  { l: "maybe", t: "Buenas tardes, soy el plomero, ¿a qué hora paso a revisar la pérdida de la casa de la calle Mitre?" },
  { l: "maybe", t: "Se cayó el sistema de la oficina otra vez, ¿pueden mirar?" },
  // ── Dudosos: cualquiera de las dos salidas está bien ──────────────────────
  { l: "maybe", t: "Hola, pasó algo con la propiedad" },
  { l: "maybe", t: "Me mudé a una casa nueva, ¡te invito a conocerla!" },
  { l: "maybe", s: "Consulta", t: "Buenas, ¿podrían llamarme? Gracias." },
  { l: "maybe", t: "Quiero hablar con el dueño de la casa de Alan, por un tema de medianera." },
  // ── Preguntas puntuales y temas para una persona (segunda tanda, escrita sin mirar el clasificador) ──
  { l: "clear", h: [], t: "Hola, buen día! Consulto por la casa de Alan: ¿tiene pileta? ¿Cuántos dormitorios? Gracias" },
  { l: "clear", h: [], t: "Buenas tardes, del departamento luminoso en Palermo ¿cuánto son las expensas? ¿Tiene baulera?" },
  { l: "clear", h: [], t: "Hola, vi el PH de Villa Crespo, ¿tiene patio propio? ¿En qué piso está?" },
  { l: "clear", h: [], t: "Quería saber la antigüedad de la casa en Canning con pileta y si da al norte" },
  { l: "clear", h: [], t: "Hola! La oficina de Flores tiene baño privado? cuántos m2 son?" },
  { l: "clear", h: ["escritura o comisión"], t: "Buen día, el terreno de Pilar tiene escritura? cuántos metros son?" },
  { l: "clear", h: ["financiación"], t: "Hola, ¿el departamento de Palermo es apto crédito?" },
  { l: "inq", h: ["mascotas"], t: "Tengo un perro mediano, ¿puedo alquilar el PH de Villa Crespo?" },
  { l: "inq", h: ["negociación del precio"], t: "¿Se puede negociar el precio de la casa de Alan? Estoy interesado" },
  { l: "inq", h: [], t: "Trabajo en el Banco Provincia y me interesa ver el departamento de Palermo" },
  { l: "inq", h: ["requisitos del alquiler"], t: "Hola, ¿me pueden decir si aceptan garantía propietaria para el PH de Villa Crespo?" },
  { l: "inq", h: ["escritura o comisión"], t: "Me interesa la casa de Alan, ¿cuánto es la comisión de la inmobiliaria?" },
  { l: "inq", h: [], t: "Buenas, vi su oferta de propiedades en Palermo. ¿Tienen departamentos de 2 ambientes?" },
  { l: "inq", h: ["negociación del precio"], t: "Quisiera hacer una oferta por la casa de Alan, ¿sigue disponible?" },
  { l: "inq", h: ["negociación del precio"], t: "Estimados: ofrezco USD 180.000 por la casa en Canning con pileta, ¿les interesa?" },
  { l: "clear", h: [], t: "Hola, soy Gabriela Pegatos, me interesa el departamento de Palermo, ¿sigue disponible?" },
  { l: "inq", h: ["mascotas"], t: "Hola, estoy buscando casa en Ezeiza con jardín, tengo un gato y un perro, ¿aceptan?" },
  { l: "inq", h: ["financiación"], t: "El depto de Palermo ¿se puede pagar con crédito hipotecario del Banco Nación?" },
  { l: "inq", h: ["permuta"], t: "Hola! ¿Cuánto sale la casa de Alan? ¿Aceptan permuta por un auto?" },
  { l: "inq", h: ["tasación o venta de su propiedad"], t: "Consulta: tengo una casa en Quilmes para vender, ¿hacen tasaciones?" },
  { l: "clear", h: [], t: "Buen día, ¿la casa en Canning con pileta sigue disponible? ¿Cuántos baños tiene?" },
  { l: "clear", h: [], t: "Hola, ¿el terreno de Pilar tiene luz y agua? ¿Cuánto sale?" },
  { l: "inq", h: [], t: "Hola, el PH de Villa Crespo, ¿se puede ver el sábado a la mañana?" },
  { l: "inq", h: ["requisitos del alquiler"], t: "Buenas! Para alquilar la oficina de Flores, ¿qué requisitos piden?" },
  { l: "no", t: "Te paso los datos de la cuenta del banco para la transferencia de la factura" },
  { l: "no", t: "Mi perro se llama Rocky, nos vemos en el parque el domingo" },
  { l: "no", t: "Se busca administrativo/a para empresa financiera, enviar CV" },
];

export const THRESHOLDS = {
  /** De las consultas, cuántas tienen que entenderse (clara o "quizás"). */
  inquiryRecall: 0.97,
  /** De las consultas claras, cuántas tienen que salir como claras. */
  clearRecall: 0.9,
  /** De las no-consultas, cuántas tienen que descartarse. */
  noiseRejected: 0.95,
  /** De las consultas con los temas para una persona anotados, en cuántas el agente acierta exactamente cuáles son. */
  humanTopics: 0.95,
};

export type Outcome = "clear" | "unsure" | "ignored";

/** Corre el clasificador igual que la revisión real (con el catálogo de mentira), sin base de datos. */
export function classifySample(sample: Sample): { outcome: Outcome; category: string; confidence: number; reasons: string[]; humanTopics: string[] } {
  const subject = sample.s ?? "";
  const text = cleanBody(sample.t);
  const read = readRequest(subject, text, INDEX);
  const body = `${subject}\n${text}`;
  const named = (read.slots.propertyIds?.length ?? 0) > 0 || extractSlugs(body, ["sitio.example"]).length > 0;
  const search = searchSignal(read.slots, body);
  const r = classifyMail({ subject, text, hasPropertyRef: named, searchHits: false, portal: sample.portal, search });
  const inquiry = ["availability", "price", "features", "visit", "general"].includes(r.category);
  return { outcome: !inquiry ? "ignored" : r.uncertain ? "unsure" : "clear", category: r.category, confidence: r.confidence, reasons: r.reasons, humanTopics: r.humanTopics };
}

export function runCorpus() {
  const rows = CORPUS.map((s) => ({ s, ...classifySample(s) }));
  const inq = rows.filter((r) => r.s.l === "inq" || r.s.l === "clear");
  const clear = rows.filter((r) => r.s.l === "clear");
  const no = rows.filter((r) => r.s.l === "no");
  const inquiryOk = inq.filter((r) => r.outcome !== "ignored").length;
  const clearOk = clear.filter((r) => r.outcome === "clear").length;
  const noOk = no.filter((r) => r.outcome === "ignored").length;
  const withTopics = rows.filter((r) => r.s.h !== undefined && r.outcome !== "ignored");
  const topicsMiss = withTopics.filter((r) => [...r.humanTopics].sort().join("|") !== [...(r.s.h ?? [])].sort().join("|"));
  return {
    humanTopics: withTopics.length === 0 ? 1 : 1 - topicsMiss.length / withTopics.length,
    humanTopicsTotal: withTopics.length,
    humanTopicsMisses: topicsMiss,
    total: rows.length,
    inquiryRecall: inquiryOk / inq.length,
    clearRecall: clearOk / clear.length,
    noiseRejected: noOk / no.length,
    counts: { inq: inq.length, clear: clear.length, no: no.length, maybe: rows.filter((r) => r.s.l === "maybe").length },
    /** Lo que falló, para mostrarlo. */
    missedInquiries: inq.filter((r) => r.outcome === "ignored"),
    notClear: clear.filter((r) => r.outcome !== "clear"),
    falseAlarms: no.filter((r) => r.outcome !== "ignored"),
  };
}
