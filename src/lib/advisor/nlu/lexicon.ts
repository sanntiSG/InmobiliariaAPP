/**
 * Léxico del asesor: cada CONCEPTO agrupa las formas en que se dice en la
 * calle ("visitas", "vistas", "tráfico", "cuánta gente entra"). Las preguntas
 * se reducen a conceptos y las intenciones se declaran sobre conceptos, no
 * sobre palabras sueltas → se entienden sinónimos y variaciones sin listar
 * cada frase posible.
 *
 * Sintaxis de cada entrada (siempre sin tildes y en minúscula):
 *  - `palabra` / `dos palabras`  → coincide por raíz (plural, género, conjugación).
 *  - `=palabra`                  → coincide sólo con esa forma exacta (evita que "mejorar" active "mejor").
 *  - `raiz*`                     → cualquier palabra que empiece con esa raíz.
 */
import { stem, tokenize } from "./normalize";
import { closestWord } from "./fuzzy";

export type Concept = string;

export const LEXICON: Record<Concept, string[]> = {
  // ─── Métricas ──────────────────────────────────────────────────────────────
  "m.views": [
    "visita", "vista", "visualizacion", "trafico", "vieron", "miraron", "visitante", "entran", "ingresan",
    "cuanta gente", "cuanta gente entra", "alcance", "vistazo",
  ],
  "m.inquiries": [
    "consulta", "consultaron", "consultar", "mensaje", "contacto", "contactaron", "interesado", "escribieron",
    "escriben", "whatsapp", "llamado", "llamada", "pedido de informacion", "preguntaron", "interesa",
  ],
  "m.saves": ["favorito", "guardado", "guardada", "guardaron", "guardan", "guardar", "fav", "guardados", "guardadas"],
  "m.likes": ["me gusta", "likes", "like", "corazon", "corazones"],
  "m.shares": ["compartido", "compartida", "compartir", "compartieron", "compartidas", "shares"],
  "m.tour": ["recorrido", "360", "tour", "virtual", "panoramica", "recorrer", "digital twin", "gemelo digital"],
  "m.dwell": ["permanencia", "tiempo promedio", "tiempo en la ficha", "cuanto tiempo", "duracion", "se quedan", "tiempo de lectura"],
  "m.comments": ["comentario", "comentaron"],
  "m.conversion": ["conversion", "convierten", "convierte", "tasa", "efectividad", "ratio", "convertir"],
  "m.interest": [
    "interes", "rendimiento", "desempeno", "resultado", "performance", "funciona", "funcionan", "funcionando",
    "rinde", "rinden", "rindiendo", "anda", "andan", "andando", "popularidad", "exito", "atencion", "movimiento",
    "actividad", "traccion",
  ],

  // ─── Dimensiones del negocio ───────────────────────────────────────────────
  "d.photos": ["foto", "fotografia", "imagen", "portada", "galeria", "calidad de las fotos", "fotografica"],
  "d.description": ["descripcion", "texto", "redaccion", "titulo", "titulos"],
  "d.video": ["video", "youtube", "reel", "short"],
  "d.price": ["precio", "valor", "costo", "cuesta", "tarifa", "importe", "cotizacion", "pretension"],
  "d.zone": ["zona", "barrio", "localidad", "ciudad", "partido", "lugar", "ubicacion", "area"],
  "d.type": ["tipo", "categoria", "clase de", "modalidad"],
  "d.area": ["superficie", "metros", "m2", "tamano", "metraje"],
  "d.rooms": ["ambiente", "amb", "dormitorio", "habitacion", "cuarto", "monoambiente", "dorm"],
  // Portada viva: la foto de portada que cambia de día a noche, con lluvia y viento. "portada" sola ya es de `d.photos`;
  // y NADA de "ambientada/ambientado" (su raíz es la de "ambiente", `d.rooms`): sólo la forma exacta "ambientacion".
  "d.ambient": [
    "portada viva", "portada animada", "portada reactiva", "portada dinamica", "portada interactiva", "portada con clima",
    "foto viva", "foto animada", "=ambientacion", "=ambientaciones", "dia y noche", "dia noche", "de dia y de noche",
    "estados del dia", "=lluvia", "=viento", "=clima", "atardecer",
  ],
  "d.property": ["propiedad", "inmueble", "publicacion", "aviso", "anuncio", "ficha", "unidad", "casa", "departamento", "depto", "dpto", "depa", "ph"],

  // ─── Verbos / intenciones ──────────────────────────────────────────────────
  "v.worst": [
    "peor", "=peores", "mal", "flojo", "debil", "bajo rendimiento", "no funciona", "no funcionan", "no rinde",
    "no rinden", "no anda", "no andan", "problema", "problematica", "decepcion", "rezagada", "rezagadas",
    "funciona mal", "funcionan mal", "rinde mal", "rinden mal", "anda mal", "andan mal", "van mal", "no vende",
  ],
  "v.best": [
    "=mejor", "=mejores", "destacada", "exito", "estrella", "top", "lider", "ganadora", "funciona bien",
    "funcionan bien", "rinde bien", "rinden bien", "anda bien", "andan bien", "van bien", "mas destacadas",
    "sobresale", "sobresalen", "campeona", "campeonas", "lo mejor",
  ],
  "v.compare": [
    "comparar", "compara", "comparame", "comparacion", "versus", "vs", "diferencia", "diferencias",
    "contra", "frente a", "en comparacion", "distinto", "distintas", "distinta", "difieren", "difiere",
    "se diferencian", "cual es mejor", "cual conviene",
  ],
  "v.change_vs": [
    "=cambio", "cambios", "evolucion", "evoluciono", "variacion", "vario", "crecio", "crecieron", "cayo",
    "cayeron", "=bajaron", "=subieron", "aumento", "disminuyo", "novedades", "novedad", "que paso", "que hay de nuevo",
    "respecto", "comparado con", "en relacion", "tendencia",
  ],
  "v.i_changed": [
    "=cambie", "=modifique", "=edite", "=actualice", "=toque", "=hice", "=hicimos", "=cambiamos", "=modificamos",
    "=editamos", "=actualizamos", "=cargue", "=cargamos", "=agregue", "=agregamos", "=quite", "=quitamos",
    "=elimine", "=publique", "=publicamos", "=despublique", "=retoque", "=sume", "=sumamos", "=reemplace",
    "=reorganice", "=movi", "=pause", "=pausamos",
  ],
  "v.activity": [
    "historial", "bitacora", "registro", "actividad reciente", "ultimos cambios", "mis cambios", "que toque",
    "que modifique", "que edite", "movimientos", "linea de tiempo", "cronologia", "ediciones",
  ],
  "v.why": [
    "por que", "motivo", "razon", "causa", "explica", "explicame", "explicar", "investig*", "a que se debe",
    "como es que", "por que razon", "que pasa con", "que le pasa", "que les pasa", "analiza", "analizar", "analisis",
    "descubrir", "averiguar", "profundiza", "profundizar", "detalle", "detalles",
  ],
  "v.recommend": [
    "recomend*", "suger*", "aconsej*", "consej*", "que hago", "que puedo hacer", "que deberia", "que conviene",
    "conviene", "acciones", "accion", "=mejorar", "=mejorarlas", "=mejorarla", "=mejoro", "=mejoraria",
    "que mejorar", "como mejorar", "como mejoro", "como hacer para", "que haria", "tips", "idea", "ideas",
    "estrategia", "que me conviene", "pasos", "proximos pasos", "que tengo que hacer", "que debo hacer",
    "como hago para", "como puedo", "como consigo", "como conseguir", "como logro", "como lograr", "vender mas",
    "como vendo", "como vender", "que aconsejas", "que me aconsejas", "que sugerís", "que sugeris",
  ],
  // Pedir una opinión o una descripción de UNA propiedad ("contame de esta", "me conviene", "me la recomendás").
  "v.opinion": [
    "contame de", "contame sobre", "contame acerca", "hablame de", "hablame sobre", "describ*", "que tal es", "que tal esta",
    "como es esta", "como es la", "como es el", "que opinas", "que te parece", "que sabes de", "que me contas",
    "me conviene", "me convendria", "me la recomendas", "me lo recomendas", "la recomendas", "lo recomendas",
    "vale la pena", "me sirve", "es para mi", "me va a gustar", "esta bien esta", "esta bueno", "esta buena",
  ],
  "v.simulate": [
    "simular", "simula", "simulacion", "escenario", "supongamos", "suponete", "hipotetico", "hipotetica",
    "que pasaria", "que pasa si", "y si", "si baj*", "si reduj*", "si rebaj*", "si sub*", "si aument*", "probando",
    "que efecto", "cuanto impacto", "impactaria", "que ocurriria", "como afectaria", "afectaria", "que tal si",
  ],
  "v.promote": [
    "promocion*", "promover", "promocionar", "impulsar", "destacar", "publicidad", "anunciar", "difundir",
    "empujar", "pautar", "visibilidad", "priorizar", "apostar", "potenciar", "sponsor", "patrocinar", "redes",
  ],
  "v.incomplete": [
    "incompleta", "incompleto", "falta", "faltan", "faltantes", "completar", "borrador", "sin terminar", "a medias",
    "vacio", "vacia", "datos faltantes", "sin completar", "mal cargada", "mal cargadas", "pobre", "pobres", "pelada", "peladas",
  ],
  "v.review": [
    "revisar", "revision", "primero", "prioridad", "prioritario", "urgente", "atender", "ver primero",
    "empezar", "arrancar", "por donde", "por cual", "ocuparme", "tocar primero", "necesita", "necesitan",
    "requiere", "requieren", "hace falta", "hacen falta",
  ],
  "t.since": ["desde que", "a partir de", "despues de", "luego de", "tras", "desde el cambio", "desde entonces"],
  "v.effect": [
    "funciono", "sirvio", "dio resultado", "tuvo efecto", "impacto", "efecto", "repercutio", "influyo", "sirvieron",
    "funcionaron", "resulto", "valio la pena",
  ],
  "v.stale": [
    "sin consultas", "sin interes", "sin movimiento", "llevan tiempo", "hace mucho", "hace tiempo", "estancada",
    "dormidas", "dormida", "paradas", "frias", "nadie consulta", "nadie pregunta", "sin actividad", "olvidadas",
    "abandonadas", "muertas", "sin novedades",
  ],
  "v.leads": [
    "cliente", "seguimiento", "leads", "lead", "embudo", "funnel", "contactar", "recontactar", "prospecto", "prospectos",
    "sin responder", "sin contestar", "pendientes de respuesta", "visitas pedidas", "oferta", "ofertas",
  ],
  "v.status": [
    "como va", "como van", "como me va", "como me van", "como me esta yendo", "como nos va", "como esta", "como estan", "como le fue", "como les fue", "como viene", "como vienen",
    "como esta funcionando", "como esta andando", "estado de", "que tal va", "como anda", "como andan",
  ],
  "v.overview": [
    "resumen", "panorama", "como estoy", "como vengo", "como me fue", "como nos fue", "como va todo",
    "balance", "reporte", "informe", "estado general", "que tal", "como andamos", "como estamos", "novedades generales",
    "foto general", "vision general", "panorama general", "resumime", "dashboard", "tablero",
  ],
  "v.help": [
    "ayuda", "ayudame", "que podes", "que puedes", "que sabes", "que haces", "para que servis", "para que sirves",
    "como funcionas", "que me ofreces", "que preguntas", "opciones", "comandos", "como te uso", "que sabes hacer",
    "que podes hacer", "en que me ayudas", "en que podes ayudarme", "instrucciones", "que cosas",
  ],
  "v.count": ["cuantas", "cuantos", "cuanta", "cuanto", "cantidad", "total", "numero de", "suma de", "tuve", "recibi", "recibimos", "tuvimos", "acumule", "llevo"],
  "v.greeting": ["hola", "buenas", "buen dia", "buenos dias", "buenas tardes", "buenas noches", "hey", "ey", "holis", "saludos"],
  "v.thanks": ["gracias", "genial", "perfecto", "excelente", "buenisimo", "barbaro", "joya", "dale", "listo", "ok", "okey", "bien", "mil gracias"],
  "v.show": [
    "mostrame", "muestrame", "mostrar", "muestra", "dame", "decime", "pasame", "quiero ver", "quiero", "necesito",
    "busco", "buscando", "buscar", "tenes", "tienen", "hay", "listame", "listar", "lista", "ver", "mostra",
    "armame", "armar", "encontrame", "encontra", "recomendame", "sugeri", "sugerime",
  ],
  "v.drop": ["baj*", "rebaj*", "reduc*", "reduj*", "descuent*", "disminu*", "recort*", "abarat*"],
  "v.raise": ["=subir", "=subiera", "=suba", "=subo", "=aumentar", "=aumente", "=aumentara", "=aumentaria", "=incrementar", "=incremento", "=encarecer"],
  "v.new": ["nueva", "nuevo", "reciente", "recien", "ultimas", "ultimos", "recien publicada", "recien publicadas", "estreno", "a estrenar", "novedad"],
  "v.popular": [
    "populares", "popular", "mas buscadas", "mas buscados", "tendencia", "tendencias", "trending", "en alza",
    "de moda", "mas pedidas", "mas vistas", "mas vistos", "mas visitadas", "mas guardadas", "mas queridas", "favoritas",
    "las mas", "los mas", "lo mas",
  ],
  "v.cheap": ["barata", "barato", "economica", "economico", "accesible", "bajo costo", "precio bajo", "mas barata", "gangas", "ganga", "oportunidad de precio", "conveniente", "chequear precio"],
  "v.agencies": ["inmobiliaria", "agencia", "quien vende", "quienes venden", "quien publica", "quienes publican", "vendedor", "vendedores", "corredor", "corredores"],
  "v.opportunities": ["oportunidad", "que me estoy perdiendo", "pendientes", "aprovechar", "sin aprovechar", "potencial", "desaprovechando", "perdiendo", "que falta hacer"],
  "v.fair_price": ["esta bien de precio", "precio justo", "precio razonable", "sobrevaluada", "sobrevaluado", "barata para", "cara para", "esta cara", "esta barata", "vale lo que cuesta", "precio de mercado", "tasar", "tasacion", "cuanto vale"],
  "v.typical": ["tipico", "promedio", "normal", "habitual", "mediana", "en promedio", "cuanto cuesta", "cuanto salen", "cuanto sale", "cuanto vale", "rango de precios", "precio medio", "precios", "cuanto cuestan"],
  "v.search": ["busco", "buscando", "necesito", "quiero", "quisiera", "me interesa", "estoy buscando", "mostrame", "muestrame", "tenes", "hay", "alguna", "alguno", "algun", "armame", "encontrame"],
  "v.similar": ["similar", "similares", "parecido", "parecidos", "parecidas", "mismo precio", "precios similares", "misma gama", "equivalente", "equivalentes", "iguales"],
  "v.traits": ["caracteristica", "rasgo", "rasgos", "perfil", "tienen en comun", "en comun", "que tienen", "como son", "cualidades", "atributos", "que las hace", "que lo hace"],

  // ─── Cantidades / polaridad ────────────────────────────────────────────────
  "q.more": ["mas", "mucho", "mucha", "muchas", "muchos", "mayor", "mayores", "alto", "alta", "altos", "altas", "maximo", "bastante", "demasiado", "tanto", "tanta"],
  "q.less": ["menos", "poco", "poca", "pocas", "pocos", "menor", "menores", "minimo", "escaso", "escasa", "=bajo", "=baja", "=bajos", "=bajas", "casi nada", "ninguna", "ninguno", "cero", "nada", "sin"],
  "q.but": ["pero", "aunque", "sin embargo", "y sin embargo", "no obstante", "a pesar", "a pesar de"],
  "q.neg": ["no", "nunca", "ningun", "ninguna", "ninguno", "tampoco"],

  // ─── Tiempo ────────────────────────────────────────────────────────────────
  "t.today": ["hoy", "hoy dia", "en el dia"],
  "t.yesterday": ["ayer"],
  "t.week": ["semana", "semanal", "7 dias", "siete dias", "ultima semana", "esta semana", "semanalmente"],
  "t.month": ["mes", "mensual", "30 dias", "ultimo mes", "este mes", "mensualmente", "treinta dias", "ultimos 30"],
  "t.prev": ["pasado", "pasada", "anterior", "previo", "previa", "antes", "atras", "hace un mes", "hace una semana"],

  // ─── Referencias a lo conversado ───────────────────────────────────────────
  "ctx.this": ["=esta", "=este", "=esto", "=esa", "=ese", "=eso", "la misma", "el mismo", "dicha", "dicho", "aquella", "aquel"],
  "ctx.those": ["=estas", "=estos", "=esas", "=esos", "las mismas", "los mismos", "ellas", "ellos", "aquellas", "aquellos"],

  // ─── Operación y tipos (entidades, también sirven para señales) ────────────
  "e.venta": ["venta", "vender", "venden", "comprar", "compra", "comprarla", "adquirir"],
  "e.alquiler": ["alquiler", "alquilar", "alquilo", "alquilan", "rentar", "renta", "arrendar", "alquileres"],
  "e.temporal": ["temporal", "temporario", "temporada", "turistico", "vacaciones"],
  "e.casa": ["casa", "chalet", "casona"],
  "e.departamento": ["departamento", "depto", "dpto", "depa", "monoambiente", "loft", "piso"],
  "e.duplex": ["duplex", "dúplex"],
  "e.ph": ["ph", "p h", "propiedad horizontal"],
  "e.terreno": ["terreno", "lote", "loteo", "parcela"],
  "e.local": ["local", "comercial", "negocio", "fondo de comercio"],
  "e.oficina": ["oficina", "despacho", "coworking"],
  "e.galpon": ["galpon", "deposito", "nave"],
  "e.quinta": ["quinta", "chacra", "campo", "country", "barrio cerrado", "barrio privado"],
};

// ─── Índices (se arman una vez al cargar el módulo) ──────────────────────────

const PHRASES = new Map<string, Concept[]>();
const EXACT = new Map<string, Concept[]>();
const PREFIXES: { prefix: string; concept: Concept }[] = [];
const SINGLE_STEMS = new Map<string, Concept[]>();

function push<K, V>(map: Map<K, V[]>, key: K, value: V) {
  const list = map.get(key);
  if (list) {
    if (!list.includes(value)) list.push(value);
  } else {
    map.set(key, [value]);
  }
}

for (const [concept, entries] of Object.entries(LEXICON)) {
  for (const entry of entries) {
    if (entry.startsWith("=")) {
      push(EXACT, entry.slice(1), concept);
    } else if (entry.endsWith("*")) {
      PREFIXES.push({ prefix: entry.slice(0, -1), concept });
    } else {
      const tokens = tokenize(entry).map(stem);
      const key = tokens.join(" ");
      push(PHRASES, key, concept);
      if (tokens.length === 1) push(SINGLE_STEMS, tokens[0]!, concept);
    }
  }
}

const SINGLE_VOCAB = [...SINGLE_STEMS.keys()].filter((s) => s.length >= 5);
const MAX_PHRASE = 5;

/** Posiciones (índice del primer token) donde se detectó cada concepto. */
export type Detected = Map<Concept, number[]>;

function add(out: Detected, concept: Concept, index: number) {
  const list = out.get(concept);
  if (list) {
    if (!list.includes(index)) list.push(index);
  } else {
    out.set(concept, [index]);
  }
}

/**
 * Detecta conceptos en una lista de tokens normalizados: frases por raíz, formas
 * exactas, prefijos y, como último recurso, la palabra más parecida del
 * vocabulario (errores de tipeo: "consutlas" → consulta).
 */
export function detectConcepts(tokens: string[]): Detected {
  const out: Detected = new Map();
  const stemmed = tokens.map(stem);

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    const isNumber = /\d/.test(token);

    for (const concept of EXACT.get(token) ?? []) add(out, concept, i);
    if (!isNumber) {
      for (const { prefix, concept } of PREFIXES) {
        if (token.length >= prefix.length && token.startsWith(prefix)) add(out, concept, i);
      }
    }

    let matchedSingle = false;
    for (let n = 1; n <= MAX_PHRASE && i + n <= tokens.length; n++) {
      const entries = PHRASES.get(stemmed.slice(i, i + n).join(" "));
      if (!entries) continue;
      for (const concept of entries) add(out, concept, i);
      if (n === 1) matchedSingle = true;
    }

    // Typos: sólo palabras largas que no coincidieron con nada.
    if (!matchedSingle && !isNumber && stemmed[i]!.length >= 5 && !EXACT.has(token)) {
      const near = closestWord(stemmed[i]!, SINGLE_VOCAB);
      if (near) for (const concept of SINGLE_STEMS.get(near) ?? []) add(out, concept, i);
    }
  }
  return out;
}

export const has = (d: Detected, ...concepts: Concept[]): boolean => concepts.some((c) => d.has(c));

/** ¿Hay un concepto de `a` a no más de `within` tokens de uno de `b`? (en cualquier orden) */
export function near(d: Detected, a: Concept[], b: Concept[], within = 3): boolean {
  const pa = a.flatMap((c) => d.get(c) ?? []);
  const pb = b.flatMap((c) => d.get(c) ?? []);
  return pa.some((x) => pb.some((y) => x !== y && Math.abs(x - y) <= within));
}
