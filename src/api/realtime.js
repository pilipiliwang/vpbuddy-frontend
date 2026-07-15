const DEFAULT_RECONNECT_DELAY_MS = 1000;
const DEFAULT_MAX_RECONNECT_DELAY_MS = 15000;
const DEFAULT_STOP_WAIT_MS = 3000;

function safeCall(callback, ...args) {
  try {
    callback?.(...args);
  } catch {
    // Consumer callbacks must not break transport cleanup or reconnection.
  }
}

function createTransportError(message, details = {}) {
  const error = new Error(message);
  Object.assign(error, details);
  return error;
}

function parseEventData(rawData) {
  if (!rawData) return "";
  try {
    return JSON.parse(rawData);
  } catch {
    return rawData;
  }
}

export function createSseParser({ onEvent, onRetry } = {}) {
  let buffer = "";
  let firstChunk = true;
  let eventName = "";
  let dataLines = [];
  let lastEventId = "";

  function resetEvent() {
    eventName = "";
    dataLines = [];
  }

  function dispatch() {
    if (!dataLines.length) {
      resetEvent();
      return;
    }

    const rawData = dataLines.join("\n");
    safeCall(onEvent, {
      type: eventName || "message",
      event: eventName || "message",
      data: parseEventData(rawData),
      rawData,
      id: lastEventId
    });
    resetEvent();
  }

  function processLine(line) {
    if (!line) {
      dispatch();
      return;
    }
    if (line.startsWith(":")) return;

    const separator = line.indexOf(":");
    const field = separator === -1 ? line : line.slice(0, separator);
    let value = separator === -1 ? "" : line.slice(separator + 1);
    if (value.startsWith(" ")) value = value.slice(1);

    if (field === "event") {
      eventName = value;
    } else if (field === "data") {
      dataLines.push(value);
    } else if (field === "id" && !value.includes("\0")) {
      lastEventId = value;
    } else if (field === "retry" && /^\d+$/.test(value)) {
      safeCall(onRetry, Number(value));
    }
  }

  function feed(chunk) {
    if (!chunk) return;
    let text = String(chunk);
    if (firstChunk) {
      firstChunk = false;
      if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    }
    buffer += text;

    while (buffer) {
      const match = /\r\n|\r|\n/.exec(buffer);
      if (!match) break;
      if (match[0] === "\r" && match.index === buffer.length - 1) break;
      processLine(buffer.slice(0, match.index));
      buffer = buffer.slice(match.index + match[0].length);
    }
  }

  function finish() {
    if (buffer.endsWith("\r")) buffer = buffer.slice(0, -1);
    if (buffer) processLine(buffer);
    dispatch();
    buffer = "";
  }

  return {
    feed,
    finish,
    getLastEventId: () => lastEventId
  };
}

export async function consumeSseStream(stream, { onEvent, onRetry, signal } = {}) {
  if (!stream?.getReader) {
    throw createTransportError("SSE response does not expose a readable stream.", { code: "SSE_STREAM_UNAVAILABLE" });
  }

  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const parser = createSseParser({ onEvent, onRetry });

  try {
    while (true) {
      if (signal?.aborted) {
        throw createTransportError("SSE connection was cancelled.", { name: "AbortError" });
      }
      const { done, value } = await reader.read();
      if (done) break;
      parser.feed(decoder.decode(value, { stream: true }));
    }
    parser.feed(decoder.decode());
    parser.finish();
    return { lastEventId: parser.getLastEventId() };
  } finally {
    reader.releaseLock?.();
  }
}

function meetingEventsUrl(baseUrl, meetingId) {
  const root = String(baseUrl || "").replace(/\/$/, "");
  return `${root}/api/meetings/${encodeURIComponent(meetingId)}/events`;
}

function isRetryableStatus(status) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

export function createAuthenticatedSse({
  baseUrl = "",
  meetingId,
  token,
  getToken,
  fetchImpl = globalThis.fetch,
  initialLastEventId = "",
  reconnectDelayMs = DEFAULT_RECONNECT_DELAY_MS,
  maxReconnectDelayMs = DEFAULT_MAX_RECONNECT_DELAY_MS,
  onEvent,
  onOpen,
  onStatus,
  onError,
  onClose
} = {}) {
  if (!meetingId) throw new TypeError("meetingId is required for the SSE connection.");
  if (typeof fetchImpl !== "function") throw new TypeError("fetch is not available in this browser.");

  let state = "idle";
  let stopped = false;
  let started = false;
  let attempts = 0;
  let retryFromServer = 0;
  let lastEventId = initialLastEventId || "";
  let controller = null;
  let reconnectTimer = 0;

  function emitStatus(status, details = {}) {
    state = status;
    safeCall(onStatus, { status, ...details });
  }

  function scheduleReconnect(error) {
    if (stopped) return;
    attempts += 1;
    const baseDelay = retryFromServer || reconnectDelayMs;
    const delay = Math.min(baseDelay * (2 ** Math.max(0, attempts - 1)), maxReconnectDelayMs);
    emitStatus("reconnecting", { attempt: attempts, delay, error });
    reconnectTimer = globalThis.setTimeout(() => {
      reconnectTimer = 0;
      void connect();
    }, delay);
  }

  async function connect() {
    if (stopped) return;
    emitStatus(attempts ? "reconnecting" : "connecting", { attempt: attempts });

    let resolvedToken;
    try {
      resolvedToken = typeof getToken === "function" ? await getToken() : token;
    } catch (error) {
      emitStatus("error", { error });
      safeCall(onError, error);
      stopped = true;
      return;
    }
    if (!resolvedToken) {
      const error = createTransportError("Authentication token is required for meeting events.", {
        code: "AUTH_TOKEN_REQUIRED"
      });
      emitStatus("error", { error });
      safeCall(onError, error);
      stopped = true;
      return;
    }

    controller = new AbortController();
    const headers = {
      Accept: "text/event-stream",
      Authorization: `Bearer ${resolvedToken}`,
      "Cache-Control": "no-cache"
    };
    if (lastEventId) headers["Last-Event-ID"] = lastEventId;

    try {
      const response = await fetchImpl(meetingEventsUrl(baseUrl, meetingId), {
        method: "GET",
        headers,
        cache: "no-store",
        signal: controller.signal
      });

      if (!response.ok) {
        const error = createTransportError(`Meeting event stream failed with HTTP ${response.status}.`, {
          code: "SSE_HTTP_ERROR",
          status: response.status
        });
        if (!isRetryableStatus(response.status)) {
          emitStatus("error", { error });
          safeCall(onError, error);
          stopped = true;
          return;
        }
        throw error;
      }

      attempts = 0;
      emitStatus("connected", { response });
      safeCall(onOpen, { response, lastEventId });

      await consumeSseStream(response.body, {
        signal: controller.signal,
        onRetry: (delay) => {
          retryFromServer = delay;
        },
        onEvent: (event) => {
          if (event.id) lastEventId = event.id;
          safeCall(onEvent, event);
        }
      });

      if (!stopped) scheduleReconnect();
    } catch (error) {
      if (stopped || error?.name === "AbortError" || controller?.signal.aborted) return;
      safeCall(onError, error);
      scheduleReconnect(error);
    }
  }

  function start() {
    if (started || stopped) return api;
    started = true;
    void connect();
    return api;
  }

  function close() {
    if (stopped) return;
    stopped = true;
    if (reconnectTimer) globalThis.clearTimeout(reconnectTimer);
    reconnectTimer = 0;
    controller?.abort();
    controller = null;
    emitStatus("closed", { lastEventId });
    safeCall(onClose, { lastEventId });
  }

  const api = {
    start,
    close,
    getState: () => state,
    getLastEventId: () => lastEventId
  };
  return api;
}

export function connectAuthenticatedSse(options) {
  return createAuthenticatedSse(options).start();
}

export function downmixChannels(channels) {
  const validChannels = Array.from(channels || []).filter((channel) => channel?.length !== undefined);
  if (!validChannels.length) return new Float32Array();
  if (validChannels.length === 1) return new Float32Array(validChannels[0]);

  const length = Math.min(...validChannels.map((channel) => channel.length));
  const mixed = new Float32Array(length);
  for (let index = 0; index < length; index += 1) {
    let sample = 0;
    for (const channel of validChannels) sample += channel[index];
    mixed[index] = sample / validChannels.length;
  }
  return mixed;
}

export function createFloat32Resampler(sourceRate, targetRate = 16000) {
  if (!(sourceRate > 0) || !(targetRate > 0)) {
    throw new TypeError("Audio sample rates must be positive numbers.");
  }

  const ratio = sourceRate / targetRate;
  let pending = new Float32Array();
  let position = 0;

  function process(input) {
    const samples = input instanceof Float32Array ? input : Float32Array.from(input || []);
    if (!samples.length) return new Float32Array();

    const merged = new Float32Array(pending.length + samples.length);
    merged.set(pending);
    merged.set(samples, pending.length);

    const output = [];
    while (position + 1 < merged.length) {
      const left = Math.floor(position);
      const fraction = position - left;
      output.push(merged[left] + ((merged[left + 1] - merged[left]) * fraction));
      position += ratio;
    }

    const consumed = Math.min(Math.floor(position), merged.length);
    pending = merged.slice(consumed);
    position -= consumed;
    return Float32Array.from(output);
  }

  function reset() {
    pending = new Float32Array();
    position = 0;
  }

  return { process, reset, sourceRate, targetRate };
}

export function float32ToPcm16Le(samples) {
  const input = samples instanceof Float32Array ? samples : Float32Array.from(samples || []);
  const output = new ArrayBuffer(input.length * 2);
  const view = new DataView(output);

  for (let index = 0; index < input.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, input[index]));
    const value = sample < 0 ? Math.round(sample * 0x8000) : Math.round(sample * 0x7fff);
    view.setInt16(index * 2, value, true);
  }
  return output;
}

export function buildRealtimeAsrUrl(baseUrl, meetingId, token, locationHref = globalThis.location?.href) {
  if (!meetingId) throw new TypeError("meetingId is required for realtime ASR.");
  if (!token) throw new TypeError("Authentication token is required for realtime ASR.");

  const root = String(baseUrl || "").replace(/\/$/, "");
  const fallbackBase = locationHref || undefined;
  let url;
  try {
    url = new URL(`${root}/api/meetings/${encodeURIComponent(meetingId)}/realtime_asr`, fallbackBase);
  } catch {
    throw new TypeError("A valid absolute baseUrl is required outside the browser.");
  }
  if (url.protocol === "http:") url.protocol = "ws:";
  if (url.protocol === "https:") url.protocol = "wss:";
  if (url.protocol !== "ws:" && url.protocol !== "wss:") {
    throw new TypeError("Realtime ASR requires an HTTP(S) or WebSocket base URL.");
  }
  url.searchParams.set("token", token);
  return url.toString();
}

export function createRealtimeAsrSession({
  baseUrl = "",
  meetingId,
  token,
  getToken,
  mediaDevices = globalThis.navigator?.mediaDevices,
  AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext,
  WebSocketClass = globalThis.WebSocket,
  targetSampleRate = 16000,
  bufferSize = 4096,
  pingIntervalMs = 15000,
  stopWaitMs = DEFAULT_STOP_WAIT_MS,
  mediaConstraints = {
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true
    }
  },
  onTranscript,
  onStatus,
  onError,
  onComplete,
  onMessage
} = {}) {
  if (!meetingId) throw new TypeError("meetingId is required for realtime ASR.");

  let lifecycle = "idle";
  let startPromise = null;
  let stopPromise = null;
  let stopping = false;
  let paused = false;
  let finalized = false;
  let mediaStream = null;
  let audioContext = null;
  let sourceNode = null;
  let processorNode = null;
  let mutedGainNode = null;
  let socket = null;
  let pingTimer = 0;
  let resolveStopSignal = null;

  function emitStatus(status, details = {}) {
    lifecycle = status;
    safeCall(onStatus, { type: "client_status", status, ...details });
  }

  function emitError(error, message) {
    safeCall(onError, error, message);
  }

  function ensureStartIsActive() {
    if (stopping || finalized) {
      throw createTransportError("Realtime ASR startup was cancelled.", { code: "ASR_START_CANCELLED" });
    }
  }

  async function releaseAudio() {
    if (processorNode) processorNode.onaudioprocess = null;
    for (const node of [sourceNode, processorNode, mutedGainNode]) {
      try {
        node?.disconnect();
      } catch {
        // Nodes may already be disconnected by the browser.
      }
    }
    sourceNode = null;
    processorNode = null;
    mutedGainNode = null;

    for (const track of mediaStream?.getTracks?.() || []) {
      try {
        track.stop();
      } catch {
        // A stopped media track is already fully released.
      }
    }
    mediaStream = null;
    paused = false;

    const context = audioContext;
    audioContext = null;
    if (context && context.state !== "closed") {
      try {
        await context.close();
      } catch {
        // Context shutdown is best-effort after tracks are stopped.
      }
    }
  }

  async function finalize({ closeSocket = true, status = "closed" } = {}) {
    if (finalized) return;
    finalized = true;
    if (pingTimer) globalThis.clearInterval(pingTimer);
    pingTimer = 0;
    await releaseAudio();

    if (closeSocket && socket && socket.readyState < 2) {
      try {
        socket.close(1000, "client cleanup");
      } catch {
        // The close event may have raced with cleanup.
      }
    }
    socket = null;
    resolveStopSignal?.();
    resolveStopSignal = null;
    emitStatus(status);
  }

  function handleSocketMessage(event) {
    let message;
    try {
      message = JSON.parse(typeof event.data === "string" ? event.data : String(event.data));
    } catch {
      const error = createTransportError("Realtime ASR returned an invalid JSON message.", {
        code: "ASR_INVALID_MESSAGE"
      });
      emitError(error, event.data);
      return;
    }

    safeCall(onMessage, message);
    if (message.type === "transcript") {
      safeCall(onTranscript, message);
    } else if (message.type === "asr_status") {
      safeCall(onStatus, { ...message, source: "server" });
    } else if (message.type === "asr_complete") {
      safeCall(onComplete, message);
      resolveStopSignal?.();
      if (!stopping) void finalize({ status: "complete" });
    } else if (message.type === "asr_error" || message.type === "error") {
      const error = createTransportError(message.error || "Realtime ASR failed.", {
        code: "ASR_SERVER_ERROR",
        payload: message
      });
      emitError(error, message);
    }
  }

  function sendPing() {
    if (!socket || socket.readyState !== 1) return false;
    socket.send(JSON.stringify({ type: "ping" }));
    return true;
  }

  async function start() {
    if (startPromise) return startPromise;
    if (finalized) throw createTransportError("This realtime ASR session is already closed.", { code: "ASR_CLOSED" });
    if (!mediaDevices?.getUserMedia) {
      throw createTransportError("Microphone capture is not supported in this browser.", { code: "MEDIA_UNAVAILABLE" });
    }
    if (!AudioContextClass) {
      throw createTransportError("Web Audio is not supported in this browser.", { code: "AUDIO_CONTEXT_UNAVAILABLE" });
    }
    if (!WebSocketClass) {
      throw createTransportError("WebSocket is not supported in this browser.", { code: "WEBSOCKET_UNAVAILABLE" });
    }

    startPromise = (async () => {
      emitStatus("requesting-microphone");
      const resolvedToken = typeof getToken === "function" ? await getToken() : token;
      if (!resolvedToken) {
        throw createTransportError("Authentication token is required for realtime ASR.", {
          code: "AUTH_TOKEN_REQUIRED"
        });
      }
      ensureStartIsActive();

      mediaStream = await mediaDevices.getUserMedia(mediaConstraints);
      ensureStartIsActive();
      audioContext = new AudioContextClass();
      if (!audioContext.createScriptProcessor) {
        throw createTransportError("This browser cannot provide PCM microphone frames.", {
          code: "SCRIPT_PROCESSOR_UNAVAILABLE"
        });
      }
      if (audioContext.state === "suspended") await audioContext.resume();
      ensureStartIsActive();

      const resampler = createFloat32Resampler(audioContext.sampleRate, targetSampleRate);
      sourceNode = audioContext.createMediaStreamSource(mediaStream);
      processorNode = audioContext.createScriptProcessor(bufferSize, 2, 1);
      mutedGainNode = audioContext.createGain();
      mutedGainNode.gain.value = 0;

      emitStatus("connecting");
      const socketUrl = buildRealtimeAsrUrl(baseUrl, meetingId, resolvedToken);
      socket = new WebSocketClass(socketUrl);
      socket.binaryType = "arraybuffer";

      await new Promise((resolve, reject) => {
        let settled = false;
        const rejectOnce = (error) => {
          if (settled) return;
          settled = true;
          reject(error);
        };

        socket.onopen = () => {
          if (settled) return;
          if (stopping || finalized) {
            rejectOnce(createTransportError("Realtime ASR startup was cancelled.", {
              code: "ASR_START_CANCELLED"
            }));
            return;
          }
          settled = true;
          socket.send(JSON.stringify({ type: "start", format: "pcm", sample_rate: targetSampleRate }));
          resolve();
        };
        socket.onmessage = handleSocketMessage;
        socket.onerror = () => {
          const error = createTransportError("Realtime ASR WebSocket connection failed.", {
            code: "ASR_WEBSOCKET_ERROR"
          });
          if (!settled) rejectOnce(error);
          else emitError(error);
        };
        socket.onclose = (event) => {
          if (!settled) {
            rejectOnce(stopping || finalized
              ? createTransportError("Realtime ASR startup was cancelled.", { code: "ASR_START_CANCELLED" })
              : createTransportError("Realtime ASR WebSocket closed before it was ready.", {
                code: "ASR_WEBSOCKET_CLOSED",
                closeCode: event.code
              }));
            return;
          }
          resolveStopSignal?.();
          if (!stopping && !finalized) {
            void finalize({ closeSocket: false, status: "disconnected" });
          }
        };
      });

      processorNode.onaudioprocess = (event) => {
        if (!socket || socket.readyState !== 1 || stopping || paused) return;
        const channels = [];
        for (let index = 0; index < event.inputBuffer.numberOfChannels; index += 1) {
          channels.push(event.inputBuffer.getChannelData(index));
        }
        const mono = downmixChannels(channels);
        const resampled = resampler.process(mono);
        if (resampled.length) socket.send(float32ToPcm16Le(resampled));

        for (let index = 0; index < event.outputBuffer.numberOfChannels; index += 1) {
          event.outputBuffer.getChannelData(index).fill(0);
        }
      };

      sourceNode.connect(processorNode);
      processorNode.connect(mutedGainNode);
      mutedGainNode.connect(audioContext.destination);
      if (pingIntervalMs > 0) pingTimer = globalThis.setInterval(sendPing, pingIntervalMs);
      emitStatus("recording", { sampleRate: targetSampleRate, sourceSampleRate: audioContext.sampleRate });
      return api;
    })().catch(async (error) => {
      if (error?.code !== "ASR_START_CANCELLED") emitError(error);
      await releaseAudio();
      await finalize({ status: "error" });
      throw error;
    });

    return startPromise;
  }

  async function pause() {
    if (finalized) throw createTransportError("This realtime ASR session is already closed.", { code: "ASR_CLOSED" });
    if (lifecycle !== "recording") return api;
    if (audioContext?.state === "running" && typeof audioContext.suspend === "function") {
      await audioContext.suspend();
    }
    paused = true;
    emitStatus("paused");
    return api;
  }

  async function resume() {
    if (finalized) throw createTransportError("This realtime ASR session is already closed.", { code: "ASR_CLOSED" });
    if (lifecycle !== "paused") return api;
    if (audioContext?.state === "suspended" && typeof audioContext.resume === "function") {
      await audioContext.resume();
    }
    paused = false;
    emitStatus("recording", { sampleRate: targetSampleRate, sourceSampleRate: audioContext?.sampleRate });
    return api;
  }

  async function stop({ waitForCompleteMs = stopWaitMs } = {}) {
    if (stopPromise) return stopPromise;
    stopPromise = (async () => {
      if (finalized) return;
      stopping = true;
      emitStatus("stopping");

      if (socket?.readyState === 1) {
        const completion = new Promise((resolve) => {
          resolveStopSignal = resolve;
        });
        socket.send(JSON.stringify({ type: "stop" }));
        await releaseAudio();
        await Promise.race([
          completion,
          new Promise((resolve) => globalThis.setTimeout(resolve, Math.max(0, waitForCompleteMs)))
        ]);
      } else {
        await releaseAudio();
      }
      await finalize({ status: "stopped" });
    })();
    return stopPromise;
  }

  async function close() {
    stopping = true;
    await finalize({ status: "closed" });
  }

  const api = {
    start,
    pause,
    resume,
    stop,
    close,
    sendPing,
    getState: () => lifecycle,
    isRecording: () => lifecycle === "recording",
    isPaused: () => lifecycle === "paused"
  };
  return api;
}
