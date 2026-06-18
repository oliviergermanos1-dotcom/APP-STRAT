import { NextResponse } from "next/server";
import { z } from "zod";
import { createStudy, listStudies } from "@/lib/store/studies";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CreateBody = z.object({
  title: z.string().min(1),
  periodStart: z.string(),
  periodEnd: z.string(),
  metiers: z.array(z.string()).min(1),
});

export async function GET() {
  const studies = await listStudies();
  return NextResponse.json({ studies });
}

export async function POST(request: Request) {
  let body: unknown;
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    body = await request.json();
  } else {
    const form = await request.formData();
    body = {
      title: form.get("title"),
      periodStart: form.get("period_start"),
      periodEnd: form.get("period_end"),
      metiers: form.getAll("metiers"),
    };
  }

  const parsed = CreateBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Champs invalides", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const study = await createStudy(parsed.data);

  if (!contentType.includes("application/json")) {
    return NextResponse.redirect(
      new URL(`/studies/${study.id}/data`, request.url),
      303,
    );
  }
  return NextResponse.json({ study }, { status: 201 });
}
