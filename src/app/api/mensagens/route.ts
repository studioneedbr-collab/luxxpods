import { NextResponse } from "next/server";
import { getMensagens } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("c");
  if (!id) return NextResponse.json({ mensagens: [] });
  return NextResponse.json({ mensagens: await getMensagens(id) });
}
