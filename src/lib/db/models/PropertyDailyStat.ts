import { Schema, models, model, type InferSchemaType, type Model } from "mongoose";

/**
 * Rollup diario por propiedad. Se actualiza con `$inc` + upsert cada vez que
 * ocurre un evento (ver `lib/tracking/record.ts`), así dashboards y la
 * inteligencia de datos leen O(propiedades × días) filas en lugar de escanear
 * el log `Interaction`, que crece sin techo.
 *
 * `day` es la medianoche (hora Argentina) del día del evento, guardada como
 * un Date en UTC.
 */
const propertyDailyStatSchema = new Schema({
  propertyId: { type: Schema.Types.ObjectId, ref: "Property", required: true },
  agencyId: { type: Schema.Types.ObjectId, ref: "Agency", required: true },
  day: { type: Date, required: true },

  views: { type: Number, default: 0 },
  uniqueViews: { type: Number, default: 0 },
  likes: { type: Number, default: 0 },
  saves: { type: Number, default: 0 },
  comments: { type: Number, default: 0 },
  shares: { type: Number, default: 0 },
  contacts: { type: Number, default: 0 },
  inquiries: { type: Number, default: 0 },
  tourOpens: { type: Number, default: 0 },
  /** Suma de milisegundos de permanencia y cantidad de muestras (promedio = total / muestras). */
  dwellMsTotal: { type: Number, default: 0 },
  dwellSamples: { type: Number, default: 0 },
  /** Visitas por escena del recorrido 360°: { [sceneId]: cantidad }. */
  scenes: { type: Schema.Types.Mixed, default: {} },
});

propertyDailyStatSchema.index({ propertyId: 1, day: 1 }, { unique: true });
propertyDailyStatSchema.index({ agencyId: 1, day: 1 });
propertyDailyStatSchema.index({ day: 1 });

export type PropertyDailyStatDoc = InferSchemaType<typeof propertyDailyStatSchema>;

export const PropertyDailyStat: Model<PropertyDailyStatDoc> =
  models.PropertyDailyStat ?? model<PropertyDailyStatDoc>("PropertyDailyStat", propertyDailyStatSchema);
