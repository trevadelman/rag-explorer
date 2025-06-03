#!/bin/bash

# RAG Benchmarking Script
# This script runs all benchmark presets in sequence

echo "🔍 Running all RAG benchmarks"
echo "============================"

# Function to run a benchmark and wait for it to complete
run_benchmark() {
    local preset=$1
    local output_file="results/benchmark-${preset}.json"
    
    echo -e "\n📊 Running ${preset} benchmark..."
    
    # Create results directory if it doesn't exist
    mkdir -p results
    
    # Run with only 1 query to make it faster for testing
    node scripts/run-benchmark.js --llm ${OPENAI_MODEL:-gpt-4.1-mini-2025-04-14} --embedding ${OPENAI_EMBEDDING_SMALL:-text-embedding-3-small} --content xeto --queries 1 --topk 1 --output ${output_file}
    
    # Check if the benchmark file was created
    if [ -f "${output_file}" ]; then
        echo "✅ ${preset} benchmark completed successfully"
        return 0
    else
        echo "❌ ${preset} benchmark failed"
        return 1
    fi
}

# Function to visualize benchmark results
visualize_benchmark() {
    local preset=$1
    local input_file="results/benchmark-${preset}.json"
    
    echo -e "\n📈 Generating visualization for ${preset} benchmark..."
    
    if [ -f "${input_file}" ]; then
        node scripts/visualize-results.js ${input_file} &
        # Store the PID of the visualization server
        VIZ_PID=$!
        
        # Wait a moment for the server to start
        sleep 2
        
        echo "✅ Visualization server started for ${preset} benchmark"
        echo "   Open http://localhost:3000/ in your browser to view the results"
        
        # Ask the user if they want to continue
        read -p "Press Enter to continue to the next benchmark (or Ctrl+C to exit)..."
        
        # Kill the visualization server
        kill ${VIZ_PID} 2>/dev/null
    else
        echo "❌ Cannot visualize ${preset} benchmark: ${input_file} not found"
    fi
}

# Run OpenAI benchmark
run_benchmark "openai"
openai_success=$?

# Run Gemini benchmark
run_benchmark "gemini"
gemini_success=$?

# Run fastest benchmark
run_benchmark "fastest"
fastest_success=$?

# Run cheapest benchmark
run_benchmark "cheapest"
cheapest_success=$?

# Run comprehensive benchmark with all strategies including combined search
echo -e "\n📊 Running comprehensive benchmark with all search strategies..."
mkdir -p results
node scripts/run-comprehensive-benchmark.js
comprehensive_success=$?

if [ ${comprehensive_success} -eq 0 ]; then
    echo "✅ Comprehensive benchmark completed successfully"
    
    # Visualize comprehensive benchmark
    echo -e "\n📈 Generating visualization for comprehensive benchmark..."
    node scripts/visualize-comprehensive.js results/comprehensive-benchmark.json &
    COMP_VIZ_PID=$!
    
    # Wait a moment for the server to start
    sleep 2
    
    echo "✅ Visualization server started for comprehensive benchmark"
    echo "   Open http://localhost:3000/ in your browser to view the results"
    
    # Ask the user if they want to continue
    read -p "Press Enter to continue (or Ctrl+C to exit)..."
    
    # Kill the visualization server
    kill ${COMP_VIZ_PID} 2>/dev/null
else
    echo "❌ Comprehensive benchmark failed"
fi

# Visualize successful benchmarks
echo -e "\n📊 Benchmark Results"
echo "===================="

if [ ${openai_success} -eq 0 ]; then
    visualize_benchmark "openai"
fi

if [ ${gemini_success} -eq 0 ]; then
    visualize_benchmark "gemini"
fi

if [ ${fastest_success} -eq 0 ]; then
    visualize_benchmark "fastest"
fi

if [ ${cheapest_success} -eq 0 ]; then
    visualize_benchmark "cheapest"
fi

echo -e "\n✅ All benchmarks complete!"
echo "Results are available in the following files:"
[ ${openai_success} -eq 0 ] && echo "- results/benchmark-openai.json"
[ ${gemini_success} -eq 0 ] && echo "- results/benchmark-gemini.json"
[ ${fastest_success} -eq 0 ] && echo "- results/benchmark-fastest.json"
[ ${cheapest_success} -eq 0 ] && echo "- results/benchmark-cheapest.json"
[ ${comprehensive_success} -eq 0 ] && echo "- results/comprehensive-benchmark.json"

echo -e "\nVisualizations are available in the following files:"
[ ${openai_success} -eq 0 ] && echo "- results/benchmark-openai-report.html"
[ ${gemini_success} -eq 0 ] && echo "- results/benchmark-gemini-report.html"
[ ${fastest_success} -eq 0 ] && echo "- results/benchmark-fastest-report.html"
[ ${cheapest_success} -eq 0 ] && echo "- results/benchmark-cheapest-report.html"
[ ${comprehensive_success} -eq 0 ] && echo "- results/comprehensive-benchmark-report.html"
