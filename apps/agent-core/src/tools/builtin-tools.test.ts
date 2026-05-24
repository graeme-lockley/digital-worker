import { describe, expect, it } from "vitest";

import {
  BUILTIN_PI_TOOL_NAMES,
  createBuiltinPiTools,
} from "./builtin-tools.js";

describe("createBuiltinPiTools", () => {
  it("returns read, write, bash, and ls tools", () => {
    const tools = createBuiltinPiTools(process.cwd());
    const names = tools.map((tool) => tool.name);
    expect(names).toEqual([...BUILTIN_PI_TOOL_NAMES]);
  });
});
