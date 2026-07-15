import test from "node:test";
import assert from "node:assert/strict";

import {
  buildRealtimeAsrUrl,
  createAuthenticatedSse,
  createFloat32Resampler,
  createRealtimeAsrSession,
  createSseParser,
  downmixChannels,
  float32ToPcm16Le
} from "../src/api/realtime.js";

test("SSE parser handles named, chunked, multiline JSON events", () => {
  const events = [];
  const parser = createSseParser({ onEvent: (event) => events.push(event) });

  parser.feed("\ufeffid: 42\r\nevent: transcript-segment\r\ndata: {\"text\":");
  parser.feed("\"hello\",\r\ndata: \"final\":true}\r\n\r\n");

  assert.equal(events.length, 1);
  assert.equal(events[0].type, "transcript-segment");
  assert.equal(events[0].id, "42");
  assert.deepEqual(events[0].data, { text: "hello", final: true });
});

test("SSE parser preserves text data, last event id, and retry", () => {
  const events = [];
  const retries = [];
  const parser = createSseParser({
    onEvent: (event) => events.push(event),
    onRetry: (delay) => retries.push(delay)
  });

  parser.feed("retry: 2500\nid: evt-7\ndata: plain\ndata: text\n\n");
  parser.feed("event: heartbeat\ndata: {}\n\n");

  assert.deepEqual(retries, [2500]);
  assert.equal(events[0].data, "plain\ntext");
  assert.equal(events[1].id, "evt-7");
  assert.deepEqual(events[1].data, {});
});

test("SSE parser flushes a final unterminated event", () => {
  const events = [];
  const parser = createSseParser({ onEvent: (event) => events.push(event) });
  parser.feed("event: timeout\ndata: {\"type\":\"timeout\"}");
  parser.finish();

  assert.equal(events.length, 1);
  assert.equal(events[0].type, "timeout");
});

test("downmix averages all available channels", () => {
  const mixed = downmixChannels([
    Float32Array.from([1, -1, 0.5]),
    Float32Array.from([-1, 1, 0.5])
  ]);
  assert.deepEqual(Array.from(mixed), [0, 0, 0.5]);
});

test("streaming resampler preserves phase across chunks", () => {
  const resampler = createFloat32Resampler(48000, 16000);
  const first = resampler.process(Float32Array.from([0, 1, 2, 3, 4]));
  const second = resampler.process(Float32Array.from([5, 6, 7, 8, 9, 10]));

  assert.deepEqual(Array.from(first), [0, 3]);
  assert.deepEqual(Array.from(second), [6, 9]);
});

test("PCM encoder writes signed 16-bit little-endian samples", () => {
  const pcm = float32ToPcm16Le(Float32Array.from([-1, 0, 1]));
  const view = new DataView(pcm);

  assert.equal(view.getInt16(0, true), -32768);
  assert.equal(view.getInt16(2, true), 0);
  assert.equal(view.getInt16(4, true), 32767);
  assert.notEqual(view.getInt16(4, false), 32767);
});

test("ASR URL maps HTTP schemes and encodes credentials", () => {
  assert.equal(
    buildRealtimeAsrUrl("http://47.100.182.3:28765/", "meeting 1", "token/value"),
    "ws://47.100.182.3:28765/api/meetings/meeting%201/realtime_asr?token=token%2Fvalue"
  );
  assert.equal(
    buildRealtimeAsrUrl("https://example.test", "meeting", "jwt"),
    "wss://example.test/api/meetings/meeting/realtime_asr?token=jwt"
  );
});

test("authenticated SSE sends bearer and Last-Event-ID headers", async () => {
  let request;
  let connection;
  const received = new Promise((resolve) => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("id: evt-9\nevent: connected\ndata: {\"ok\":true}\n\n"));
        controller.close();
      }
    });

    connection = createAuthenticatedSse({
      baseUrl: "http://api.test",
      meetingId: "meeting-1",
      token: "jwt-token",
      initialLastEventId: "evt-8",
      fetchImpl: async (url, options) => {
        request = { url, options };
        return { ok: true, status: 200, body: stream };
      },
      onEvent: (event) => {
        connection.close();
        resolve(event);
      }
    }).start();
  });

  const event = await received;
  assert.equal(request.url, "http://api.test/api/meetings/meeting-1/events");
  assert.equal(request.options.headers.Authorization, "Bearer jwt-token");
  assert.equal(request.options.headers["Last-Event-ID"], "evt-8");
  assert.equal(event.id, "evt-9");
  assert.deepEqual(event.data, { ok: true });
  assert.equal(connection.getLastEventId(), "evt-9");
});

test("authenticated SSE reconnects with the most recently received event id", async () => {
  const requests = [];
  let connection;
  let callCount = 0;
  let resolveSecondEvent;
  const secondEvent = new Promise((resolve) => {
    resolveSecondEvent = resolve;
  });

  connection = createAuthenticatedSse({
    baseUrl: "http://api.test",
    meetingId: "meeting-1",
    token: "jwt-token",
    reconnectDelayMs: 1,
    maxReconnectDelayMs: 1,
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      callCount += 1;
      const eventId = callCount === 1 ? "evt-1" : "evt-2";
      return {
        ok: true,
        status: 200,
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(`id: ${eventId}\nevent: state-update\ndata: {}\n\n`));
            controller.close();
          }
        })
      };
    },
    onEvent: (event) => {
      if (event.id === "evt-2") {
        connection.close();
        resolveSecondEvent();
      }
    }
  }).start();

  await secondEvent;
  assert.equal(requests.length, 2);
  assert.equal(requests[0].options.headers["Last-Event-ID"], undefined);
  assert.equal(requests[1].options.headers["Last-Event-ID"], "evt-1");
});

test("realtime ASR sends start, PCM frames, and stop before cleanup", async () => {
  const sent = [];
  const transcripts = [];
  const completions = [];
  const statuses = [];
  const track = { stopped: false, stop() { this.stopped = true; } };
  let context;
  let websocket;

  class FakeNode {
    connect() {}
    disconnect() {}
  }

  class FakeAudioContext {
    constructor() {
      this.sampleRate = 48000;
      this.state = "running";
      this.destination = {};
      context = this;
    }

    createMediaStreamSource() {
      return new FakeNode();
    }

    createScriptProcessor() {
      this.processor = new FakeNode();
      return this.processor;
    }

    createGain() {
      const node = new FakeNode();
      node.gain = { value: 1 };
      return node;
    }

    async close() {
      this.state = "closed";
    }

    async suspend() {
      this.state = "suspended";
    }

    async resume() {
      this.state = "running";
    }
  }

  class FakeWebSocket {
    constructor(url) {
      this.url = url;
      this.readyState = 0;
      websocket = this;
      queueMicrotask(() => {
        this.readyState = 1;
        this.onopen?.();
      });
    }

    send(payload) {
      sent.push(payload);
      if (typeof payload === "string" && JSON.parse(payload).type === "stop") {
        queueMicrotask(() => this.onmessage?.({
          data: JSON.stringify({ type: "asr_complete", sentence_count: 1, full_text: "hello" })
        }));
      }
    }

    close() {
      this.readyState = 3;
      queueMicrotask(() => this.onclose?.({ code: 1000 }));
    }
  }

  const session = createRealtimeAsrSession({
    baseUrl: "http://api.test",
    meetingId: "meeting-1",
    token: "jwt-token",
    mediaDevices: { getUserMedia: async () => ({ getTracks: () => [track] }) },
    AudioContextClass: FakeAudioContext,
    WebSocketClass: FakeWebSocket,
    pingIntervalMs: 0,
    stopWaitMs: 50,
    onTranscript: (message) => transcripts.push(message),
    onComplete: (message) => completions.push(message),
    onStatus: (event) => statuses.push(event.status)
  });

  await session.start();
  websocket.onmessage({ data: JSON.stringify({ type: "transcript", text: "hello", is_sentence_end: true }) });
  const audioProcessEvent = {
    inputBuffer: {
      numberOfChannels: 2,
      getChannelData: (index) => index
        ? Float32Array.from([0, 0, 0, 0, 0, 0, 0])
        : Float32Array.from([0, 0.5, 1, 0.5, 0, -0.5, -1])
    },
    outputBuffer: {
      numberOfChannels: 1,
      getChannelData: () => new Float32Array(7)
    }
  };
  await session.pause();
  context.processor.onaudioprocess(audioProcessEvent);
  assert.equal(sent.length, 1, "paused capture must not send PCM frames");
  assert.equal(context.state, "suspended");
  assert.equal(session.isPaused(), true);

  await session.resume();
  context.processor.onaudioprocess(audioProcessEvent);
  await session.stop();

  assert.deepEqual(JSON.parse(sent[0]), { type: "start", format: "pcm", sample_rate: 16000 });
  assert.ok(sent[1] instanceof ArrayBuffer);
  assert.deepEqual(JSON.parse(sent[2]), { type: "stop" });
  assert.equal(transcripts[0].text, "hello");
  assert.equal(completions[0].full_text, "hello");
  assert.equal(track.stopped, true);
  assert.equal(context.state, "closed");
  assert.equal(session.getState(), "stopped");
  assert.ok(statuses.includes("paused"));
  assert.equal(session.isPaused(), false);
});
