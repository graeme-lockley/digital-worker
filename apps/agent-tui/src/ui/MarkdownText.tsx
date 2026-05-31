import { Text, type TextProps } from "ink";
import React, { useMemo } from "react";

import { renderMarkdownToAnsi } from "../markdown/render-markdown.js";

export type MarkdownTextProps = {
  content: string;
  color?: TextProps["color"];
};

export function MarkdownText({
  content,
  color,
}: MarkdownTextProps): React.ReactElement {
  const rendered = useMemo(() => renderMarkdownToAnsi(content), [content]);

  return (
    <Text wrap="wrap" color={color}>
      {rendered}
    </Text>
  );
}
