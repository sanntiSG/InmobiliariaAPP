import mongoose from "mongoose";
// Side-effect: registra TODOS los modelos apenas se toca la DB. Sin esto,
// Mongoose resuelve los `ref` de .populate() contra su registro global en
// tiempo de ejecución — si la primera ruta en tocar la DB en un proceso
// nunca importó, p.ej., Agency.ts, .populate("agencyId") tira
// MissingSchemaError. Ver plan de sesión: bug del mapa/detalle vacío.
import "./models";

const MONGODB_URI = process.env.MONGODB_URI;

/**
 * Cache de conexión en `globalThis`, imprescindible en entornos serverless
 * (Next.js route handlers) para no abrir una conexión nueva por request.
 */
type MongooseCache = {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
};

declare global {
  var __mongooseCache: MongooseCache | undefined;
}

const cache: MongooseCache = globalThis.__mongooseCache ?? { conn: null, promise: null };
globalThis.__mongooseCache = cache;

export async function connectDB(): Promise<typeof mongoose> {
  if (cache.conn) return cache.conn;

  if (!MONGODB_URI) {
    throw new Error(
      "Falta MONGODB_URI. Copiá .env.example a .env.local y completá la conexión de MongoDB Atlas (ver SETUP.md)."
    );
  }

  if (!cache.promise) {
    cache.promise = mongoose.connect(MONGODB_URI, {
      bufferCommands: false,
      maxPoolSize: 10,
    });
  }

  try {
    cache.conn = await cache.promise;
  } catch (err) {
    cache.promise = null;
    throw err;
  }

  return cache.conn;
}
