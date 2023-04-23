import { test, expect, jest } from "@jest/globals";

import { ChainTool } from "../chain.js";
import { LLMChain } from "../../chains/llm_chain.js";
import { PromptTemplate } from "../../prompts/prompt.js";
import { LLM } from "../../llms/base.js";

class FakeLLM extends LLM {
  _llmType() {
    return "fake";
  }

  async _call(prompt: string): Promise<string> {
    return prompt;
  }
}

test("chain tool with llm chain and local callback", async () => {
  const calls: string[] = [];
  const handleToolStart = jest.fn(() => {
    calls.push("tool start");
  });
  const handleToolEnd = jest.fn(() => {
    calls.push("tool end");
  });
  const handleLLMStart = jest.fn(() => {
    calls.push("llm start");
  });
  const handleLLMEnd = jest.fn(() => {
    calls.push("llm end");
  });
  const handleChainStart = jest.fn(() => {
    calls.push("chain start");
  });
  const handleChainEnd = jest.fn(() => {
    calls.push("chain end");
  });

  const chain = new LLMChain({
    llm: new FakeLLM({}),
    prompt: PromptTemplate.fromTemplate("hello world"),
  });
  const tool = new ChainTool({ chain, name: "fake", description: "fake" });
  const result = await tool.call("hi", [
    {
      handleToolStart,
      handleToolEnd,
      handleLLMStart,
      handleLLMEnd,
      handleChainStart,
      handleChainEnd,
    },
  ]);
  expect(result).toMatchInlineSnapshot(`"hello world"`);
  expect(handleToolStart).toBeCalledTimes(1);
  expect(handleToolEnd).toBeCalledTimes(1);
  expect(handleLLMStart).toBeCalledTimes(1);
  expect(handleLLMEnd).toBeCalledTimes(1);
  expect(handleChainStart).toBeCalledTimes(1);
  expect(handleChainEnd).toBeCalledTimes(1);
  expect(calls).toMatchInlineSnapshot(`
    [
      "tool start",
      "chain start",
      "llm start",
      "llm end",
      "chain end",
      "tool end",
    ]
  `);
});
