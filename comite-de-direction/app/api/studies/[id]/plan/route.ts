import { NextResponse } from "next/server";
import { z } from "zod";
import { savePlan } from "@/lib/store/studies";
import type { PlanBlock } from "@/lib/pptx/plan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PlanBlockSchema = z.object({
  key: z.string(),
  label: z.string(),
  metier: z.string().nullable(),
  group: z.string(),
  enabled: z.boolean(),
  order: z.number().int().positive(),
});

const Body = z.object({
  plan: z.array(PlanBlockSchema).min(1),
});

export async function PUT(
  request: Request,
  { params }: { params: { id: string } },
) {
  const parsed = Body.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Plan invalide", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const study = await savePlan(params.id, parsed.data.plan as PlanBlock[]);
    return NextResponse.json({ study });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    return NextResponse.json(
      { error: "Échec de la sauvegarde du plan", details: message },
      { status: 500 },
    );
  }
}
