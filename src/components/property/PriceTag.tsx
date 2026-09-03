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
  period?: "total" | "mensual";
  className?: string;
}) {
  return (
    <p className={cn("font-display text-xl font-bold tabular-nums text-text", className)}>
      {formatPrice(amount, currency)}
      {period === "mensual" && <span className="text-sm font-medium text-text-muted"> /mes</span>}
    </p>
  );
}
