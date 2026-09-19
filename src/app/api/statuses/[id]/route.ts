import { NextRequest, NextResponse } from "next/server";
import { store } from "@/server/services/store";
import type { ApiResponse } from "@/types";

/**
 * DELETE /api/statuses/:id
 * Deletes a single status message and its associated media from the database.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResponse>> {
  const { id } = await params;

  if (!id) {
    return NextResponse.json(
      { success: false, error: "Missing status id" },
      { status: 400 }
    );
  }

  try {
    await store.deleteStatusMessage(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
