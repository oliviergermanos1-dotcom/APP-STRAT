import { NextResponse, type NextRequest } from "next/server";
import { getStudy } from "@/lib/store/studies";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { generateStudyBuffer } = require("@/lib/pptx/generator.js") as {
  generateStudyBuffer: (options?: {
    plan?: Array<{ key: string; enabled: boolean }>;
    study?: unknown;
  }) => Promise<Buffer>;
};

export async function GET(request: NextRequest) {
  try {
    const studyId = request.nextUrl.searchParams.get("studyId");
    let plan: Array<{ key: string; enabled: boolean }> | undefined;
    let study: Awaited<ReturnType<typeof getStudy>> = null;
    let titleSlug = "default";

    if (studyId) {
      study = await getStudy(studyId);
      if (!study) {
        return NextResponse.json({ error: "Étude introuvable" }, { status: 404 });
      }
      plan = study.plan.map((b) => ({ key: b.key, enabled: b.enabled }));
      titleSlug = study.title.replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 60);
    }

    const buffer = await generateStudyBuffer({
      plan,
      study: study ?? undefined,
    });
    const body = new Uint8Array(buffer);
    const filename = `Comite_de_Direction_${titleSlug}_${new Date()
      .toISOString()
      .slice(0, 10)}.pptx`;

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(body.byteLength),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    return NextResponse.json(
      { error: "Échec de la génération du PPTX", details: message },
      { status: 500 },
    );
  }
}
