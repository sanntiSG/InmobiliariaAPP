import type { AgencyIntent } from "../../types";
import type { AgencyHandler } from "../types";
import { compareZones, similarPrice, traits, typeInterest } from "./comparison";
import { actions, incomplete, opportunities, photos, promote, staleInquiries } from "./improve";
import {
  best,
  changesVsPrevious,
  investigate,
  metric,
  overview,
  reviewFirst,
  viewsNoInquiries,
  worst,
} from "./performance";
import { activity, changeImpact, leads, propertyStatus, simulatePrice } from "./scenarios";

/** Un handler por intención de inmobiliaria. Agregar una intención = una entrada acá + su definición en `nlu/intents.ts`. */
export const AGENCY_HANDLERS: Record<AgencyIntent, AgencyHandler> = {
  "agency.overview": overview,
  "agency.metric": metric,
  "agency.worst": worst,
  "agency.best": best,
  "agency.views_no_inquiries": viewsNoInquiries,
  "agency.investigate": investigate,
  "agency.changes_vs_previous": changesVsPrevious,
  "agency.review_first": reviewFirst,
  "agency.compare_zones": compareZones,
  "agency.type_interest": typeInterest,
  "agency.traits": traits,
  "agency.actions": actions,
  "agency.photos": photos,
  "agency.incomplete": incomplete,
  "agency.stale_inquiries": staleInquiries,
  "agency.opportunities": opportunities,
  "agency.simulate_price": simulatePrice,
  "agency.similar_price": similarPrice,
  "agency.promote": promote,
  "agency.activity": activity,
  "agency.change_impact": changeImpact,
  "agency.property_status": propertyStatus,
  "agency.leads": leads,
};
