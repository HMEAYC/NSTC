import { describe, it, expect, vi, beforeEach } from "vitest";
import { api } from "../api/client";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
});

describe("api client", () => {
  it("listSessions calls /api/sessions", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ sessions: [] }),
    });
    const res = await api.listSessions();
    expect(res.sessions).toEqual([]);
    expect(mockFetch).toHaveBeenCalledWith("/api/sessions", expect.any(Object));
  });

  it("listDevices calls /api/devices", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ devices: [] }),
    });
    const res = await api.listDevices();
    expect(res.devices).toEqual([]);
    expect(mockFetch).toHaveBeenCalledWith("/api/devices", expect.any(Object));
  });

  it("listFirmware calls /api/firmware/list", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ versions: [] }),
    });
    const res = await api.listFirmware();
    expect(res.versions).toEqual([]);
    expect(mockFetch).toHaveBeenCalledWith("/api/firmware/list", expect.any(Object));
  });

  it("getWifiConfig calls /api/config/wifi", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ssid: "test", updated_at: "2024-01-01" }),
    });
    const res = await api.getWifiConfig();
    expect(res.ssid).toBe("test");
    expect(mockFetch).toHaveBeenCalledWith("/api/config/wifi", expect.any(Object));
  });

  it("endSession calls POST /api/sessions/{id}/end", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: "completed" }),
    });
    const res = await api.endSession("sess-1");
    expect(res.status).toBe("completed");
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/sessions/sess-1/end",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("uploadFirmware sends FormData", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
    const file = new File(["fake"], "firmware.bin", { type: "application/octet-stream" });
    await api.uploadFirmware("0.2.0", "test", file);
    const call = mockFetch.mock.calls[0];
    expect(call[0]).toContain("/api/firmware/upload");
    expect(call[1].method).toBe("POST");
    expect(call[1].body).toBeInstanceOf(FormData);
  });

  it("listChildren calls /api/children", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ children: [] }),
    });
    const res = await api.listChildren();
    expect(res.children).toEqual([]);
    expect(mockFetch).toHaveBeenCalledWith("/api/children", expect.any(Object));
  });
});
