import type { ExplorerIntent } from "../../types";
import type { Handler } from "../types";
import { aboutProperty } from "./about";
import { agencies, compare, newest, popular, priceCheck, priceDrops, priceTypical, recommend, search, withAmbient, withTour } from "./handlers";

/** Un handler por intención del explorador. */
export const EXPLORER_HANDLERS: Record<ExplorerIntent, Handler> = {
  "explorer.search": search,
  "explorer.recommend": recommend,
  "explorer.price_drops": priceDrops,
  "explorer.price_typical": priceTypical,
  "explorer.compare": compare,
  "explorer.price_check": priceCheck,
  "explorer.with_tour": withTour,
  "explorer.with_ambient": withAmbient,
  "explorer.new": newest,
  "explorer.popular": popular,
  "explorer.agencies": agencies,
  "explorer.about_property": aboutProperty,
};
