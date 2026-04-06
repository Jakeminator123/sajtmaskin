/** HTTP status for canonical `/api/engine/chats/.../preview-session` (v0 route is compat). */
export function httpStatusForPreviewSessionFailure(error: {
  stage: "repair" | "preview-start";
  message: string;
  failureCode?: never;
}): number {
  switch (error.stage) {
    case "repair":
      return 422;
    case "preview-start": {
      return 503;
    }
    default:
      return 503;
  }
}
