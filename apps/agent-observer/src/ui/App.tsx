import {
  OBSERVER_EVENT,
  type ObserverEvent,
} from "@digital-worker/agent-core-protocol";
import { Box, Newline, Static, Text, useApp, useInput } from "ink";
import React, { useCallback, useEffect, useRef, useState } from "react";

import { runObserverReconnectLoop } from "../observer-reconnect.js";
import {
  drainStreamingDelta,
  flushStreamingBuffer,
} from "./streaming-transcript.js";

export type AppProps = {
  agentName: string;
  agentBaseUrl: string;
  registeredEndpoint: string;
};

type LineKind = "system" | "job" | "thinking" | "text" | "tool" | "error";

type ConnectionPhase = "connecting" | "live" | "reconnecting";

type TranscriptLine = {
  id: string;
  kind: LineKind;
  text: string;
};

const MAX_LINES = 500;

function lineColor(kind: LineKind): string | undefined {
  switch (kind) {
    case "system":
      return "gray";
    case "job":
      return "cyan";
    case "thinking":
      return "magenta";
    case "text":
      return "green";
    case "tool":
      return "yellow";
    case "error":
      return "red";
    default:
      return undefined;
  }
}

function formatToolArgs(args: unknown): string {
  try {
    const json = JSON.stringify(args);
    return json.length > 80 ? `${json.slice(0, 80)}…` : json;
  } catch {
    return String(args);
  }
}

function TranscriptRow({ line }: { line: TranscriptLine }): React.ReactElement {
  return (
    <Text color={lineColor(line.kind)} wrap="wrap">
      {line.text}
    </Text>
  );
}

export function App({
  agentName,
  agentBaseUrl,
  registeredEndpoint,
}: AppProps): React.ReactElement {
  const { exit } = useApp();
  const abortRef = useRef<AbortController | undefined>();
  const sessionIdRef = useRef<string | undefined>();

  const endpointNote =
    registeredEndpoint !== agentBaseUrl
      ? ` (registered as ${registeredEndpoint})`
      : "";

  const [connectionPhase, setConnectionPhase] =
    useState<ConnectionPhase>("connecting");
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [activeJobId, setActiveJobId] = useState<string | undefined>();
  const [lines, setLines] = useState<TranscriptLine[]>([
    {
      id: "connecting",
      kind: "system",
      text: `Connecting to ${agentName} at ${agentBaseUrl}${endpointNote}…`,
    },
  ]);
  const [liveThinking, setLiveThinking] = useState("");
  const [liveText, setLiveText] = useState("");
  const liveThinkingRef = useRef("");
  const liveTextRef = useRef("");

  const pushLine = useCallback((kind: LineKind, text: string) => {
    setLines((prev) => [
      ...prev.slice(-(MAX_LINES - 1)),
      { id: crypto.randomUUID(), kind, text },
    ]);
  }, []);

  const commitStreamingLines = useCallback(
    (kind: "thinking" | "text", committed: string[]) => {
      if (committed.length === 0) {
        return;
      }
      setLines((prev) => {
        const next = [
          ...prev,
          ...committed.map((text) => ({
            id: crypto.randomUUID(),
            kind,
            text,
          })),
        ];
        return next.slice(-MAX_LINES);
      });
    },
    [],
  );

  const appendStreamingDelta = useCallback(
    (kind: "thinking" | "text", delta: string) => {
      const bufferRef = kind === "thinking" ? liveThinkingRef : liveTextRef;
      const setTail = kind === "thinking" ? setLiveThinking : setLiveText;
      const { buffer, committed } = drainStreamingDelta(
        bufferRef.current,
        delta,
      );
      bufferRef.current = buffer;
      setTail(buffer);
      commitStreamingLines(kind, committed);
    },
    [commitStreamingLines],
  );

  const flushLive = useCallback(() => {
    for (const kind of ["thinking", "text"] as const) {
      const bufferRef = kind === "thinking" ? liveThinkingRef : liveTextRef;
      const setTail = kind === "thinking" ? setLiveThinking : setLiveText;
      const { buffer, committed } = flushStreamingBuffer(bufferRef.current);
      bufferRef.current = buffer;
      setTail(buffer);
      commitStreamingLines(kind, committed);
    }
  }, [commitStreamingLines]);

  const handleEvent = useCallback(
    (event: ObserverEvent) => {
      switch (event.type) {
        case OBSERVER_EVENT.HELLO: {
          const previous = sessionIdRef.current;
          sessionIdRef.current = event.sessionId;
          setSessionId(event.sessionId);
          setConnectionPhase("live");
          setReconnectAttempt(0);

          if (!previous) {
            pushLine("system", `Connected · session ${event.sessionId}`);
          } else if (previous !== event.sessionId) {
            pushLine(
              "system",
              `Agent restarted · new session ${event.sessionId}`,
            );
          } else {
            pushLine("system", `Reconnected · session ${event.sessionId}`);
          }
          break;
        }
        case OBSERVER_EVENT.JOB_ENQUEUED:
          pushLine(
            "job",
            `queued ${event.kind} · ${event.clientId}: ${event.promptPreview}`,
          );
          break;
        case OBSERVER_EVENT.JOB_STARTED:
          flushLive();
          setActiveJobId(event.jobId);
          pushLine(
            "job",
            `started ${event.kind} · ${event.clientId}: ${event.promptPreview}`,
          );
          break;
        case OBSERVER_EVENT.JOB_FINISHED:
          flushLive();
          setActiveJobId((current) =>
            current === event.jobId ? undefined : current,
          );
          pushLine("job", `finished ${event.kind} → ${event.status}`);
          break;
        case OBSERVER_EVENT.TEXT_DELTA:
          appendStreamingDelta("text", event.delta);
          break;
        case OBSERVER_EVENT.THINKING_DELTA:
          appendStreamingDelta("thinking", event.delta);
          break;
        case OBSERVER_EVENT.TOOL_START:
          flushLive();
          pushLine(
            "tool",
            `→ ${event.toolName} ${formatToolArgs(event.args)}`,
          );
          break;
        case OBSERVER_EVENT.TOOL_END:
          pushLine(
            "tool",
            `← ${event.toolName} ${event.isError ? "failed" : "ok"}`,
          );
          break;
        default:
          break;
      }
    },
    [appendStreamingDelta, flushLive, pushLine],
  );

  const handleEventRef = useRef(handleEvent);
  handleEventRef.current = handleEvent;

  const flushLiveRef = useRef(flushLive);
  flushLiveRef.current = flushLive;

  const pushLineRef = useRef(pushLine);
  pushLineRef.current = pushLine;

  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;

    void runObserverReconnectLoop({
      agentBaseUrl,
      signal: controller.signal,
      onEvent: (event) => handleEventRef.current(event),
      onStreamClosed: () => {
        flushLiveRef.current();
        setConnectionPhase("reconnecting");
        setSessionId(undefined);
        pushLineRef.current("system", "Observer stream closed; reconnecting…");
      },
      onReconnecting: (attempt, delayMs) => {
        setConnectionPhase("reconnecting");
        setReconnectAttempt(attempt);
        setSessionId(undefined);
        pushLineRef.current(
          "system",
          `Reconnecting in ${Math.ceil(delayMs / 1000)}s (attempt ${attempt})…`,
        );
      },
      onTransientError: (message) => {
        setConnectionPhase("reconnecting");
        setSessionId(undefined);
        pushLineRef.current("error", message);
      },
    });

    return () => {
      controller.abort();
    };
  }, [agentBaseUrl]);

  useInput((_, key) => {
    if (key.ctrl) {
      abortRef.current?.abort();
      exit();
    }
  });

  const statusColor =
    connectionPhase === "live"
      ? "green"
      : connectionPhase === "reconnecting"
        ? "yellow"
        : "cyan";
  const statusLabel =
    connectionPhase === "live"
      ? "live"
      : connectionPhase === "reconnecting"
        ? `reconnecting (#${reconnectAttempt})`
        : "connecting";
  const statusParts = [
    statusLabel,
    sessionId ? `session ${sessionId.slice(0, 8)}…` : null,
    activeJobId ? `job ${activeJobId.slice(0, 8)}…` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <Static items={lines}>
        {(line) => <TranscriptRow key={line.id} line={line} />}
      </Static>

      <Newline />

      <Box flexDirection="column" flexShrink={0}>
        {liveThinking ? (
          <Text color="magenta" wrap="truncate">
            {liveThinking}
          </Text>
        ) : null}
        {liveText ? (
          <Text color="green" wrap="truncate">
            {liveText}
          </Text>
        ) : null}
        <Text wrap="truncate">
          <Text bold color="cyan">
            {agentName}
          </Text>
          <Text color="gray"> · </Text>
          <Text color={statusColor}>{statusParts}</Text>
          <Text color="gray"> · Ctrl+C to quit</Text>
        </Text>
      </Box>
    </>
  );
}
