/** HTTP status for `/api/v0/chats/.../sandbox-preview` — retry 503/504, not 422. */
export function httpStatusForSandboxPreviewFailure(error: {
  stage: "repair" | "sandbox-create" | "install" | "build";
  message: string;
}): number {
  switch (error.stage) {
    case "repair":
      return 422;
    case "install":
      return 503;
    case "build":
      return 422;
    case "sandbox-create": {
      const m = error.message;
      if (
        m.includes("SANDBOX_NOT_LISTENING") ||
        m.includes("did not become ready") ||
        m.includes("ETIMEDOUT")
      ) {
        return 504;
      }
      return 503;
    }
    default:
      return 503;
  }
}
