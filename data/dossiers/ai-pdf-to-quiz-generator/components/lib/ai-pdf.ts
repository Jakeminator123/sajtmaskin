import { z } from "zod";

export const pdfUploadSchema = z.object({
  files: z
    .array(
      z.object({
        data: z.string().min(1),
        mimeType: z.literal("application/pdf"),
        name: z.string().optional(),
      }),
    )
    .min(1)
    .max(1),
});

export function extractBase64Payload(data: string) {
  const match = data.match(/^data:application\/pdf;base64,(.+)$/);
  return match ? match[1] : data;
}
