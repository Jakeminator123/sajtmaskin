import fs from "node:fs/promises";
import path from "node:path";
import { MAX_GENERATED_VIDEO_BYTES } from "@/lib/media/video-generation-contract";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rows = vi.hoisted(() => ({ queue: [] as Array<Array<Record<string, unknown>>> }));
const fetchWithPinnedDns = vi.hoisted(() => vi.fn());
const listBlobs = vi.hoisted(() => vi.fn());
const testPaths = vi.hoisted(() => ({ uploads: "/tmp/sajtmaskin-b1-media-test" }));

vi.mock("@/lib/db/client", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => {
          const selected = rows.queue.shift() ?? [];
          return Object.assign(Promise.resolve(selected), {
            orderBy: () => ({ limit: async () => selected }),
          });
        },
      }),
    }),
  },
}));
vi.mock("@/lib/capture/pinned-fetch", () => ({ fetchWithPinnedDns }));
vi.mock("@/lib/db/services/shared", () => ({ getUploadsDir: () => testPaths.uploads }));
vi.mock("@/lib/storage/vercel-blob-provider", () => ({
  VercelBlobProvider: class {
    list = listBlobs;
  },
}));

import {
  PROJECT_EXPORT_MEDIA_MAX_FILE_BYTES,
  PROJECT_EXPORT_MEDIA_MAX_TOTAL_BYTES,
  loadProjectExportMedia,
  loadProjectProviderOrigin,
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
  beforeEach(async () => {
    rows.queue = [];
    fetchWithPinnedDns.mockReset();
    listBlobs.mockReset();
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
    await fs.rm(testPaths.uploads, { recursive: true, force: true });
    await fs.mkdir(path.join(testPaths.uploads, "media"), { recursive: true });
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await fs.rm(testPaths.uploads, { recursive: true, force: true });
  });

  it("fetches an owned Vercel blob with timeout and a per-file byte cap", async () => {
    rows.queue = [[mediaRow()], []];
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
  });

  it("skips nine unreferenced 4 MiB bank assets before fetching while keeping the used and explicitly exported media", async () => {
    const bankImage = (id: number) => {
      const storagePath = `user_1/projects/proj_1/media-library/${id}.png`;
      return mediaRow({
        id,
        file_path: storagePath,
        blob_url: `https://store.public.blob.vercel-storage.com/${storagePath}`,
        size_bytes: 4 * 1024 * 1024,
      });
    };
    const used = bankImage(10);
    const explicit = mediaRow({ id: 11 });
    rows.queue = [[...Array.from({ length: 9 }, (_, index) => bankImage(index + 1)), used, explicit], []];
    const largeImage = Buffer.alloc(4 * 1024 * 1024);
    fetchWithPinnedDns.mockImplementation(async (url: string) => ({
      status: 200,
      headers: {},
      body: url.endsWith("/media/hero.png") ? Buffer.from("old") : largeImage,
    }));

    const result = await loadProjectExportMedia({
      projectId: "proj_1", userId: "user_1", referencedText: String(used.blob_url),
    });

    expect(result.map(({ id }) => id)).toEqual([10, 11]);
    expect(fetchWithPinnedDns.mock.calls.map(([url]) => url)).toEqual([used.blob_url, explicit.blob_url]);
  });

  it("exports a referenced image from another owned project's bank", async () => {
    const storagePath = "user_1/projects/other/media-library/hero.png";
    const url = `https://store.public.blob.vercel-storage.com/${storagePath}`;
    rows.queue = [[mediaRow({ project_id: "other", file_path: storagePath, blob_url: url })], []];
    fetchWithPinnedDns.mockResolvedValue({ status: 200, headers: {}, body: Buffer.from("png") });

    const result = await loadProjectExportMedia({ projectId: "proj_1", userId: "user_1", referencedText: url });
    expect(result).toEqual([expect.objectContaining({ sourceUrls: expect.arrayContaining([url]) })]);
  });

  it("includes a full-size owned MP4 and an ordinary image through the same export", async () => {
    const storagePath = "user_1/projects/proj_1/media-library/film-job.mp4";
    const videoUrl = "https://store.public.blob.vercel-storage.com/" + storagePath;
    const video = Buffer.alloc(MAX_GENERATED_VIDEO_BYTES);
    const image = Buffer.from("png");
    rows.queue = [[mediaRow(), mediaRow({
      id: 2,
      file_path: storagePath,
      blob_url: videoUrl,
      original_name: "film-job.mp4",
      mime_type: "video/mp4",
      file_type: "video",
      size_bytes: video.byteLength,
    })], []];
    fetchWithPinnedDns
      .mockResolvedValueOnce({ status: 200, body: image })
      .mockResolvedValueOnce({ status: 200, body: video });

    const result = await loadProjectExportMedia({
      projectId: "proj_1", userId: "user_1", referencedText: videoUrl,
    });

    expect(result).toHaveLength(2);
    expect(result[0]?.body).toBe(image);
    expect(result[1]).toMatchObject({ originalName: "film-job.mp4", mimeType: "video/mp4" });
    expect(result[1]?.body).toBe(video);
    expect(fetchWithPinnedDns).toHaveBeenNthCalledWith(
      1, expect.any(String), expect.objectContaining({ maxBodyBytes: PROJECT_EXPORT_MEDIA_MAX_FILE_BYTES }),
    );
    expect(fetchWithPinnedDns).toHaveBeenNthCalledWith(
      2, videoUrl, expect.objectContaining({ maxBodyBytes: MAX_GENERATED_VIDEO_BYTES }),
    );
  });

  it("keeps the existing file limit for ordinary images", async () => {
    rows.queue = [[mediaRow({ size_bytes: PROJECT_EXPORT_MEDIA_MAX_FILE_BYTES + 1 })], []];
    await expect(loadProjectExportMedia({
      projectId: "proj_1", userId: "user_1", referencedText: "",
    })).rejects.toThrow("för stor för export");
    expect(fetchWithPinnedDns).not.toHaveBeenCalled();
  });

  it("does not remotely fetch an arbitrary or path-mismatched URL", async () => {
    rows.queue = [
      [
        mediaRow({
          blob_url: "https://attacker.example/internal",
        }),
      ],
      [],
    ];
    await expect(
      loadProjectExportMedia({ projectId: "proj_1", userId: "user_1", referencedText: "" }),
    ).rejects.toThrow("saknas i lagringen");
    expect(fetchWithPinnedDns).not.toHaveBeenCalled();
  });

  it("reads local fallback media through the same bounded byte contract", async () => {
    const row = mediaRow({ blob_url: null });
    rows.queue = [[row], []];
    const target = path.join(testPaths.uploads, "media", String(row.file_path));
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, Buffer.from("local-png"));

    const result = await loadProjectExportMedia({
      projectId: "proj_1",
      userId: "user_1",
      referencedText: "",
    });

    expect(result[0]?.body).toEqual(Buffer.from("local-png"));
    expect(fetchWithPinnedDns).not.toHaveBeenCalled();
  });

  it("fails the whole export before accumulated media can exceed the total cap", async () => {
    const body = Buffer.alloc(PROJECT_EXPORT_MEDIA_MAX_FILE_BYTES);
    rows.queue = [
      Array.from({ length: 8 }, (_, index) =>
        mediaRow({
          id: index + 1,
          filename: `${index}.png`,
          original_name: `${index}.png`,
          file_path: `user_1/projects/proj_1/media/${index}.png`,
          blob_url: `https://store.public.blob.vercel-storage.com/user_1/projects/proj_1/media/${index}.png`,
          size_bytes: body.byteLength,
        }),
      ),
      [],
    ];
    fetchWithPinnedDns.mockResolvedValue({ status: 200, headers: {}, body });

    await expect(
      loadProjectExportMedia({ projectId: "proj_1", userId: "user_1", referencedText: "" }),
    ).rejects.toThrow("för stora");
    expect(fetchWithPinnedDns).toHaveBeenCalledTimes(
      Math.floor(PROJECT_EXPORT_MEDIA_MAX_TOTAL_BYTES / body.byteLength) + 1,
    );
  });

  it.each([null, "another-owned-project"])("includes referenced shared media in scope %s but skips unrelated library files", async (projectId) => {
    const shared = mediaRow({ id: 2, project_id: projectId });
    rows.queue = [[shared, mediaRow({ id: 3, project_id: null, blob_url: null })], []];
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
  });

  it("exports bytes and the exact returned URL for a legacy project upload", async () => {
    const storagePath = "user_1/projects/proj_1/project-files/legacy.png";
    const blobUrl = `https://store.public.blob.vercel-storage.com/${storagePath}`;
    rows.queue = [
      [],
      [
        {
          id: 41,
          project_id: "proj_1",
          filename: "legacy.png",
          file_path: storagePath,
          original_name: "Legacy hero.png",
          mime_type: "image/png",
          size_bytes: 4,
          created_at: new Date(),
        },
      ],
    ];
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "blob-token");
    listBlobs.mockResolvedValue([
      {
        pathname: storagePath,
        url: blobUrl,
        fsPath: null,
        contentType: "image/png",
        size: 4,
        uploadedAt: null,
      },
    ]);
    fetchWithPinnedDns.mockResolvedValue({ status: 200, headers: {}, body: Buffer.from("png!") });

    const result = await loadProjectExportMedia({
      projectId: "proj_1",
      userId: "user_1",
      referencedText: "",
    });

    expect(result).toEqual([
      expect.objectContaining({
        id: "image-41",
        originalName: "Legacy hero.png",
        body: Buffer.from("png!"),
        sourceUrls: expect.arrayContaining([blobUrl]),
      }),
    ]);
    expect(listBlobs).toHaveBeenCalledWith({ prefix: storagePath, limit: 2 });
    expect(fetchWithPinnedDns).toHaveBeenCalledWith(
      blobUrl,
      expect.objectContaining({ maxBodyBytes: PROJECT_EXPORT_MEDIA_MAX_FILE_BYTES }),
    );
  });
});

describe("loadProjectProviderOrigin", () => {
  it("uses the latest ready row for the authorized chat and version", async () => {
    rows.queue = [[{ providerUrl: "demo.vercel.app", legacyUrl: null }]];

    await expect(loadProjectProviderOrigin({ chatId: "chat_1", versionId: "ver_1" })).resolves.toBe(
      "https://demo.vercel.app",
    );
  });
});
