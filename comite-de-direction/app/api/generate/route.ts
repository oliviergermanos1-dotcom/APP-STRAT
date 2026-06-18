import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { generateStudyBuffer } = require("@/lib/pptx/generator.js") as {
  generateStudyBuffer: () => Promise<Buffer>;
};

export async function GET() {
  try {
    const buffer = await generateStudyBuffer();
    const body = new Uint8Array(buffer);
    const filename = `Comite_de_Direction_${new Date()
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
