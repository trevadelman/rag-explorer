# RAG Benchmarking Tool

A comprehensive benchmarking tool for evaluating different Retrieval-Augmented Generation (RAG) configurations. This tool helps you compare the performance, cost, and accuracy of various combinations of:

- Search strategies (vector search, hybrid search)
- LLM models (OpenAI, Gemini)
- Embedding models (OpenAI small/large, Gemini stable/beta)
- Content types (xeto, markdown, documentation)

## Features

- Benchmark different search strategies:
  - Vector search: Traditional semantic similarity search
  - Hybrid search: Combining vector search with keyword/lexical search
- Measure LLM response quality and speed
- Calculate costs for different combinations
- Compare results across different configurations
- Generate visual reports with charts and tables
- Save detailed metrics for further analysis

## Prerequisites

- Node.js (v18 or later)
- PostgreSQL with pgvector extension
- OpenAI API key
- Google Gemini API key

## Installation

1. Clone this repository:
   ```
   git clone <repository-url>
   cd rag-explorer
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Configure your environment variables in `.env`:
   ```
   # API Keys
   GEMINI_API_KEY=your_gemini_api_key
   OPENAI_API_KEY=your_openai_api_key

   # Database
   DATABASE_URL=postgresql://username:password@localhost:5432/rag_poc_db

   # Model Configuration
   GEMINI_FLASH_MODEL=gemini-2.5-flash-preview-05-20
   GEMINI_PRO_MODEL=gemini-2.5-pro-preview-05-06
   OPENAI_MODEL=gpt-4.1-mini-2025-04-14
   OPENAI_EMBEDDING_SMALL=text-embedding-3-small
   OPENAI_EMBEDDING_LARGE=text-embedding-3-large
   GEMINI_EMBEDDING_STABLE=text-embedding-004
   GEMINI_EMBEDDING_BETA=gemini-embedding-exp-03-07
   ```

## Usage

### Testing Your Setup

Before running benchmarks, you can test your setup to ensure everything is configured correctly:

```bash
# Run the setup test
npm run test-setup
```

This will:
1. Check your environment variables
2. Test the database connection
3. Verify the pgvector extension
4. Validate the database schema
5. Test the OpenAI API connection
6. Test the Gemini API connection
7. Test vector search functionality

### Running Benchmarks

You have several options for running benchmarks:

#### 1. Basic Benchmarking

```bash
# Run with default options
node scripts/run-benchmark.js

# Run with specific LLM and embedding models
node scripts/run-benchmark.js --llm gpt-4.1-mini-2025-04-14 --embedding text-embedding-3-small

# Run with specific content type and number of queries
node scripts/run-benchmark.js --content xeto --queries 5

# List available configurations
node scripts/run-benchmark.js list

# Run a preset configuration
node scripts/run-benchmark.js preset fastest
```

#### 2. Running Multiple Benchmarks

```bash
# Run all preset benchmarks in sequence
./run-all-benchmarks.sh
```

#### 3. Comprehensive Benchmarking

For a complete comparison of all combinations:

```bash
# Run benchmarks for all combinations of models and content types
node scripts/run-comprehensive-benchmark.js
```

### Available Presets

- `all`: Run all combinations
- `openai`: Run only OpenAI models
- `gemini`: Run only Gemini models
- `fastest`: Run configuration optimized for speed
- `cheapest`: Run configuration optimized for cost
- `hybrid`: Run hybrid search with OpenAI models

### CLI Options

```
Usage:
  node run-benchmark.js [options]
  node run-benchmark.js list
  node run-benchmark.js preset <preset-name>

Options:
  -s, --strategy <name>   Search strategy to use (can be specified multiple times)
  -l, --llm <model>       LLM model to use (can be specified multiple times)
  -e, --embedding <model> Embedding model to use (can be specified multiple times)
  -c, --content <type>    Content type to use (can be specified multiple times)
  -q, --queries <number>  Number of test queries to run (default: 10)
  -k, --topk <number>     Number of top results to retrieve (default: 5)
  -o, --output <file>     Output file for results (default: benchmark-results.json)
  -h, --help              Show this help message
```

### Visualizing Results

After running benchmarks, you can visualize the results:

#### 1. Basic Visualization

```bash
# Visualize the default results
node scripts/visualize-results.js

# Visualize a specific results file
node scripts/visualize-results.js results/benchmark-openai.json
```

#### 2. Comprehensive Visualization

For a more detailed comparison of all benchmark results from a single run:

```bash
# Visualize comprehensive benchmark results
node scripts/visualize-comprehensive.js results/benchmark-2025-06-03T22-38-34.056Z.json
```

#### 3. Aggregated Visualization

To analyze and compare results across multiple benchmark runs:

```bash
# Visualize aggregated results from all benchmark files in the results directory
node scripts/visualize-aggregated.js
```

The visualization tools will:
1. Generate an HTML report file
2. Start a local web server at http://localhost:3000
3. Display interactive charts and tables with the benchmark results

### Key Benchmark Findings

Based on extensive benchmarking across different configurations:

#### Performance by Model
- **OpenAI GPT-4.1-mini** provides the best balance of accuracy and response time for most queries
- **Gemini Flash** offers faster response times but with slightly lower accuracy
- **Gemini Pro** provides high accuracy but with longer response times

#### Embedding Models
- **OpenAI text-embedding-3-small** offers the best balance of cost and performance
- **OpenAI text-embedding-3-large** provides slightly better accuracy but at higher cost
- **text-embedding-004** showed compatibility issues with some search strategies

#### Search Strategies
- **Hybrid search** (combining vector and keyword search) generally outperforms pure vector search for technical content
- **Combined search** provides the best accuracy for complex queries but at a higher computational cost
- **Vector search** is fastest but may miss relevant results for keyword-heavy queries

#### Content Types
- **Xeto** content showed the best retrieval performance for technical specifications
- **Markdown** content performed well for conceptual and descriptive queries
- **Documentation** content required larger context sizes for optimal performance

#### Context Size Impact
- **Small context** (1 document) is sufficient for simple, specific queries
- **Medium context** (5 documents) provides the best balance for most queries
- **Large context** (10 documents) improves accuracy for complex queries but increases cost and response time

## Database Schema

The tool works with a PostgreSQL database that has the following tables:

- `documents_1536`: For OpenAI small and Gemini models (1536 dimensions)
- `documents_3072`: For OpenAI large model (3072 dimensions)
- `documents_768`: For Gemini stable model (768 dimensions)
- `benchmark_results`: Stores benchmark results
- `test_queries`: Contains test queries for benchmarking
- `performance_metrics`: Stores detailed performance metrics

## Metrics Measured

- **Search time**: Time taken to perform search (vector search, hybrid search, etc.)
- **LLM response time**: Time taken for the LLM to generate a response
- **Total end-to-end time**: Total time from query to response
- **Cost**: Estimated cost for embedding generation and LLM response (with separate input/output pricing)
- **Result quality**: Percentage of expected keywords found in the response

## Example Workflow

1. Test your setup:
   ```
   npm run test-setup
   ```

2. Run a comprehensive benchmark with all search strategies:
   ```
   node scripts/run-comprehensive-benchmark.js
   ```

3. Visualize the comprehensive results from this run:
   ```
   node scripts/visualize-comprehensive.js results/benchmark-[timestamp].json
   ```

4. Run another benchmark with different parameters:
   ```
   node scripts/run-benchmark.js --strategy hybrid-search --llm gpt-4.1-mini-2025-04-14 --embedding text-embedding-3-large --content documentation --queries 10
   ```

5. Compare different search strategies in a third benchmark:
   ```
   node scripts/run-benchmark.js --strategy vector-search --strategy hybrid-search --llm gemini-2.5-flash-preview-05-20 --embedding text-embedding-3-small --content xeto --queries 5
   ```

6. Visualize aggregated results from all benchmark runs:
   ```
   node scripts/visualize-aggregated.js
   ```

7. Open http://localhost:3000 in your browser to view the aggregated report with insights across all benchmark runs

## Project Structure

- `scripts/`: Directory containing all JavaScript scripts
  - `strategies/`: Directory containing search strategy implementations
    - `vector-search.js`: Vector search strategy implementation
    - `hybrid-search.js`: Hybrid search strategy implementation
    - `index.js`: Strategy factory for creating and managing search strategies
  - `rag-benchmark.js`: Core benchmarking functionality
  - `run-benchmark.js`: CLI tool for running individual benchmarks
  - `run-comprehensive-benchmark.js`: Tool for running all combinations
  - `visualize-results.js`: Tool for visualizing individual benchmark results
  - `visualize-comprehensive.js`: Tool for visualizing comprehensive benchmark results
  - `visualize-aggregated.js`: Tool for aggregating and visualizing results across multiple benchmark runs
  - `test-setup.js`: Tool for testing the environment setup
- `results/`: Directory where benchmark results and reports are saved
- `run-all-benchmarks.sh`: Script to run all preset benchmarks
- `pocDocs/`: Documentation and code from the original POC

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License
