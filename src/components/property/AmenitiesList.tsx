import { AMENITY_LABELS, type Amenity } from "@/config/filters";

export function AmenitiesList({ amenities }: { amenities: string[] }) {
  if (amenities.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {amenities.map((a) => (
        <span key={a} className="rounded-pill bg-surface-2 px-3 py-1.5 text-sm text-text">
          {AMENITY_LABELS[a as Amenity] ?? a}
        </span>
      ))}
    </div>
  );
}
