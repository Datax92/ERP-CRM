import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { isImageFile, getImgBBApiKey, uploadToImgBB, testImgBBApiKey, uploadAttachment } from "@/lib/storage";

describe("ImgBB storage integration", () => {
  const originalEnv = process.env.NEXT_PUBLIC_IMGBB_API_KEY;

  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.NEXT_PUBLIC_IMGBB_API_KEY;
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_IMGBB_API_KEY = originalEnv;
  });

  describe("isImageFile", () => {
    it("recognizes image files by mime type", () => {
      expect(isImageFile({ name: "document", type: "image/png" })).toBe(true);
      expect(isImageFile({ name: "photo", type: "image/jpeg" })).toBe(true);
      expect(isImageFile({ name: "graphic", type: "image/webp" })).toBe(true);
      expect(isImageFile({ name: "anim", type: "image/gif" })).toBe(true);
    });

    it("recognizes image files by extension when type is empty", () => {
      expect(isImageFile({ name: "photo.jpg" })).toBe(true);
      expect(isImageFile({ name: "photo.JPEG" })).toBe(true);
      expect(isImageFile({ name: "receipt.png" })).toBe(true);
      expect(isImageFile({ name: "scan.webp" })).toBe(true);
      expect(isImageFile({ name: "drawing.svg" })).toBe(true);
      expect(isImageFile({ name: "logo.bmp" })).toBe(true);
    });

    it("returns false for non-image documents", () => {
      expect(isImageFile({ name: "invoice.pdf", type: "application/pdf" })).toBe(false);
      expect(isImageFile({ name: "spec.docx" })).toBe(false);
      expect(isImageFile({ name: "rates.xlsx" })).toBe(false);
      expect(isImageFile({ name: "notes.txt" })).toBe(false);
    });
  });

  describe("getImgBBApiKey", () => {
    it("prefers custom key passed in arguments", () => {
      process.env.NEXT_PUBLIC_IMGBB_API_KEY = "env-key";
      expect(getImgBBApiKey("custom-key")).toBe("custom-key");
    });

    it("falls back to NEXT_PUBLIC_IMGBB_API_KEY if custom key is empty", () => {
      process.env.NEXT_PUBLIC_IMGBB_API_KEY = "env-key-123";
      expect(getImgBBApiKey("")).toBe("env-key-123");
      expect(getImgBBApiKey(undefined)).toBe("env-key-123");
    });

    it("returns empty string if neither is set", () => {
      expect(getImgBBApiKey("")).toBe("");
      expect(getImgBBApiKey(undefined)).toBe("");
    });
  });

  describe("uploadToImgBB", () => {
    it("throws if API key is missing", async () => {
      const file = new File(["dummy content"], "photo.png", { type: "image/png" });
      await expect(uploadToImgBB(file, "")).rejects.toThrow(/ImgBB API key is missing/);
    });

    it("throws if file exceeds 32 MB", async () => {
      const hugeFile = {
        name: "large.jpg",
        size: 33 * 1024 * 1024,
        type: "image/jpeg",
      } as unknown as File;
      await expect(uploadToImgBB(hugeFile, "test-key")).rejects.toThrow(/exceeds ImgBB's 32 MB/);
    });

    it("successfully uploads and parses ImgBB response", async () => {
      const fakeResponse = {
        data: {
          id: "abc1234",
          url: "https://i.ibb.co/abc1234/receipt.png",
          display_url: "https://i.ibb.co/abc1234/display.png",
          size: 45000,
          thumb: { url: "https://i.ibb.co/abc1234/thumb.png" },
          delete_url: "https://ibb.co/abc1234/delete",
        },
        success: true,
        status: 200,
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => fakeResponse,
      });

      const file = new File(["sample image bytes"], "receipt.png", { type: "image/png" });
      const att = await uploadToImgBB(file, "test-api-key");

      expect(att).toMatchObject({
        name: "receipt.png",
        url: "https://i.ibb.co/abc1234/display.png",
        path: "imgbb/abc1234",
        thumbUrl: "https://i.ibb.co/abc1234/thumb.png",
        deleteUrl: "https://ibb.co/abc1234/delete",
        provider: "imgbb",
      });
      expect(att.uploadedAt).toBeDefined();
    });

    it("throws descriptive error when ImgBB returns failure", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({
          status_code: 400,
          error: { message: "Invalid API v1 key." },
          status_txt: "Bad Request",
        }),
      });

      const file = new File(["sample bytes"], "photo.jpg", { type: "image/jpeg" });
      await expect(uploadToImgBB(file, "invalid-key")).rejects.toThrow(/ImgBB: Invalid API v1 key/);
    });
  });

  describe("testImgBBApiKey", () => {
    it("returns error if key is empty", async () => {
      const res = await testImgBBApiKey("");
      expect(res.ok).toBe(false);
      expect(res.message).toMatch(/Please provide an API key/);
    });

    it("returns ok: true when connection succeeds", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      });
      const res = await testImgBBApiKey("good-key");
      expect(res.ok).toBe(true);
      expect(res.message).toMatch(/valid and working/);
    });

    it("returns ok: false when connection fails", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: { message: "Invalid API v1 key." } }),
      });
      const res = await testImgBBApiKey("bad-key");
      expect(res.ok).toBe(false);
      expect(res.message).toMatch(/Invalid API v1 key/);
    });
  });

  describe("uploadAttachment wrapper", () => {
    it("uses ImgBB when API key is provided and file is an image", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            id: "xyz789",
            url: "https://i.ibb.co/xyz789/order.jpg",
            display_url: "https://i.ibb.co/xyz789/order.jpg",
            size: 12000,
          },
        }),
      });

      const file = new File(["bytes"], "order.jpg", { type: "image/jpeg" });
      const att = await uploadAttachment("rfqs", "rec1", file, "my-imgbb-key");
      expect(att.provider).toBe("imgbb");
      expect(att.path).toBe("imgbb/xyz789");
    });
  });
});
