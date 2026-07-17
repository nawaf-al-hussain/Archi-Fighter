import { apiFetch } from "../services/api.service.js";

const ICE_CONFIG = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "turn:openrelay.metered.ca:80",   username: "openrelay", credential: "openrelay" },
    { urls: "turn:openrelay.metered.ca:443",  username: "openrelay", credential: "openrelay" },
    { urls: "turn:openrelay.metered.ca:443?transport=tcp", username: "openrelay", credential: "openrelay" },
  ],
};

const POLL_INTERVAL_MS = 500;
const ICE_TIMEOUT_MS = 15000;

class RtcManager {
  constructor() {
    this.state = "idle";
    this._pc = null;
    this._dc = null;
    this._gameId = null;
    this._peerId = null;
    this._onMessage = null;
    this._pollTimer = null;
    this._lastPollTs = 0;
    this._iceTimeout = null;
  }

  /**
   * Initialize a P2P connection.
   * @param {number} gameId
   * @param {"p1"|"p2"} peerId
   * @param {boolean} isInitiator  - true = creates offer, false = waits for offer
   * @param {(msg: any) => void} onMessage
   */
  async init(gameId, peerId, isInitiator, onMessage) {
    this.disconnect();
    this._gameId = gameId;
    this._peerId = peerId;
    this._onMessage = onMessage;
    this._isInitiator = isInitiator;
    this.state = "connecting";

    this._pc = new RTCPeerConnection(ICE_CONFIG);

    // ICE candidate → relay to opponent
    this._pc.onicecandidate = (e) => {
      if (e.candidate) {
        apiFetch(`/games/${gameId}/signal/ice`, {
          method: "POST",
          body: JSON.stringify({ from: peerId, candidate: e.candidate }),
        }).catch((err) => console.error("[RTC] postIce failed:", err));
      }
    };

    this._pc.onconnectionstatechange = () => {
      const s = this._pc.connectionState;
      if (s === "connected") {
        this.state = "connected";
        clearTimeout(this._iceTimeout);
        console.log("[RTC] connected");
      } else if (s === "disconnected") {
        this.state = "disconnected";
      } else if (s === "failed") {
        this.state = "failed";
        clearTimeout(this._iceTimeout);
      }
    };

    // Data channel
    if (isInitiator) {
      this._dc = await this._pc.createDataChannel("game");
      // Guard: disconnect() may have been called mid-init (it nulls _pc).
      if (!this._pc) return;
      this._setupDataChannel();
      const offer = await this._pc.createOffer();
      if (!this._pc) return;
      await this._pc.setLocalDescription(offer);
      if (!this._pc) return;
      await apiFetch(`/games/${gameId}/signal/offer`, {
        method: "POST",
        body: JSON.stringify({ from: peerId, sdp: offer }),
      });
    } else {
      this._pc.ondatachannel = (e) => {
        this._dc = e.channel;
        this._setupDataChannel();
      };
    }

    if (!this._pc) return; // disconnected mid-init

    // Start polling for signaling messages
    this._startPolling();

    // ICE timeout
    this._iceTimeout = setTimeout(() => {
      if (this.state === "connecting") {
        console.warn("[RTC] ICE timeout — connection failed");
        this.state = "failed";
      }
    }, ICE_TIMEOUT_MS);
  }

  /**
   * Replace the message handler without re-initializing the connection.
   * Used when transitioning from CharacterSelectScene to FightScene.
   * @param {(msg: any) => void} onMessage
   */
  setMessageHandler(onMessage) {
    this._onMessage = onMessage;
  }

  _setupDataChannel() {
    this._dc.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        this._onMessage?.(msg);
      } catch (err) {
        console.error("[RTC] bad message:", err);
      }
    };
    this._dc.onclose = () => {
      this.state = "disconnected";
    };
  }

  _startPolling() {
    this._pollTimer = setInterval(async () => {
      try {
        const res = await apiFetch(
          `/games/${this._gameId}/signal/poll?peer=${this._peerId}&since=${this._lastPollTs}`,
        );
        for (const msg of res.messages) {
          this._lastPollTs = Math.max(this._lastPollTs, msg.timestamp);
          await this._handleSignalMessage(msg);
        }
      } catch (err) {
        console.error("[RTC] poll failed:", err);
      }
    }, POLL_INTERVAL_MS);
  }

  async _handleSignalMessage(msg) {
    if (msg.type === "offer") {
      await this._pc.setRemoteDescription(msg.data);
      const answer = await this._pc.createAnswer();
      await this._pc.setLocalDescription(answer);
      await apiFetch(`/games/${this._gameId}/signal/answer`, {
        method: "POST",
        body: JSON.stringify({ from: this._peerId, sdp: answer }),
      });
    } else if (msg.type === "answer") {
      await this._pc.setRemoteDescription(msg.data);
    } else if (msg.type === "ice") {
      await this._pc.addIceCandidate(msg.data);
    }
  }

  send(msg) {
    if (this.state !== "connected" || !this._dc) {
      throw new Error(`Cannot send in state ${this.state}`);
    }
    this._dc.send(JSON.stringify(msg));
  }

  disconnect() {
    if (this._pollTimer) clearInterval(this._pollTimer);
    if (this._iceTimeout) clearTimeout(this._iceTimeout);
    if (this._dc) {
      try { this._dc.close(); } catch {}
      this._dc = null;
    }
    if (this._pc) {
      try { this._pc.close(); } catch {}
      this._pc = null;
    }
    this.state = "idle";
    this._onMessage = null;
    this._pollTimer = null;
    this._iceTimeout = null;
    // Reset all per-game state so a new game doesn't inherit stale values
    this._gameId = null;
    this._peerId = null;
    this._isInitiator = false;
    this._lastPollTs = 0;
  }
}

export const rtcManager = new RtcManager();
