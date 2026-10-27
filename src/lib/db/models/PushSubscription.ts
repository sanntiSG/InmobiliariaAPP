import { Schema, models, model, type InferSchemaType, type Model } from "mongoose";

/**
 * Un dispositivo (navegador o app instalada) al que una persona con cuenta aceptó recibir avisos. El `endpoint` lo da el servicio
 * de push del navegador y es único: si otra persona inicia sesión en el mismo dispositivo, la suscripción pasa a ella. Un
 * dispositivo que deja de funcionar (error 404/410 del servicio) se borra solo; uno que falla varias veces seguidas se desactiva.
 */
const pushSubscriptionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    endpoint: { type: String, required: true, unique: true, maxlength: 600 },
    keys: {
      p256dh: { type: String, required: true, maxlength: 200 },
      auth: { type: String, required: true, maxlength: 100 },
    },
    /** Para mostrarle a la persona qué dispositivos tiene ("iPhone · Safari") y para depurar; nunca se usa para otra cosa. */
    device: { type: String, maxlength: 60 },
    failures: { type: Number, default: 0 },
    lastSuccessAt: { type: Date },
    lastFailureAt: { type: Date },
    /** Se desactivó por fallas repetidas: no se le envía más hasta que vuelva a suscribirse. */
    disabledAt: { type: Date },
  },
  { timestamps: true }
);

export type PushSubscriptionDoc = InferSchemaType<typeof pushSubscriptionSchema>;

export const PushSubscription: Model<PushSubscriptionDoc> = models.PushSubscription ?? model<PushSubscriptionDoc>("PushSubscription", pushSubscriptionSchema);
