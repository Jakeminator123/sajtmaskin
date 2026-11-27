export const PROJECT_MEDIA_LIBRARY_CATEGORY = "media-library";

export function appendProjectMediaLibraryScope(
  formData: FormData,
  projectId?: string | null,
  chatId?: string,
): void {
  if (projectId) formData.append("projectId", projectId);
  if (chatId) formData.append("chatId", chatId);
  if (projectId || chatId) formData.append("mediaScope", PROJECT_MEDIA_LIBRARY_CATEGORY);
}

export function isProjectMediaLibraryPath(storagePath: string): boolean {
  const segments = storagePath.split("/");
  return segments.length === 5 && segments[1] === "projects" && segments[3] === PROJECT_MEDIA_LIBRARY_CATEGORY;
}
