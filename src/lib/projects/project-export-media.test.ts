import { beforeEach, describe, expect, it, vi } from "vitest";

const rows = vi.hoisted(() => ({ value: [] as Array<Record<string, unknown>> }));
const fetchWithPinnedDns = vi.hoisted(() => vi.fn());
const localGet = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/client", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: async () => rows.value,
      }),
    }),
  },
}));
vi.mock("@/lib/capture/pinned-fetch", () => ({ fetchWithPinnedDns }));
vi.mock("@/lib/storage/local-fs-provider", () => ({
  LocalFsProvider: class {
    get = localGet;
  },
}));
vi.mock("@/lib/db/services/shared", () => ({ getUploadsDir: () => "/tmp/uploads" }));

import {
  PROJECT_EXPORT_MEDIA_MAX_FILE_BYTES,
  PROJECT_EXPORT_MEDIA_MAX_TOTAL_BYTES,
  loadProjectExportMedia,
} from "./project-export-media";

function mediaRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    user_id: "user_1",
    project_id: "proj_1",
    filename: "hero.png",
    original_name: "hero.png",
    file_path: "user_1/projects/proj_1/media/hero.png",
    blob_url: "https://store.public.blob.vercel-storage.com/user_1/projects/proj_1/media/hero.png",
    mime_type: "image/png",
    file_type: "image",
    size_bytes: 4,
    description: null,
    tags: null,
    created_at: new Date(),
    ...overrides,
  };
}

describe("loadProjectExportMedia", () => {
  beforeEach(() => {
    rows.value = [];
    fetchWithPinnedDns.mockReset();
    localGet.mockReset();
  });

  it("fetches an owned Vercel blob with timeout and a per-file byte cap", async () => {
    rows.value = [mediaRow()];
    fetchWithPinnedDns.mockResolvedValue({
      status: 200,
      headers: { "content-type": "image/png" },
      body: Buffer.from("png!"),
    });

    const result = await loadProjectExportMedia({
      projectId: "proj_1",
      userId: "user_1",
      referencedText: "",
    });

    expect(result[0]?.body).toEqual(Buffer.from("png!"));
    expect(fetchWithPinnedDns).toHaveBeenCalledWith(
      expect.stringContaining(".blob.vercel-storage.com/"),
      expect.objectContaining({
        timeoutMs: 10_000,
        maxBodyBytes: PROJECT_EXPORT_MEDIA_MAX_FILE_BYTES,
      }),
    );
    expect(localGet).not.toHaveBeenCalled();
  });

  it("does not remotely fetch an arbitrary or path-mismatched URL", async () => {
    rows.value = [
      mediaRow({
        blob_url: "https://attacker.example/internal",
      }),
    ];
    localGet.mockResolvedValue(null);

    await expect(
      loadProjectExportMedia({ projectId: "proj_1", userId: "user_1", referencedText: "" }),
    ).rejects.toThrow("saknas i lagringen");
    expect(fetchWithPinnedDns).not.toHaveBeenCalled();
    expect(localGet).toHaveBeenCalledWith("user_1/projects/proj_1/media/hero.png");
  });

  it("fails the whole export before accumulated media can exceed the total cap", async () => {
    const body = Buffer.alloc(PROJECT_EXPORT_MEDIA_MAX_FILE_BYTES);
    rows.value = Array.from({ length: 8 }, (_, index) =>
      mediaRow({
        id: index + 1,
        filename: `${index}.png`,
        original_name: `${index}.png`,
        file_path: `user_1/projects/proj_1/media/${index}.png`,
        blob_url: `https://store.public.blob.vercel-storage.com/user_1/projects/proj_1/media/${index}.png`,
        size_bytes: body.byteLength,
      }),
    );
    fetchWithPinnedDns.mockResolvedValue({ status: 200, headers: {}, body });

    await expect(
      loadProjectExportMedia({ projectId: "proj_1", userId: "user_1", referencedText: "" }),
    ).rejects.toThrow("för stora");
    expect(fetchWithPinnedDns).toHaveBeenCalledTimes(
      Math.floor(PROJECT_EXPORT_MEDIA_MAX_TOTAL_BYTES / body.byteLength) + 1,
    );
  });

  it("includes referenced shared media but skips unrelated library files", async () => {
    const shared = mediaRow({ id: 2, project_id: null });
    rows.value = [shared, mediaRow({ id: 3, project_id: null, blob_url: null })];
    fetchWithPinnedDns.mockResolvedValue({
      status: 200,
      headers: {},
      body: Buffer.from("png!"),
    });

    const result = await loadProjectExportMedia({
      projectId: "proj_1",
      userId: "user_1",
      referencedText: String(shared.blob_url),
    });

    expect(result.map((item) => item.id)).toEqual([2]);
    expect(localGet).not.toHaveBeenCalled();
  });
});
