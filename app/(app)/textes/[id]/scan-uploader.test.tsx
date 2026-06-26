import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { renderWithIntl } from "@/test-utils/intl";

import { ScanUploader } from "./scan-uploader";
import { attachScan, presignScanUpload } from "./actions";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("./actions", () => ({
  presignScanUpload: vi.fn(),
  attachScan: vi.fn(),
}));

const presign = presignScanUpload as ReturnType<typeof vi.fn>;
const attach = attachScan as ReturnType<typeof vi.fn>;

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

function pickFile(container: HTMLElement) {
  const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
  const file = new File(["bytes"], "folio.png", { type: "image/png" });
  fireEvent.change(input, { target: { files: [file] } });
  return file;
}

describe("ScanUploader", () => {
  it("does nothing when no file is chosen", () => {
    renderWithIntl(<ScanUploader texteId="t1" />);
    fireEvent.click(screen.getByRole("button", { name: "Upload scan" }));
    expect(presign).not.toHaveBeenCalled();
  });

  it("presigns, PUTs to R2, attaches the key and refreshes", async () => {
    presign.mockResolvedValue({ url: "https://r2.example/put", key: "scans/k1" });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    const { container } = renderWithIntl(<ScanUploader texteId="t1" />);
    pickFile(container);
    fireEvent.click(screen.getByRole("button", { name: "Upload scan" }));

    await waitFor(() => expect(attach).toHaveBeenCalledWith("t1", "scans/k1"));
    expect(presign).toHaveBeenCalledWith("t1", "folio.png", "image/png");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://r2.example/put",
      expect.objectContaining({ method: "PUT" }),
    );
    expect(refresh).toHaveBeenCalled();
  });

  it("surfaces an error when the R2 upload fails", async () => {
    presign.mockResolvedValue({ url: "https://r2.example/put", key: "scans/k1" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    const { container } = renderWithIntl(<ScanUploader texteId="t1" />);
    pickFile(container);
    fireEvent.click(screen.getByRole("button", { name: "Upload scan" }));

    expect(await screen.findByText("Upload failed (500)")).toBeInTheDocument();
    expect(attach).not.toHaveBeenCalled();
  });
});
