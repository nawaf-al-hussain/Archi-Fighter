import { describe, it, expect, vi, beforeEach } from "vitest";

const { netcodeManager, INPUT_DELAY_FRAMES } = await import("../managers/netcode.manager.js");

describe("NetcodeManager", () => {
  beforeEach(() => {
    netcodeManager.reset();
  });

  it("INPUT_DELAY_FRAMES is 4", () => {
    expect(INPUT_DELAY_FRAMES).toBe(4);
  });

  it("applies local input after delay frames", () => {
    const localApply = vi.fn();
    const rtc = { send: vi.fn(), state: "connected" };
    netcodeManager.init(rtc, localApply);

    netcodeManager.sendInput("punch");
    // Should not apply on the same frame
    netcodeManager.tick();
    netcodeManager.tick();
    netcodeManager.tick();
    expect(localApply).not.toHaveBeenCalled();

    // 4th tick = delay elapsed → apply
    netcodeManager.tick();
    expect(localApply).toHaveBeenCalledTimes(1);
    expect(localApply).toHaveBeenCalledWith({
      source: "local",
      action: "punch",
      frame: expect.any(Number),
    });
  });

  it("sends local input over rtc immediately (for opponent)", () => {
    const localApply = vi.fn();
    const rtc = { send: vi.fn(), state: "connected" };
    netcodeManager.init(rtc, localApply);

    netcodeManager.sendInput("kick");
    expect(rtc.send).toHaveBeenCalledTimes(1);
    const sent = JSON.parse(rtc.send.mock.calls[0][0]);
    expect(sent.type).toBe("input");
    expect(sent.data.action).toBe("kick");
  });

  it("applies remote inputs from opponent", () => {
    const localApply = vi.fn();
    const rtc = { send: vi.fn(), state: "connected" };
    netcodeManager.init(rtc, localApply);

    // Simulate receiving a remote input
    netcodeManager._handleRemote({ type: "input", data: { action: "block", frame: 10 } });
    // Remote inputs also go through the delay buffer
    netcodeManager.tick();
    netcodeManager.tick();
    netcodeManager.tick();
    netcodeManager.tick();
    expect(localApply).toHaveBeenCalledWith({
      source: "remote",
      action: "block",
      frame: 10,
    });
  });

  it("reset() clears all state", () => {
    const localApply = vi.fn();
    const rtc = { send: vi.fn(), state: "connected" };
    netcodeManager.init(rtc, localApply);
    netcodeManager.sendInput("punch");

    netcodeManager.reset();

    netcodeManager.tick();
    expect(localApply).not.toHaveBeenCalled();
  });
});
