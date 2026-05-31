import {
  AGENT_COMMAND,
  CHAT_STREAM_EVENT,
  type ChatStreamEvent,
} from "@digital-worker/agent-core-protocol";
import { Box, Static, Text, useApp, useInput } from "ink";
import TextInput from "ink-text-input";
import React, { useCallback, useState } from "react";

import { AgentHealthError, waitForAgentHealth } from "../agent-health.js";
import { ChatClientError, streamChat } from "../chat-client.js";
import {
  CommandClientError,
  formatCommandResponse,
  parseSlashCommand,
  sendCommand,
} from "../command-client.js";

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
      content: `Connected to ${agentName} at ${agentBaseUrl}${endpointNote}. Type a message and press Enter. Commands: /status, /abandon, /restart, /shutdown. Ctrl+C to quit.`,
    },
  ]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState("");
  const [busy, setBusy] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
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
      if (!trimmed) {
        return;
      }

      const command = parseSlashCommand(trimmed);
      if (command) {
        setError(undefined);
        setMessages((prev) => [
          ...prev,
          { id: crypto.randomUUID(), role: "user", content: trimmed },
        ]);
        setInput("");

        try {
          const response = await sendCommand({
            agentBaseUrl,
            clientId,
            command,
            sessionId,
          });
          setMessages((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              role: "system",
              content: formatCommandResponse(response),
            },
          ]);

          if (command === AGENT_COMMAND.RESTART) {
            setSessionId(undefined);
            setReconnecting(true);
            try {
              await waitForAgentHealth(agentBaseUrl);
              setMessages((prev) => [
                ...prev,
                {
                  id: crypto.randomUUID(),
                  role: "system",
                  content: "Agent restarted and is ready.",
                },
              ]);
            } catch (err) {
              const message =
                err instanceof AgentHealthError
                  ? err.message
                  : err instanceof Error
                    ? err.message
                    : "agent did not come back online";
              setError(message);
            } finally {
              setReconnecting(false);
            }
          }
        } catch (err) {
          const message =
            err instanceof CommandClientError
              ? err.message
              : err instanceof Error
                ? err.message
                : "command failed";
          setError(message);
        }
        return;
      }

      if (busy || reconnecting) {
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
        let activeSessionId = sessionId;
        try {
          await streamChat({
            agentBaseUrl,
            clientId,
            prompt: trimmed,
            sessionId: activeSessionId,
            onEvent,
          });
        } catch (err) {
          if (
            activeSessionId &&
            err instanceof ChatClientError &&
            err.message.includes("409")
          ) {
            activeSessionId = undefined;
            setSessionId(undefined);
            await streamChat({
              agentBaseUrl,
              clientId,
              prompt: trimmed,
              sessionId: undefined,
              onEvent,
            });
          } else {
            throw err;
          }
        }

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
    [agentBaseUrl, busy, clientId, reconnecting, sessionId],
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
          <Text color="gray">
            {reconnecting ? "↻ " : busy ? "⋯ " : "> "}
          </Text>
          <TextInput
            value={input}
            onChange={setInput}
            onSubmit={submit}
            placeholder={
              reconnecting
                ? "Waiting for agent restart…"
                : busy
                  ? "Waiting for agent…"
                  : "Message"
            }
          />
        </Box>
      </Box>
    </>
  );
}
