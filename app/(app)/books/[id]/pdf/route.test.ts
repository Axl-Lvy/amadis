import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "./route";

vi.mock("@/lib/auth/server", () => ({ auth: { getSession: vi.fn() } }));
vi.mock("@/lib/services/books", () => ({ getBookPdfMeta: vi.fn() }));
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
import { getBookPdfMeta } from "@/lib/services/books";

const getSession = auth.getSession as ReturnType<typeof vi.fn>;
const pdfMeta = getBookPdfMeta as ReturnType<typeof vi.fn>;
const send = r2.send as ReturnType<typeof vi.fn>;

function call() {
  return GET(new Request("http://test/books/b1/pdf"), {
    params: Promise.resolve({ id: "b1" }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /books/[id]/pdf", () => {
  it("returns 401 when there is no session user", async () => {
    getSession.mockResolvedValue({ data: null });
    const res = await call();
    expect(res.status).toBe(401);
    expect(pdfMeta).not.toHaveBeenCalled();
  });

  it("returns 404 when getBookPdfMeta throws (unknown/unowned book)", async () => {
    getSession.mockResolvedValue({ data: { user: { id: "owner-1" } } });
    pdfMeta.mockRejectedValue(new Error("bookNotFound"));
    const res = await call();
    expect(res.status).toBe(404);
    expect(pdfMeta).toHaveBeenCalledWith("owner-1", "b1");
    expect(send).not.toHaveBeenCalled();
  });

  it("returns 404 when the book has no pdfKey", async () => {
    getSession.mockResolvedValue({ data: { user: { id: "owner-1" } } });
    pdfMeta.mockResolvedValue({ pdfKey: null });
    const res = await call();
    expect(res.status).toBe(404);
    expect(send).not.toHaveBeenCalled();
  });

  it("returns 404 when R2 returns an object without a Body", async () => {
    getSession.mockResolvedValue({ data: { user: { id: "owner-1" } } });
    pdfMeta.mockResolvedValue({ pdfKey: "books/b1.pdf" });
    send.mockResolvedValue({ Body: undefined });
    const res = await call();
    expect(res.status).toBe(404);
  });

  it("streams the PDF with application/pdf when pdfKey is set", async () => {
    getSession.mockResolvedValue({ data: { user: { id: "owner-1" } } });
    pdfMeta.mockResolvedValue({ pdfKey: "books/b1.pdf" });
    send.mockResolvedValue({
      Body: { transformToWebStream: () => new ReadableStream() },
    });
    const res = await call();
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
  });
});
