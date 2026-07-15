import { assertEquals } from "jsr:@std/assert@^0.225.0";
import { postOffer, postAnswer, postIce, poll, resetRelay } from "../signaling/relay.ts";

Deno.test("offer is readable by opponent via poll", async () => {
  await resetRelay();
  await postOffer(100, "p1", { type: "offer", sdp: "FAKE_SDP" });
  const msgs = await poll(100, "p2", 0);
  assertEquals(msgs.length, 1);
  assertEquals(msgs[0].type, "offer");
  assertEquals(msgs[0].from, "p1");
});

Deno.test("poll filters by since timestamp", async () => {
  await resetRelay();
  const t0 = Date.now();
  await postOffer(101, "p1", { type: "offer", sdp: "SDP1" });
  const t1 = Date.now();
  // Wait a bit so the next message has a strictly greater timestamp than t1
  await new Promise((r) => setTimeout(r, 20));
  await postIce(101, "p1", { candidate: "CAND1" });
  const msgs = await poll(101, "p2", t1);
  assertEquals(msgs.length, 1);
  assertEquals(msgs[0].type, "ice");
});

Deno.test("answer is not visible to self (only to opponent)", async () => {
  await resetRelay();
  await postAnswer(102, "p1", { type: "answer", sdp: "SDP" });
  // p1 should not see its own answer
  const ownMsgs = await poll(102, "p1", 0);
  assertEquals(ownMsgs.length, 0);
  // p2 should see it
  const oppMsgs = await poll(102, "p2", 0);
  assertEquals(oppMsgs.length, 1);
  assertEquals(oppMsgs[0].type, "answer");
});

Deno.test("messages from both peers are routed correctly", async () => {
  await resetRelay();
  await postOffer(103, "p1", { sdp: "P1_OFFER" });
  await postAnswer(103, "p2", { sdp: "P2_ANSWER" });
  await postIce(103, "p1", { candidate: "P1_ICE" });
  await postIce(103, "p2", { candidate: "P2_ICE" });

  const p1Receives = await poll(103, "p1", 0);
  const p2Receives = await poll(103, "p2", 0);

  // p1 should receive messages addressed to p1 (i.e., from p2)
  assertEquals(p1Receives.length, 2);
  assertEquals(p1Receives.every((m) => m.from === "p2"), true);

  // p2 should receive messages addressed to p2 (i.e., from p1)
  assertEquals(p2Receives.length, 2);
  assertEquals(p2Receives.every((m) => m.from === "p1"), true);
});
