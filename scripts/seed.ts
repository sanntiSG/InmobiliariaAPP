/**
 * Seed de datos demo: ~4 inmobiliarias + ~40 propiedades repartidas por
 * CABA/AMBA, con coordenadas reales, para poder ver el mapa poblado sin
 * cargar nada a mano. Ejecutar con `npm run seed` (ver SETUP.md).
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { Agency } from "../src/lib/db/models/Agency";
import { User } from "../src/lib/db/models/User";
import { Property } from "../src/lib/db/models/Property";
import { Interaction } from "../src/lib/db/models/Interaction";
import { slugify } from "../src/lib/utils/slugify";
import { AMENITIES, type PropertyType } from "../src/config/filters";

const UNSPLASH_IDS = [
  "1600585154340-be6161a56a0c",
  "1600596542815-ffad4c1539a9",
  "1600607687939-ce8a6c25118c",
  "1600210492486-724fe5c67fb0",
  "1600121848594-d8644e57abab",
  "1600566753086-00f18fb6b3ea",
  "1600047509807-ba8f99d2cdde",
  "1600489000022-c2086d79f9d4",
  "1512917774080-9991f1c4c750",
  "1493809842364-78817add7ffb",
  "1502672260266-1c1ef2d93688",
  "1560448204-e02f11c3d0e2",
  "1570129477492-45c003edd2be",
  "1568605114967-8130f3a36994",
  "1583608205776-bfd35f0d9f83",
  "1524758631624-e2822e304c36",
  "1522708323590-d24dbb6b0267",
  "1592595896616-c37162298647",
  "1600585152220-90363fe7e115",
  "1600607687920-4e2a09cf159d",
];

function imageUrl(id: string) {
  return `https://images.unsplash.com/photo-${id}?w=1200&q=80&auto=format&fit=crop`;
}

const NEIGHBORHOODS: { name: string; city: string; lng: number; lat: number }[] = [
  { name: "Palermo", city: "CABA", lng: -58.4233, lat: -34.5875 },
  { name: "Recoleta", city: "CABA", lng: -58.3931, lat: -34.5875 },
  { name: "Belgrano", city: "CABA", lng: -58.4562, lat: -34.5627 },
  { name: "Caballito", city: "CABA", lng: -58.4392, lat: -34.6187 },
  { name: "Villa Urquiza", city: "CABA", lng: -58.4886, lat: -34.5745 },
  { name: "Núñez", city: "CABA", lng: -58.4638, lat: -34.5443 },
  { name: "San Telmo", city: "CABA", lng: -58.3712, lat: -34.6212 },
  { name: "Puerto Madero", city: "CABA", lng: -58.3633, lat: -34.6083 },
  { name: "Almagro", city: "CABA", lng: -58.4197, lat: -34.6086 },
  { name: "Colegiales", city: "CABA", lng: -58.4508, lat: -34.5747 },
  { name: "Villa Devoto", city: "CABA", lng: -58.5124, lat: -34.6011 },
  { name: "Flores", city: "CABA", lng: -58.4633, lat: -34.6288 },
  { name: "Vicente López", city: "Vicente López", lng: -58.4772, lat: -34.5267 },
  { name: "San Isidro", city: "San Isidro", lng: -58.5257, lat: -34.4708 },
  { name: "Tigre", city: "Tigre", lng: -58.5796, lat: -34.4264 },
  { name: "La Plata", city: "La Plata", lng: -57.9544, lat: -34.9215 },
];

const AGENCY_SEEDS = [
  { name: "Umbral Norte Propiedades", whatsapp: "5491122334455" },
  { name: "Sur Urbano Inmobiliaria", whatsapp: "5491133445566" },
  { name: "Río Bienes Raíces", whatsapp: "5491144556677" },
  { name: "Casa Abierta Propiedades", whatsapp: "5491155667788" },
];

const TYPE_WEIGHTS: [PropertyType, number][] = [
  ["departamento", 5],
  ["casa", 3],
  ["ph", 2],
  ["oficina", 1],
  ["local", 1],
  ["terreno", 1],
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
function pickWeighted<T extends string>(pairs: [T, number][]): T {
  const total = pairs.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [value, weight] of pairs) {
    if ((r -= weight) <= 0) return value;
  }
  return pairs[0][0];
}
function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function jitter(deg: number) {
  return (Math.random() - 0.5) * deg;
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("Falta MONGODB_URI en .env.local — ver SETUP.md.");
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log("Conectado a MongoDB. Limpiando datos demo previos...");
  await Promise.all([
    Agency.deleteMany({}),
    User.deleteMany({}),
    Property.deleteMany({}),
    Interaction.deleteMany({}),
  ]);

  const passwordHash = await bcrypt.hash("Umbral2026!", 10);

  const agencies = [];
  for (const seed of AGENCY_SEEDS) {
    const office = pick(NEIGHBORHOODS);
    const agency = await Agency.create({
      slug: slugify(seed.name),
      name: seed.name,
      description: `${seed.name} — inmobiliaria asociada a Umbral en ${office.city}.`,
      contact: { whatsapp: seed.whatsapp, phone: seed.whatsapp, email: `contacto@${slugify(seed.name)}.com.ar` },
      address: { city: office.city, province: "Buenos Aires", country: "Argentina" },
      location: { type: "Point", coordinates: [office.lng + jitter(0.02), office.lat + jitter(0.02)] },
      status: "active",
    });

    const owner = await User.create({
      name: `Admin ${seed.name}`,
      email: `admin@${slugify(seed.name)}.com.ar`,
      passwordHash,
      role: "agency_owner",
      agencyId: agency._id,
    });
    agency.owners = [owner._id];
    await agency.save();

    agencies.push(agency);
  }

  console.log(`${agencies.length} inmobiliarias creadas. Generando propiedades...`);

  const PROPERTIES_TOTAL = 42;
  let created = 0;

  for (let i = 0; i < PROPERTIES_TOTAL; i++) {
    const agency = pick(agencies);
    const neighborhood = pick(NEIGHBORHOODS);
    const type = pickWeighted(TYPE_WEIGHTS);
    const operation = Math.random() < 0.55 ? "venta" : "alquiler";
    const isLand = type === "terreno";
    const isCommercial = type === "oficina" || type === "local";

    const bedrooms = isLand ? undefined : isCommercial ? undefined : randInt(1, 4);
    const bathrooms = isLand ? undefined : randInt(1, Math.max(1, (bedrooms ?? 2) - 1) + 1);
    const rooms = isLand ? undefined : (bedrooms ?? 1) + 1;
    const coveredArea = isLand ? undefined : randInt(35, 220);
    const totalArea = isLand ? randInt(200, 900) : coveredArea! + randInt(0, 40);

    const amount =
      operation === "venta"
        ? randInt(60, 420) * 1000
        : randInt(120, 850) * 1000;
    const currency = operation === "venta" ? "USD" : "ARS";

    const imageCount = randInt(3, 6);
    const shuffled = [...UNSPLASH_IDS].sort(() => Math.random() - 0.5).slice(0, imageCount);

    const hasTour = Math.random() < 0.3;
    const publishedDaysAgo = randInt(0, 60);

    const title = `${typeLabel(type)} en ${operation === "venta" ? "venta" : "alquiler"} en ${neighborhood.name}`;

    await Property.create({
      agencyId: agency._id,
      slug: `${slugify(title)}-${Date.now().toString(36)}${i}`,
      title,
      description:
        `${typeLabel(type)} luminoso en ${neighborhood.name}, ${neighborhood.city}. ` +
        `Excelente ubicación, cerca de transporte público y comercios.`,
      operation,
      type,
      status: "published",
      price: { amount, currency, expenses: isLand ? 0 : randInt(0, 8) * 5000, period: operation === "alquiler" ? "mensual" : "total" },
      priceHistory: [{ amount, currency, changedAt: new Date() }],
      address: {
        neighborhood: neighborhood.name,
        city: neighborhood.city,
        province: "Buenos Aires",
        country: "Argentina",
        showExact: Math.random() < 0.85,
      },
      location: {
        type: "Point",
        coordinates: [neighborhood.lng + jitter(0.03), neighborhood.lat + jitter(0.03)],
      },
      features: { rooms, bedrooms, bathrooms, garages: randInt(0, 1), coveredArea, totalArea, age: isLand ? undefined : randInt(0, 40) },
      amenities: [...AMENITIES].sort(() => Math.random() - 0.5).slice(0, randInt(1, 5)),
      media: {
        images: shuffled.map((id, idx) => ({ url: imageUrl(id), alt: title, order: idx })),
        videos: [],
        floorPlans: [],
        tour3d: hasTour
          ? {
              enabled: true,
              provider: "matterport",
              modelId: `demo-${i}`,
              embedUrl: "https://my.matterport.com/show/?m=SxQL3iGyvS0",
              thumbnail: imageUrl(shuffled[0]),
            }
          : { enabled: false },
      },
      stats: {
        views: randInt(0, 400),
        likes: randInt(0, 60),
        saves: randInt(0, 40),
        comments: randInt(0, 15),
        ratingAvg: Number((3.5 + Math.random() * 1.5).toFixed(1)),
        ratingCount: randInt(0, 20),
      },
      publishedAt: new Date(Date.now() - publishedDaysAgo * 86_400_000),
    });

    created++;
    if (created % 10 === 0) console.log(`  ${created}/${PROPERTIES_TOTAL} propiedades creadas...`);
  }

  for (const agency of agencies) {
    const count = await Property.countDocuments({ agencyId: agency._id });
    agency.stats!.propertiesCount = count;
    await agency.save();
  }

  console.log(`Listo: ${agencies.length} inmobiliarias, ${created} propiedades.`);
  console.log(`Login demo (cuando exista auth): admin@<slug-inmobiliaria>.com.ar / Umbral2026!`);
  await mongoose.disconnect();
}

function typeLabel(type: string) {
  const labels: Record<string, string> = {
    casa: "Casa",
    departamento: "Departamento",
    ph: "PH",
    terreno: "Terreno",
    local: "Local",
    oficina: "Oficina",
    galpon: "Galpón",
    quinta: "Quinta",
  };
  return labels[type] ?? type;
}

main().catch((err) => {
  console.error("Error en el seed:", err);
  process.exit(1);
});
