import { beforeEach, describe, expect, it, vi } from "vitest";

const getSignedUrl = vi.fn();
vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: (...args: unknown[]) => getSignedUrl(...args),
}));
// Capture command inputs without depending on the real SDK behaviour.
vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: class {
    constructor(public cfg: unknown) {}
  },
  PutObjectCommand: class {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  },
  GetObjectCommand: class {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  },
}));

import { presignGet, presignPut } from "@/lib/r2";

beforeEach(() => {
  getSignedUrl.mockReset();
});

describe("presignPut", () => {
  it("signs a PUT for the key with the content type and a default expiry", async () => {
    getSignedUrl.mockResolvedValue("https://signed/put");
    const url = await presignPut("owner/book/pdf/x.pdf", "application/pdf");
    expect(url).toBe("https://signed/put");
    const command = getSignedUrl.mock.calls[0][1] as { input: Record<string, unknown> };
    expect(command.input.Key).toBe("owner/book/pdf/x.pdf");
    expect(command.input.ContentType).toBe("application/pdf");
    expect(getSignedUrl.mock.calls[0][2]).toMatchObject({ expiresIn: 300 });
  });
});

describe("presignGet", () => {
  it("signs a GET for the key", async () => {
    getSignedUrl.mockResolvedValue("https://signed/get");
    const url = await presignGet("owner/book/pdf/x.pdf");
    expect(url).toBe("https://signed/get");
    const command = getSignedUrl.mock.calls[0][1] as { input: Record<string, unknown> };
    expect(command.input.Key).toBe("owner/book/pdf/x.pdf");
  });

  it("honours a custom expiry", async () => {
    getSignedUrl.mockResolvedValue("https://signed/get");
    await presignGet("k", 60);
    expect(getSignedUrl.mock.calls[0][2]).toMatchObject({ expiresIn: 60 });
  });
});
