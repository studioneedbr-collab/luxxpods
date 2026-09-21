import { NextResponse } from "next/server";
import { getConversas } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ conversas: await getConversas() });
}
