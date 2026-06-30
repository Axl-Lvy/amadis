import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "./route";

vi.mock("@/lib/auth/server", () => ({ auth: { getSession: vi.fn() } }));
vi.mock("@/lib/services/variants", () => ({ getVariant: vi.fn() }));
vi.mock("@/lib/r2", () => ({ r2: { send: vi.fn() }, R2_BUCKET: "bucket" }));
vi.mock("@aws-sdk/client-s3", () => ({
  GetObjectCommand: class {
    input: unknown;
    constructor(i: unknown) {
      this.input = i;
    }
  },
}));

import { auth } from "@/lib/auth/server";
import { r2 } from "@/lib/r2";
import { getVariant } from "@/lib/services/variants";

const getSession = auth.getSession as ReturnType<typeof vi.fn>;
const variant = getVariant as ReturnType<typeof vi.fn>;
const send = r2.send as ReturnType<typeof vi.fn>;

function call() {
  return GET(new Request("http://test/variants/v1/scan"), {
    params: Promise.resolve({ vid: "v1" }),
  });
}

function streamingBody() {
  return { Body: { transformToWebStream: () => new ReadableStream() } };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /variants/[vid]/scan", () => {
  it("returns 401 when there is no session user", async () => {
    getSession.mockResolvedValue({ data: null });
    const res = await call();
    expect(res.status).toBe(401);
    expect(variant).not.toHaveBeenCalled();
  });

  it("returns 404 when getVariant throws (unknown/unowned variant)", async () => {
    getSession.mockResolvedValue({ data: { user: { id: "owner-1" } } });
    variant.mockRejectedValue(new Error("variantNotFound"));
    const res = await call();
    expect(res.status).toBe(404);
    expect(variant).toHaveBeenCalledWith("owner-1", "v1");
    expect(send).not.toHaveBeenCalled();
  });

  it("returns 404 when the variant has no scanKey", async () => {
    getSession.mockResolvedValue({ data: { user: { id: "owner-1" } } });
    variant.mockResolvedValue({ scanKey: null });
    const res = await call();
    expect(res.status).toBe(404);
    expect(send).not.toHaveBeenCalled();
  });

  it("returns 404 when R2 returns an object without a Body", async () => {
    getSession.mockResolvedValue({ data: { user: { id: "owner-1" } } });
    variant.mockResolvedValue({ scanKey: "scans/v1.png" });
    send.mockResolvedValue({ Body: undefined });
    const res = await call();
    expect(res.status).toBe(404);
  });

  it("streams a PDF scan with application/pdf inferred from the .pdf key", async () => {
    getSession.mockResolvedValue({ data: { user: { id: "owner-1" } } });
    variant.mockResolvedValue({ scanKey: "scans/v1.pdf" });
    send.mockResolvedValue(streamingBody());
    const res = await call();
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("streams a PNG scan with image/png inferred from the .png key", async () => {
    getSession.mockResolvedValue({ data: { user: { id: "owner-1" } } });
    variant.mockResolvedValue({ scanKey: "scans/v1.PNG" });
    send.mockResolvedValue(streamingBody());
    const res = await call();
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
  });
});
