import { BaseMemory } from "../memory/base.js";
import { ChainValues } from "../schema/index.js";
import { CallbackManager } from "../callbacks/index.js";
import { SerializedBaseChain } from "./serde.js";
import { BaseLangChain } from "../base_language/index.js";
import { CallbackManagerForChainRun } from "../callbacks/manager.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type LoadValues = Record<string, any>;

export interface ChainInputs {
  memory?: BaseMemory;
  verbose?: boolean;
  callbackManager?: CallbackManager;
}

/**
 * Base interface that all chains must implement.
 */
export abstract class BaseChain extends BaseLangChain implements ChainInputs {
  memory?: BaseMemory;

  constructor(
    memory?: BaseMemory,
    verbose?: boolean,
    callbackManager?: CallbackManager
  ) {
    super(verbose, callbackManager);
    this.memory = memory;
  }

  /**
   * Run the core logic of this chain and return the output
   */
  abstract _call(
    values: ChainValues,
    runManager?: CallbackManagerForChainRun
  ): Promise<ChainValues>;

  /**
   * Return the string type key uniquely identifying this class of chain.
   */
  abstract _chainType(): string;

  /**
   * Return a json-like object representing this chain.
   */
  abstract serialize(): SerializedBaseChain;

  abstract get inputKeys(): string[];

  abstract get outputKeys(): string[];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async run(input: any, callbackManager?: CallbackManager): Promise<string> {
    const isKeylessInput = this.inputKeys.length === 1;
    if (!isKeylessInput) {
      throw new Error(
        `Chain ${this._chainType()} expects multiple inputs, cannot use 'run' `
      );
    }
    const values = { [this.inputKeys[0]]: input };
    const returnValues = await this.call(values, callbackManager);
    const keys = Object.keys(returnValues);
    if (keys.length === 1) {
      return returnValues[keys[0]];
    }
    throw new Error(
      "return values have multiple keys, `run` only supported when one key currently"
    );
  }

  /**
   * Run the core logic of this chain and add to output if desired.
   *
   * Wraps {@link _call} and handles memory.
   */
  async call(
    values: ChainValues,
    callbackManager?: CallbackManager
  ): Promise<ChainValues> {
    const fullValues = { ...values } as typeof values;
    if (!(this.memory == null)) {
      const newValues = await this.memory.loadMemoryVariables(values);
      for (const [key, value] of Object.entries(newValues)) {
        fullValues[key] = value;
      }
    }
    const runManager = await this.configureCallbackManager(
      callbackManager
    )?.handleChainStart({ name: this._chainType() }, fullValues);
    let outputValues;
    try {
      outputValues = await this._call(fullValues, runManager);
    } catch (e) {
      await runManager?.handleChainError(e);
      throw e;
    }
    await runManager?.handleChainEnd(outputValues);
    if (!(this.memory == null)) {
      await this.memory.saveContext(values, outputValues);
    }
    return outputValues;
  }

  /**
   * Call the chain on all inputs in the list
   */
  async apply(
    inputs: ChainValues[],
    callbackManagers?: CallbackManager[]
  ): Promise<ChainValues> {
    return Promise.all(
      inputs.map(async (i, idx) => this.call(i, callbackManagers?.[idx]))
    );
  }

  /**
   * Load a chain from a json-like object describing it.
   */
  static async deserialize(
    data: SerializedBaseChain,
    values: LoadValues = {}
  ): Promise<BaseChain> {
    switch (data._type) {
      case "llm_chain": {
        const { LLMChain } = await import("./llm_chain.js");
        return LLMChain.deserialize(data);
      }
      case "simple_sequential_chain": {
        const { SimpleSequentialChain } = await import(
          "./simple_sequential_chain.js"
        );
        return SimpleSequentialChain.deserialize(data);
      }
      case "stuff_documents_chain": {
        const { StuffDocumentsChain } = await import("./combine_docs_chain.js");
        return StuffDocumentsChain.deserialize(data);
      }
      case "map_reduce_documents_chain": {
        const { MapReduceDocumentsChain } = await import(
          "./combine_docs_chain.js"
        );
        return MapReduceDocumentsChain.deserialize(data);
      }
      case "refine_documents_chain": {
        const { RefineDocumentsChain } = await import(
          "./combine_docs_chain.js"
        );
        return RefineDocumentsChain.deserialize(data);
      }
      case "vector_db_qa": {
        const { VectorDBQAChain } = await import("./vector_db_qa.js");
        return VectorDBQAChain.deserialize(data, values);
      }
      default:
        throw new Error(
          `Invalid prompt type in config: ${
            (data as SerializedBaseChain)._type
          }`
        );
    }
  }
}
