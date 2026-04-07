import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      success: false,
      code: "project_instruction_sync_removed",
      error:
        "Projektinstruktions-sync till legacy /api/v0/projects/instructions ar avvecklad. Buildern anvander nu endast lokal/app-baserad instruktionstate.",
    },
    { status: 410 },
  );
}
