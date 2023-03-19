import { test, expect, jest } from "@jest/globals";
import { v4 as uuidv4 } from "uuid";
import {
  BaseTracer,
  LLMRun,
  ChainRun,
  ToolRun,
  TracerSession,
  TracerSessionCreate,
} from "../tracers.js";

const TEST_SESSION_ID = 2023;
const _DATE = 1620000000000;

// eslint-disable-next-line tree-shaking/no-side-effects-in-initialization
Date.now = jest.fn(() => _DATE);

class FakeTracer extends BaseTracer {
  runs: (LLMRun | ChainRun | ToolRun)[] = [];

  constructor() {
    super();
  }

  protected persistRun(run: LLMRun | ChainRun | ToolRun): Promise<void> {
    this.runs.push(run);
    return Promise.resolve();
  }

  protected persistSession(
    session: TracerSessionCreate
  ): Promise<TracerSession> {
    return Promise.resolve({
      id: TEST_SESSION_ID,
      ...session,
    });
  }

  async loadSession(sessionName: string): Promise<TracerSession> {
    return Promise.resolve({
      id: TEST_SESSION_ID,
      name: sessionName,
      start_time: _DATE,
    });
  }

  async loadDefaultSession(): Promise<TracerSession> {
    return Promise.resolve({
      id: TEST_SESSION_ID,
      name: "default",
      start_time: _DATE,
    });
  }
}

test("Test LLMRun", async () => {
  const compareRun: LLMRun = {
    start_time: _DATE,
    end_time: _DATE,
    execution_order: 1,
    serialized: { name: "test" },
    session_id: TEST_SESSION_ID,
    prompts: ["test"],
    type: "llm",
    response: { generations: [] },
  };
  const tracer = new FakeTracer();
  await tracer.newSession();
  const runId = uuidv4();
  await tracer.handleLLMStart({ name: "test" }, ["test"], runId);
  await tracer.handleLLMEnd({ generations: [] }, runId);
  expect(tracer.runs.length).toBe(1);
  const run = tracer.runs[0];
  expect(run).toEqual(compareRun);
});

test("Test LLM Run no start", async () => {
  const tracer = new FakeTracer();
  await tracer.newSession();
  const runId = uuidv4();
  await expect(tracer.handleLLMEnd({ generations: [] }, runId)).rejects.toThrow(
    "No LLM run to end"
  );
});

test("Test Chain Run", async () => {
  const compareRun: ChainRun = {
    start_time: _DATE,
    end_time: _DATE,
    execution_order: 1,
    serialized: { name: "test" },
    session_id: TEST_SESSION_ID,
    inputs: { foo: "bar" },
    outputs: { foo: "bar" },
    type: "chain",
    child_llm_runs: [],
    child_chain_runs: [],
    child_tool_runs: [],
  };
  const tracer = new FakeTracer();
  await tracer.newSession();
  const runId = uuidv4();
  await tracer.handleChainStart({ name: "test" }, { foo: "bar" }, runId);
  await tracer.handleChainEnd({ foo: "bar" }, runId);
  expect(tracer.runs.length).toBe(1);
  const run = tracer.runs[0];
  expect(run).toEqual(compareRun);
});

test("Test Tool Run", async () => {
  const compareRun: ToolRun = {
    start_time: _DATE,
    end_time: _DATE,
    execution_order: 1,
    serialized: { name: "test" },
    session_id: TEST_SESSION_ID,
    tool_input: "test",
    output: "output",
    type: "tool",
    action: JSON.stringify({ name: "test" }),
    child_llm_runs: [],
    child_chain_runs: [],
    child_tool_runs: [],
  };
  const tracer = new FakeTracer();
  await tracer.newSession();
  const runId = uuidv4();
  await tracer.handleToolStart({ name: "test" }, "test", runId);
  await tracer.handleToolEnd("output", runId);
  expect(tracer.runs.length).toBe(1);
  const run = tracer.runs[0];
  expect(run).toEqual(compareRun);
});

test("Test nested runs", async () => {
  const compareRun: ChainRun = {
    child_chain_runs: [],
    child_llm_runs: [
      {
        end_time: 1620000000000,
        execution_order: 4,
        prompts: ["test"],
        response: {
          generations: [[]],
        },
        serialized: {
          name: "test2",
        },
        session_id: 2023,
        start_time: 1620000000000,
        type: "llm",
      },
    ],
    child_tool_runs: [
      {
        action: '{"name":"test"}',
        child_chain_runs: [],
        child_llm_runs: [
          {
            end_time: 1620000000000,
            execution_order: 3,
            prompts: ["test"],
            response: {
              generations: [[]],
            },
            serialized: {
              name: "test",
            },
            session_id: 2023,
            start_time: 1620000000000,
            type: "llm",
          },
        ],
        child_tool_runs: [],
        end_time: 1620000000000,
        execution_order: 2,
        output: "output",
        serialized: {
          name: "test",
        },
        session_id: 2023,
        start_time: 1620000000000,
        tool_input: "test",
        type: "tool",
      },
    ],
    end_time: 1620000000000,
    execution_order: 1,
    inputs: {
      foo: "bar",
    },
    outputs: {
      foo: "bar",
    },
    serialized: {
      name: "test",
    },
    session_id: 2023,
    start_time: 1620000000000,
    type: "chain",
  };

  const tracer = new FakeTracer();
  await tracer.newSession();
  const chainRunId = uuidv4();
  const toolRunId = uuidv4();
  const llmRunId = uuidv4();
  await tracer.handleChainStart({ name: "test" }, { foo: "bar" }, chainRunId);
  await tracer.handleToolStart({ name: "test" }, "test", toolRunId);
  await tracer.handleLLMStart({ name: "test" }, ["test"], llmRunId);
  await tracer.handleLLMEnd({ generations: [[]] }, llmRunId);
  await tracer.handleToolEnd("output", toolRunId);
  const llmRunId2 = uuidv4();
  await tracer.handleLLMStart({ name: "test2" }, ["test"], llmRunId2);
  await tracer.handleLLMEnd({ generations: [[]] }, llmRunId2);
  await tracer.handleChainEnd({ foo: "bar" }, chainRunId);
  expect(tracer.runs.length).toBe(1);
  expect(tracer.runs[0]).toEqual(compareRun);

  const llmRunId3 = uuidv4();
  await tracer.handleLLMStart({ name: "test" }, ["test"], llmRunId3);
  await tracer.handleLLMEnd({ generations: [[]] }, llmRunId3);
  expect(tracer.runs.length).toBe(2);
});
