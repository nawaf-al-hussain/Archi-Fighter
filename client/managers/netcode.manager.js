export const INPUT_DELAY_FRAMES = 4; // 67 ms at 60 Hz

class NetcodeManager {
  constructor() {
    this._rtc = null;
    this._localApply = null;
    this._buffer = []; // queue of {source, action, frame, applyAt}
    this._frame = 0;
  }

  /**
   * @param {{send: (msg: string) => void, state: string}} rtc
   * @param {(input: {source: "local"|"remote", action: string, frame: number}) => void} localApply
   */
  init(rtc, localApply) {
    this._rtc = rtc;
    this._localApply = localApply;
    this._buffer = [];
    this._frame = 0;
  }

  reset() {
    this._rtc = null;
    this._localApply = null;
    this._buffer = [];
    this._frame = 0;
  }

  /** Queue a local input. Sends to opponent immediately (they apply on their delay). */
  sendInput(action) {
    this._frame++;
    const frame = this._frame;
    const applyAt = frame + INPUT_DELAY_FRAMES;
    this._buffer.push({ source: "local", action, frame, applyAt });

    // Send to opponent immediately
    if (this._rtc?.state === "connected") {
      this._rtc.send(JSON.stringify({ type: "input", data: { action, frame } }));
    }
  }

  /** Called by RtcManager on receiving a message from opponent. */
  _handleRemote(msg) {
    if (msg.type !== "input") return;
    const { action, frame } = msg.data;
    // Delay is measured in LOCAL ticks since receipt, decoupled from the
    // remote frame number (which may be far ahead of our local frame).
    // The remote frame is preserved on the applied input for downstream use.
    const applyAt = this._frame + INPUT_DELAY_FRAMES;
    this._buffer.push({ source: "remote", action, frame, applyAt });
  }

  /** Called every frame by the scene's update loop. */
  tick() {
    if (this._buffer.length === 0) {
      this._frame++;
      return;
    }
    // Apply any inputs whose applyAt <= current frame + 1
    const due = this._buffer.filter((b) => b.applyAt <= this._frame + 1);
    this._buffer = this._buffer.filter((b) => b.applyAt > this._frame + 1);
    for (const input of due) {
      this._localApply?.({
        source: input.source,
        action: input.action,
        frame: input.frame,
      });
    }
    this._frame++;
  }
}

export const netcodeManager = new NetcodeManager();
