import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db/connect";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await connectDB();
    return NextResponse.json({ ok: true, db: "connected" });
  } catch (err) {
    return NextResponse.json(
      { ok: false, db: "disconnected", error: err instanceof Error ? err.message : String(err) },
      { status: 503 }
    );
  }
}
