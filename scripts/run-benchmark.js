#!/usr/bin/env node

/**
 * RAG Benchmarking CLI
 * 
 * This script provides a command-line interface for running RAG benchmarks
 * with different configurations.
 */

import { runBenchmark, closeConnection } from './rag-benchmark.js';
import { parseArgs } from 'node:util';
import 'dotenv/config';
import chalk from 'chalk';

// Parse command line arguments
const options = {
  strategy: {
    type: 'string',
    short: 's',
    multiple: true,
    default: []
  },
  llm: {
    type: 'string',
    short: 'l',
    multiple: true,
    default: []
  },
  embedding: {
    type: 'string',
    short: 'e',
    multiple: true,
    default: []
  },
  content: {
    type: 'string',
    short: 'c',
    multiple: true,
    default: []
  },
  queries: {
    type: 'string',
    short: 'q',
    default: '10'
  },
  topk: {
    type: 'string',
    short: 'k',
    default: '5'
  },
  output: {
    type: 'string',
    short: 'o',
    default: 'results/benchmark-results.json'
  },
  help: {
    type: 'boolean',
    short: 'h',
    default: false
  }
};

// Available models and strategies
const availableModels = {
  strategy: ['vector-search', 'hybrid-search'],
  llm: [
    process.env.OPENAI_MODEL,
    process.env.GEMINI_FLASH_MODEL,
    process.env.GEMINI_PRO_MODEL
  ],
  embedding: [
    process.env.OPENAI_EMBEDDING_SMALL,
    process.env.OPENAI_EMBEDDING_LARGE,
    process.env.GEMINI_EMBEDDING_STABLE,
    process.env.GEMINI_EMBEDDING_BETA
  ],
  content: ['xeto', 'markdown', 'documentation']
};

// Parse arguments
const { values, positionals } = parseArgs({ options, allowPositionals: true });

// Show help
if (values.help) {
  showHelp();
  process.exit(0);
}

// Show available configurations
if (positionals.includes('list')) {
  showAvailableConfigurations();
  process.exit(0);
}

// Run specific preset
if (positionals.includes('preset')) {
  const presetName = positionals[positionals.indexOf('preset') + 1];
  if (!presetName) {
    console.error('Error: No preset name provided');
    console.log('Available presets: all, openai, gemini, fastest, cheapest');
    process.exit(1);
  }
  
  runPreset(presetName);
  process.exit(0);
}

// Prepare benchmark options
const benchmarkOptions = {
  searchStrategies: values.strategy.length > 0 ? values.strategy : availableModels.strategy,
  llmModels: values.llm.length > 0 ? values.llm : availableModels.llm,
  embeddingModels: values.embedding.length > 0 ? values.embedding : availableModels.embedding,
  contentTypes: values.content.length > 0 ? values.content : availableModels.content,
  numQueries: parseInt(values.queries, 10),
  topK: parseInt(values.topk, 10),
  outputFile: values.output
};

// Run benchmark
console.log(chalk.bold.blue('🔍 Starting benchmark with options:'));
console.log(chalk.cyan(JSON.stringify(benchmarkOptions, null, 2)));

runBenchmark(benchmarkOptions)
  .catch(error => {
    console.error(chalk.bold.red('❌ Benchmark failed:'), error);
    process.exit(1);
  })
  .finally(() => {
    closeConnection();
  });

/**
 * Show help message
 */
function showHelp() {
  console.log(chalk.bold.green(`
🔍 RAG Benchmarking CLI

${chalk.white('Usage:')}
  ${chalk.yellow('node run-benchmark.js [options]')}
  ${chalk.yellow('node run-benchmark.js list')}
  ${chalk.yellow('node run-benchmark.js preset <preset-name>')}

${chalk.white('Options:')}
  ${chalk.cyan('-s, --strategy')} ${chalk.gray('<name>')}   Search strategy to use (can be specified multiple times)
  ${chalk.cyan('-l, --llm')} ${chalk.gray('<model>')}       LLM model to use (can be specified multiple times)
  ${chalk.cyan('-e, --embedding')} ${chalk.gray('<model>')} Embedding model to use (can be specified multiple times)
  ${chalk.cyan('-c, --content')} ${chalk.gray('<type>')}    Content type to use (can be specified multiple times)
  ${chalk.cyan('-q, --queries')} ${chalk.gray('<number>')}  Number of test queries to run (default: 10)
  ${chalk.cyan('-k, --topk')} ${chalk.gray('<number>')}     Number of top results to retrieve (default: 5)
  ${chalk.cyan('-o, --output')} ${chalk.gray('<file>')}     Output file for results (default: benchmark-results.json)
  ${chalk.cyan('-h, --help')}              Show this help message

${chalk.white('Commands:')}
  ${chalk.magenta('list')}                    List available models and content types
  ${chalk.magenta('preset')} ${chalk.gray('<name>')}           Run a predefined benchmark preset
                          Available presets: all, openai, gemini, fastest, cheapest

${chalk.white('Examples:')}
  ${chalk.gray('# Run with default options')}
  ${chalk.yellow('node run-benchmark.js')}

  ${chalk.gray('# Run with specific LLM and embedding models')}
  ${chalk.yellow(`node run-benchmark.js --llm ${process.env.OPENAI_MODEL} --embedding ${process.env.OPENAI_EMBEDDING_SMALL}`)}

  ${chalk.gray('# Run with specific content type and number of queries')}
  ${chalk.yellow('node run-benchmark.js --content xeto --queries 5')}

  ${chalk.gray('# List available configurations')}
  ${chalk.yellow('node run-benchmark.js list')}

  ${chalk.gray('# Run a preset configuration')}
  ${chalk.yellow('node run-benchmark.js preset fastest')}
`));
}

/**
 * Show available configurations
 */
function showAvailableConfigurations() {
  console.log(chalk.bold.blue('🔍 Available Configurations:'));
  console.log(chalk.blue('========================\n'));
  
  console.log(chalk.bold.cyan('Search Strategies:'));
  availableModels.strategy.forEach(strategy => console.log(`  - ${chalk.green(strategy)}`));
  
  console.log(chalk.bold.cyan('\nLLM Models:'));
  availableModels.llm.forEach(model => console.log(`  - ${chalk.green(model)}`));
  
  console.log(chalk.bold.cyan('\nEmbedding Models:'));
  availableModels.embedding.forEach(model => console.log(`  - ${chalk.green(model)}`));
  
  console.log(chalk.bold.cyan('\nContent Types:'));
  availableModels.content.forEach(type => console.log(`  - ${chalk.green(type)}`));
  
  console.log(chalk.bold.cyan('\nPresets:'));
  console.log(`  - ${chalk.yellow('all')}: ${chalk.gray('Run all combinations')}`);
  console.log(`  - ${chalk.yellow('openai')}: ${chalk.gray('Run only OpenAI models')}`);
  console.log(`  - ${chalk.yellow('gemini')}: ${chalk.gray('Run only Gemini models')}`);
  console.log(`  - ${chalk.yellow('fastest')}: ${chalk.gray('Run configuration optimized for speed')}`);
  console.log(`  - ${chalk.yellow('cheapest')}: ${chalk.gray('Run configuration optimized for cost')}`);
  console.log(`  - ${chalk.yellow('hybrid')}: ${chalk.gray('Run hybrid search configuration')}`);
}

/**
 * Run a preset configuration
 */
function runPreset(presetName) {
  const presets = {
    all: {
      searchStrategies: availableModels.strategy,
      llmModels: availableModels.llm,
      embeddingModels: availableModels.embedding,
      contentTypes: availableModels.content,
      numQueries: 10,
      topK: 5,
      outputFile: 'results/benchmark-all.json'
    },
    openai: {
      searchStrategies: availableModels.strategy,
      llmModels: [process.env.OPENAI_MODEL],
      embeddingModels: [process.env.OPENAI_EMBEDDING_SMALL, process.env.OPENAI_EMBEDDING_LARGE],
      contentTypes: availableModels.content,
      numQueries: 10,
      topK: 5,
      outputFile: 'results/benchmark-openai.json'
    },
    gemini: {
      searchStrategies: availableModels.strategy,
      llmModels: [process.env.GEMINI_FLASH_MODEL, process.env.GEMINI_PRO_MODEL],
      embeddingModels: [process.env.GEMINI_EMBEDDING_STABLE, process.env.GEMINI_EMBEDDING_BETA],
      contentTypes: availableModels.content,
      numQueries: 10,
      topK: 5,
      outputFile: 'results/benchmark-gemini.json'
    },
    fastest: {
      searchStrategies: ['vector-search'],
      llmModels: [process.env.GEMINI_FLASH_MODEL],
      embeddingModels: [process.env.OPENAI_EMBEDDING_SMALL],
      contentTypes: ['xeto'],
      numQueries: 5,
      topK: 3,
      outputFile: 'results/benchmark-fastest.json'
    },
    cheapest: {
      searchStrategies: ['vector-search'],
      llmModels: [process.env.GEMINI_FLASH_MODEL],
      embeddingModels: [process.env.GEMINI_EMBEDDING_STABLE],
      contentTypes: ['xeto'],
      numQueries: 5,
      topK: 3,
      outputFile: 'results/benchmark-cheapest.json'
    },
    hybrid: {
      searchStrategies: ['hybrid-search'],
      llmModels: [process.env.OPENAI_MODEL],
      embeddingModels: [process.env.OPENAI_EMBEDDING_LARGE],
      contentTypes: ['documentation'],
      numQueries: 5,
      topK: 3,
      outputFile: 'results/benchmark-hybrid.json'
    }
  };
  
  if (!presets[presetName]) {
    console.error(chalk.bold.red(`❌ Error: Unknown preset '${presetName}'`));
    console.log(chalk.yellow('Available presets: all, openai, gemini, fastest, cheapest, hybrid'));
    process.exit(1);
  }
  
  console.log(chalk.bold.green(`🚀 Running preset: ${chalk.yellow(presetName)}`));
  console.log(chalk.cyan(JSON.stringify(presets[presetName], null, 2)));
  
  runBenchmark(presets[presetName])
    .catch(error => {
      console.error('Benchmark failed:', error);
      process.exit(1);
    })
    .finally(() => {
      closeConnection();
    });
}
