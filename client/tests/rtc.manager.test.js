import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock RTCPeerConnection
class MockRTC {
  constructor() {
    this.localDescription = null;
    this.remoteDescription = null;
    this.onicecandidate = null;
    this.onconnectionstatechange = null;
    this.ondatachannel = null;
    this._dataChannels = [];
    this.connectionState = "new";
  }
  async createDataChannel(label) {
    const dc = {
      label,
      send: vi.fn(),
      onopen: null,
      onmessage: null,
      onclose: null,
      close: vi.fn(),
      readyState: "open",
    };
    this._dataChannels.push(dc);
    return dc;
  }
  async createOffer() { return { type: "offer", sdp: "FAKE_OFFER" }; }
  async createAnswer() { return { type: "answer", sdp: "FAKE_ANSWER" }; }
  async setLocalDescription(desc) { this.localDescription = desc; }
  async setRemoteDescription(desc) { this.remoteDescription = desc; }
  addIceCandidate() { return Promise.resolve(); }
  close() {}
}

globalThis.RTCPeerConnection = MockRTC;

// Mock fetch
globalThis.fetch = vi.fn(async (url, opts) => ({
  ok: true,
  status: 200,
  json: async () => ({ ok: true, messages: [] }),
}));

// Mock crypto.randomUUID.
// Deviation from brief: brief uses `globalThis.crypto = {...}` but in modern
// Node (>=19) `crypto` is a getter-only accessor on the global prototype, so
// assignment throws in ESM strict mode (which Vitest uses). defineProperty
// shadows the inherited accessor with a writable own data property — same
// end state, compatible mechanism.
Object.defineProperty(globalThis, "crypto", {
  value: { randomUUID: () => "test-uuid-" + Math.random() },
  configurable: true,
  writable: true,
});

const { rtcManager } = await import("../managers/rtc.manager.js");

describe("RtcManager", () => {
  beforeEach(() => {
    rtcManager.disconnect();
  });

  it("starts in idle state", () => {
    expect(rtcManager.state).toBe("idle");
  });

  it("transitions to connecting on init as initiator", async () => {
    const onMsg = vi.fn();
    rtcManager.init(1, "p1", true, onMsg);
    expect(rtcManager.state).toBe("connecting");
    rtcManager.disconnect();
  });

  it("send() throws if not connected", () => {
    expect(() => rtcManager.send({ type: "test" })).toThrow();
  });

  it("disconnect() returns state to idle", () => {
    rtcManager.init(1, "p1", true, () => {});
    rtcManager.disconnect();
    expect(rtcManager.state).toBe("idle");
  });
});
