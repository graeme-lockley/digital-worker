import {
  CHAT_STREAM_EVENT,
  type ChatStreamEvent,
} from "@digital-worker/agent-core-protocol";
import { Box, Static, Text, useApp, useInput } from "ink";
import TextInput from "ink-text-input";
import React, { useCallback, useState } from "react";

import { ChatClientError, streamChat } from "../chat-client.js";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
};

export type AppProps = {
  agentName: string;
  agentBaseUrl: string;
  registeredEndpoint: string;
  clientId: string;
};

function MessageBlock({
  message,
  agentName,
}: {
  message: ChatMessage;
  agentName: string;
}): React.ReactElement {
  const label =
    message.role === "user"
      ? "You"
      : message.role === "assistant"
        ? agentName
        : "—";
  const labelColor =
    message.role === "user"
      ? "cyan"
      : message.role === "assistant"
        ? "green"
        : "gray";

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold color={labelColor}>
        {label}
      </Text>
      <Text wrap="wrap" color={message.role === "system" ? "gray" : undefined}>
        {message.content}
      </Text>
    </Box>
  );
}

export function App({
  agentName,
  agentBaseUrl,
  registeredEndpoint,
  clientId,
}: AppProps): React.ReactElement {
  const { exit } = useApp();

  const endpointNote =
    registeredEndpoint !== agentBaseUrl
      ? ` (registered as ${registeredEndpoint})`
      : "";

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "system-connected",
      role: "system",
      content: `Connected to ${agentName} at ${agentBaseUrl}${endpointNote}. Type a message and press Enter. Ctrl+C to quit.`,
    },
  ]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState("");
  const [busy, setBusy] = useState(false);
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();

  useInput((_, key) => {
    if (key.ctrl && input === "" && !busy) {
      exit();
    }
  });

  const submit = useCallback(
    async (prompt: string) => {
      const trimmed = prompt.trim();
      if (!trimmed || busy) {
        return;
      }

      setError(undefined);
      setBusy(true);
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "user", content: trimmed },
      ]);
      setInput("");
      setStreaming("");

      let assistantText = "";

      const onEvent = (event: ChatStreamEvent): void => {
        if (event.type === CHAT_STREAM_EVENT.TOKEN) {
          if (!sessionId) {
            setSessionId(event.sessionId);
          }
          assistantText += event.token;
          setStreaming(assistantText);
        } else if (event.type === CHAT_STREAM_EVENT.DONE) {
          setSessionId(event.sessionId);
        } else if (event.type === CHAT_STREAM_EVENT.ERROR) {
          setError(`${event.code}: ${event.message}`);
        }
      };

      try {
        await streamChat({
          agentBaseUrl,
          clientId,
          prompt: trimmed,
          sessionId,
          onEvent,
        });

        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: assistantText || "(no response)",
          },
        ]);
      } catch (err) {
        const message =
          err instanceof ChatClientError
            ? err.message
            : err instanceof Error
              ? err.message
              : "chat failed";
        setError(message);
      } finally {
        setStreaming("");
        setBusy(false);
      }
    },
    [agentBaseUrl, busy, clientId, sessionId],
  );

  return (
    <>
      <Static items={messages}>
        {(message) => (
          <MessageBlock key={message.id} message={message} agentName={agentName} />
        )}
      </Static>

      <Box flexDirection="column" flexShrink={0}>
        {streaming ? (
          <Box flexDirection="column" marginBottom={1}>
            <Text bold color="green">
              {agentName}
            </Text>
            <Text wrap="wrap">{streaming}</Text>
          </Box>
        ) : null}
        {error ? (
          <Box marginBottom={1}>
            <Text color="red" wrap="wrap">
              {error}
            </Text>
          </Box>
        ) : null}
        <Box borderStyle="single" borderColor="gray" paddingX={1}>
          <Text color="gray">{busy ? "⋯ " : "> "}</Text>
          <TextInput
            value={input}
            onChange={setInput}
            onSubmit={submit}
            placeholder={busy ? "Waiting for agent…" : "Message"}
          />
        </Box>
      </Box>
    </>
  );
}
