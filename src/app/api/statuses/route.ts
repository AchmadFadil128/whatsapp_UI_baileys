import { NextRequest, NextResponse } from "next/server";
import { store } from "@/server/services/store";
import type { ApiResponse } from "@/types";

/**
 * DELETE /api/statuses
 * - Without query: clears all status broadcast messages and associated media.
 * - With `?senderId=<id>`: deletes only statuses posted by that sender.
 *   The senderId is the opaque ID previously returned by the API.
 */
export async function DELETE(
  request: NextRequest
): Promise<NextResponse<ApiResponse<{ deleted: number } | undefined>>> {
  const senderId = request.nextUrl.searchParams.get("senderId");

  try {
    if (senderId !== null) {
      if (!senderId.trim()) {
        return NextResponse.json(
          { success: false, error: "Invalid senderId" },
          { status: 400 }
        );
      }
      const deleted = await store.deleteStatusesBySender(senderId);
      return NextResponse.json({ success: true, data: { deleted } });
    }

    await store.clearAllStatuses();
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
