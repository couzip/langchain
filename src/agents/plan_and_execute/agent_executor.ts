import { BaseChain, ChainInputs } from "../../chains/base.js";
import {
  BasePlanner,
  BaseStepContainer,
  BaseStepExecutor,
  ListStepContainer,
  LLMPlanner,
  ChainStepExecutor,
} from "./base.js";
import { AgentExecutor } from "../executor.js";
import { PLANNER_CHAT_PROMPT } from "./prompt.js";
import { ChainValues } from "../../schema/index.js";
import { BaseLanguageModel } from "../../base_language/index.js";
import { CallbackManagerForChainRun } from "../../callbacks/manager.js";
import { LLMChain } from "../../chains/llm_chain.js";
import { PlanOutputParser } from "./outputParser.js";
import { Tool } from "../../tools/base.js";
import { ChatAgent } from "../chat/index.js";
import { SerializedLLMChain } from "../../chains/serde.js";

export interface PlanAndExecuteAgentExecutorInput extends ChainInputs {
  planner: BasePlanner;
  stepExecutor: BaseStepExecutor;
  stepContainer?: BaseStepContainer;
  inputKey?: string;
  outputKey?: string;
}

export class PlanAndExecuteAgentExecutor extends BaseChain {
  private planner: BasePlanner;

  private stepExecutor: BaseStepExecutor;

  private stepContainer: BaseStepContainer = new ListStepContainer();

  private inputKey = "input";

  private outputKey = "output";

  constructor(input: PlanAndExecuteAgentExecutorInput) {
    super(input);
    this.planner = input.planner;
    this.stepExecutor = input.stepExecutor;
    this.stepContainer = input.stepContainer ?? this.stepContainer;
    this.inputKey = input.inputKey ?? this.inputKey;
    this.outputKey = input.outputKey ?? this.outputKey;
  }

  get inputKeys() {
    return [this.inputKey];
  }

  get outputKeys() {
    return [this.outputKey];
  }

  static getDefaultPlanner(llm: BaseLanguageModel) {
    const plannerLlmChain = new LLMChain({
      llm,
      prompt: PLANNER_CHAT_PROMPT,
      verbose: true,
    });
    return new LLMPlanner(plannerLlmChain, new PlanOutputParser());
  }

  static getDefaultStepExecutor(llm: BaseLanguageModel, tools: Tool[]) {
    const agent = ChatAgent.fromLLMAndTools(llm, tools, {
      humanMessageTemplate: `Previous steps: {previous_steps}\n\nCurrent objective: {current_step}\n\n{agent_scratchpad}`,
    });
    return new ChainStepExecutor(
      AgentExecutor.fromAgentAndTools({
        agent,
        tools,
      })
    );
  }

  static fromLLMAndTools(llm: BaseLanguageModel, tools: Tool[]) {
    const executor = new PlanAndExecuteAgentExecutor({
      planner: PlanAndExecuteAgentExecutor.getDefaultPlanner(llm),
      stepExecutor: PlanAndExecuteAgentExecutor.getDefaultStepExecutor(
        llm,
        tools
      ),
    });
    return executor;
  }

  /** @ignore */
  async _call(
    inputs: ChainValues,
    runManager?: CallbackManagerForChainRun
  ): Promise<ChainValues> {
    const plan = await this.planner.plan(inputs.input, runManager?.getChild());
    if (!plan.steps?.length) {
      throw new Error(
        "Could not create and parse a plan to answer your question - please try again."
      );
    }
    for (const step of plan.steps) {
      const newInputs = {
        ...inputs,
        previous_steps: JSON.stringify(this.stepContainer.getSteps()),
        current_step: step.text,
      };
      const response = await this.stepExecutor.step(newInputs);
      this.stepContainer.addStep(step, response);
    }
    return { [this.outputKey]: this.stepContainer.getFinalResponse() };
  }

  _chainType() {
    return "agent_executor" as const;
  }

  serialize(): SerializedLLMChain {
    throw new Error("Cannot serialize an AgentExecutor");
  }
}
