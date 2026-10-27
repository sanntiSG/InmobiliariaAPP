import { PERIOD_SUFFIX, type PricePeriod } from "@/config/pricing";
import { formatPrice } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

export function PriceTag({
  amount,
  currency,
  period,
  className,
}: {
  amount: number;
  currency: string;
  period?: PricePeriod;
  className?: string;
}) {
  return (
    <p className={cn("font-display text-xl font-bold tabular-nums text-text", className)}>
      {formatPrice(amount, currency)}
      {period && PERIOD_SUFFIX[period] && <span className="text-sm font-medium text-text-muted"> {PERIOD_SUFFIX[period]}</span>}
    </p>
  );
}
