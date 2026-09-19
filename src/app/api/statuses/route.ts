import { NextResponse } from "next/server";
import { store } from "@/server/services/store";
import type { ApiResponse } from "@/types";

/**
 * DELETE /api/statuses
 * Clears all status broadcast messages and associated media from the database.
 */
export async function DELETE(): Promise<NextResponse<ApiResponse>> {
  try {
    await store.clearAllStatuses();
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
