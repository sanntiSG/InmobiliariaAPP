import { NextRequest, NextResponse } from "next/server";
import type { z } from "zod";
import { connectDB } from "@/lib/db/connect";
import { Property } from "@/lib/db/models/Property";
import { listFiltersSchema } from "@/lib/validation/filters";
import { buildPropertyQuery, PROPERTY_CARD_PROJECTION } from "@/lib/db/property-query";
import { toPropertyCardData } from "@/lib/db/property-card-mapper";

export const dynamic = "force-dynamic";

const SORTS: Record<string, Record<string, 1 | -1>> = {
  recientes: { publishedAt: -1 },
  precio_asc: { "price.amount": 1 },
  precio_desc: { "price.amount": -1 },
};

export async function GET(req: NextRequest) {
  const searchParams = Object.fromEntries(req.nextUrl.searchParams.entries());
  const parsed = listFiltersSchema.safeParse(searchParams);

  if (!parsed.success) {
    return NextResponse.json({ error: "Parámetros inválidos", issues: parsed.error.issues }, { status: 400 });
  }
  const filters = parsed.data;

  try {
    return await getListing(filters);
  } catch (err) {
    console.error("GET /api/properties failed:", err);
    return NextResponse.json(
      { error: "No se pudo conectar a la base de datos. Ver SETUP.md.", items: [], total: 0 },
      { status: 503 }
    );
  }
}

async function getListing(filters: z.infer<typeof listFiltersSchema>) {
  await connectDB();

  const query = buildPropertyQuery(filters);
  const skip = (filters.page - 1) * filters.pageSize;

  const [docs, total] = await Promise.all([
    Property.find(query)
      .select(PROPERTY_CARD_PROJECTION)
      .populate({ path: "agencyId", select: "name" })
      .sort(SORTS[filters.sort])
      .skip(skip)
      .limit(filters.pageSize)
      .lean(),
    Property.countDocuments(query),
  ]);

  const now = Date.now();
  const items = docs.map((doc) => toPropertyCardData(doc, now));

  return NextResponse.json(
    { items, total, page: filters.page, pageSize: filters.pageSize },
    { headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=60" } }
  );
}
