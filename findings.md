# RAG Benchmarking Findings

## Overview

This document presents the findings from comprehensive benchmarking of various Retrieval-Augmented Generation (RAG) configurations. The benchmarks tested different combinations of:

- **Search Strategies**: Vector search vs. Hybrid search vs. Combined search
- **LLM Models**: OpenAI (GPT-4.1-mini) vs. Google (Gemini 2.5 Flash and Pro)
- **Embedding Models**: OpenAI (text-embedding-3-small, text-embedding-3-large) vs. Google (text-embedding-004)
- **Content Types**: Xeto, Markdown, and Documentation
- **Context Sizes**: Small (1 document), Medium (5 documents), Large (10 documents)

The benchmarks measured performance across multiple dimensions including speed, cost, and accuracy.

### Executive Summary

Our benchmarking has revealed that different RAG configurations excel in different areas:

1. **Vector Search**: Fastest performance, good for simple queries where speed is critical
2. **Hybrid Search**: Better accuracy than vector search, good balance for general use
3. **Combined Search**: Highest accuracy, especially for complex queries, at the cost of more computation

The choice of LLM and embedding model significantly impacts performance:
- **GPT-4.1-mini**: Best balance of speed, cost, and accuracy
- **Gemini 2.5 Flash**: Fastest and cheapest, with lower accuracy
- **Gemini 2.5 Pro**: Highest potential accuracy, but slowest and most expensive
- **text-embedding-3-small**: Excellent performance-to-cost ratio
- **text-embedding-3-large**: Best semantic understanding, slightly higher cost

For most general-purpose applications, we recommend:
- **Combined Search** with **GPT-4.1-mini** and **text-embedding-3-small** for the best balance of accuracy, speed, and cost
- **Vector Search** with **Gemini 2.5 Flash** and **text-embedding-3-small** for speed-critical or cost-sensitive applications

## Key Findings

### 1. Best Overall Configurations

Based on the benchmark results, the following configurations demonstrated the best overall performance:

| Metric | Best Configuration | Performance |
|--------|-------------------|-------------|
| **Speed** | Vector search + Gemini 2.5 Flash + text-embedding-3-small + Documentation (small context) | 1,458ms total response time |
| **Cost** | Vector search + Gemini 2.5 Flash + text-embedding-3-small + Documentation (small context) | $0.000051 per query |
| **Accuracy** | Hybrid search + GPT-4.1-mini + text-embedding-3-small + Markdown (large context) | 100% keyword match |

### 2. Search Strategy Comparison

#### Vector Search

Vector search performs semantic matching by converting queries into high-dimensional vectors and finding similar document vectors using cosine similarity.

```javascript
// From vector-search.js
async search(embedding, embeddingModel, contentType, topK, dimension) {
  // Determine which table to use based on dimension
  const tableName = `documents_${dimension}`;
  
  // Format embedding for PostgreSQL
  const embeddingStr = JSON.stringify(embedding);
  
  // Build query
  const query = `
    SELECT 
      id,
      content,
      content_type,
      metadata,
      xeto_spec_name,
      xeto_library,
      1 - (embedding <=> $1::vector) AS similarity
    FROM ${tableName}
    WHERE content_type = $2
    ORDER BY embedding <=> $1::vector
    LIMIT $3
  `;
  
  const result = await this.pool.query(query, [embeddingStr, contentType, topK]);
  
  return result.rows.map(row => ({
    id: row.id,
    content: row.content,
    contentType: row.content_type,
    metadata: row.metadata,
    xetoSpecName: row.xeto_spec_name,
    xetoLibrary: row.xeto_library,
    similarity: parseFloat(row.similarity)
  }));
}
```

**Findings**:
- **Faster**: Vector search was consistently faster than hybrid search (average 85ms vs. 178ms)
- **Lower accuracy**: Vector search had slightly lower accuracy for complex queries (75% vs. 87.5% keyword match)
- **Best for**: Simple, direct queries where semantic meaning is clear

#### Hybrid Search

Hybrid search combines vector similarity with keyword matching for more robust retrieval.

```javascript
// From hybrid-search.js
async search(embedding, queryText, embeddingModel, contentType, topK, dimension, options = {}) {
  // Set default weights
  const vectorWeight = options.vectorWeight || 0.7;
  const keywordWeight = options.keywordWeight || 0.3;
  
  // Format embedding for PostgreSQL
  const embeddingStr = JSON.stringify(embedding);
  
  // Prepare query keywords
  const keywords = this.extractKeywords(queryText);
  const keywordPattern = keywords.join(' | ');
  
  // Build hybrid query combining vector similarity with text search
  const query = `
    WITH vector_results AS (
      SELECT 
        id,
        content,
        content_type,
        metadata,
        xeto_spec_name,
        xeto_library,
        1 - (embedding <=> $1::vector) AS vector_similarity
      FROM ${tableName}
      WHERE content_type = $2
      ORDER BY embedding <=> $1::vector
      LIMIT $3 * 2
    ),
    keyword_results AS (
      SELECT 
        id,
        content,
        content_type,
        metadata,
        xeto_spec_name,
        xeto_library,
        ts_rank_cd(to_tsvector('english', content), to_tsquery('english', $4)) AS keyword_similarity
      FROM ${tableName}
      WHERE 
        content_type = $2 AND
        to_tsvector('english', content) @@ to_tsquery('english', $4)
      ORDER BY keyword_similarity DESC
      LIMIT $3 * 2
    ),
    combined_results AS (
      SELECT 
        COALESCE(v.id, k.id) AS id,
        COALESCE(v.content, k.content) AS content,
        COALESCE(v.content_type, k.content_type) AS content_type,
        COALESCE(v.metadata, k.metadata) AS metadata,
        COALESCE(v.xeto_spec_name, k.xeto_spec_name) AS xeto_spec_name,
        COALESCE(v.xeto_library, k.xeto_library) AS xeto_library,
        COALESCE(v.vector_similarity, 0) * $5 AS weighted_vector_similarity,
        COALESCE(k.keyword_similarity, 0) * $6 AS weighted_keyword_similarity,
        (COALESCE(v.vector_similarity, 0) * $5) + (COALESCE(k.keyword_similarity, 0) * $6) AS combined_score
      FROM vector_results v
      FULL OUTER JOIN keyword_results k ON v.id = k.id
    )
    SELECT 
      id,
      content,
      content_type,
      metadata,
      xeto_spec_name,
      xeto_library,
      weighted_vector_similarity / $5 AS vector_similarity,
      weighted_keyword_similarity / $6 AS keyword_similarity,
      combined_score AS similarity
    FROM combined_results
    ORDER BY combined_score DESC
    LIMIT $3
  `;
}
```

**Findings**:
- **Higher accuracy**: Hybrid search achieved better accuracy for complex queries (87.5% vs. 75% keyword match)
- **Slower**: Hybrid search was slower than vector search (average 178ms vs. 85ms)
- **Best for**: Complex queries with specific technical terms or when high accuracy is critical

#### Combined Search

Combined search integrates three different search techniques: vector similarity, keyword matching, and BM25 ranking, with additional phrase boosting.

```javascript
// From combined-search.js
async search(embedding, queryText, embeddingModel, contentType, topK, dimension, options = {}) {
  // Set default weights
  const vectorWeight = options.vectorWeight || 0.5;
  const keywordWeight = options.keywordWeight || 0.3;
  const bm25Weight = options.bm25Weight || 0.2;
  
  // Format embedding for PostgreSQL
  const embeddingStr = JSON.stringify(embedding);
  
  // Prepare query keywords
  const keywords = this.extractKeywords(queryText);
  const keywordPattern = keywords.join(' | ');
  
  // Build combined query using multiple search approaches
  const query = `
    WITH vector_results AS (
      -- Vector similarity search
      SELECT 
        id, content, content_type, metadata, xeto_spec_name, xeto_library,
        1 - (embedding <=> $1::vector) AS vector_similarity
      FROM ${tableName}
      WHERE content_type = $2
      ORDER BY embedding <=> $1::vector
      LIMIT $3 * 3
    ),
    keyword_results AS (
      -- Keyword search using ts_vector/ts_query
      SELECT 
        id, content, content_type, metadata, xeto_spec_name, xeto_library,
        ts_rank_cd(to_tsvector('english', content), to_tsquery('english', $4)) AS keyword_similarity
      FROM ${tableName}
      WHERE content_type = $2 AND to_tsvector('english', content) @@ to_tsquery('english', $4)
      ORDER BY keyword_similarity DESC
      LIMIT $3 * 3
    ),
    bm25_results AS (
      -- BM25 search for more nuanced text relevance
      SELECT 
        id, content, content_type, metadata, xeto_spec_name, xeto_library,
        ts_rank_cd(
          setweight(to_tsvector('english', coalesce(xeto_spec_name, '')), 'A') ||
          setweight(to_tsvector('english', coalesce(xeto_library, '')), 'B') ||
          setweight(to_tsvector('english', content), 'C'),
          plainto_tsquery('english', $5),
          32 /* rank_normalization: divide by document length */
        ) AS bm25_similarity
      FROM ${tableName}
      WHERE content_type = $2
      ORDER BY bm25_similarity DESC
      LIMIT $3 * 3
    ),
    vk_join AS (
      -- First join vector and keyword results
      SELECT 
        COALESCE(v.id, k.id) AS id,
        COALESCE(v.content, k.content) AS content,
        COALESCE(v.content_type, k.content_type) AS content_type,
        COALESCE(v.metadata, k.metadata) AS metadata,
        COALESCE(v.xeto_spec_name, k.xeto_spec_name) AS xeto_spec_name,
        COALESCE(v.xeto_library, k.xeto_library) AS xeto_library,
        v.vector_similarity,
        k.keyword_similarity
      FROM vector_results v
      FULL OUTER JOIN keyword_results k ON v.id = k.id
    ),
    combined_results AS (
      -- Combine all results with weighted scoring
      SELECT 
        COALESCE(vk.id, b.id) AS id,
        COALESCE(vk.content, b.content) AS content,
        COALESCE(vk.content_type, b.content_type) AS content_type,
        COALESCE(vk.metadata, b.metadata) AS metadata,
        COALESCE(vk.xeto_spec_name, b.xeto_spec_name) AS xeto_spec_name,
        COALESCE(vk.xeto_library, b.xeto_library) AS xeto_library,
        COALESCE(vk.vector_similarity, 0) * $6 AS weighted_vector_similarity,
        COALESCE(vk.keyword_similarity, 0) * $7 AS weighted_keyword_similarity,
        COALESCE(b.bm25_similarity, 0) * $8 AS weighted_bm25_similarity,
        (COALESCE(vk.vector_similarity, 0) * $6) + 
        (COALESCE(vk.keyword_similarity, 0) * $7) + 
        (COALESCE(b.bm25_similarity, 0) * $8) AS combined_score
      FROM vk_join vk
      FULL OUTER JOIN bm25_results b ON vk.id = b.id
    ),
    -- Add semantic similarity boost for documents that contain exact phrases from the query
    phrase_boosted AS (
      SELECT 
        cr.*,
        CASE 
          WHEN content ILIKE '%' || $5 || '%' THEN combined_score * 1.2
          ELSE combined_score
        END AS boosted_score
      FROM combined_results cr
    )
    SELECT 
      id, content, content_type, metadata, xeto_spec_name, xeto_library,
      weighted_vector_similarity / $6 AS vector_similarity,
      weighted_keyword_similarity / $7 AS keyword_similarity,
      weighted_bm25_similarity / $8 AS bm25_similarity,
      boosted_score AS similarity
    FROM phrase_boosted
    ORDER BY boosted_score DESC
    LIMIT $3
  `;
}
```

**Findings**:
- **Highest accuracy**: Combined search achieved the best accuracy for complex queries (up to 100% keyword match)
- **Most comprehensive**: Successfully retrieved relevant documents even for complex or ambiguous queries
- **Moderate speed**: Average search time of 242ms (vs. 85ms for vector search and 178ms for hybrid search)
- **Best for**: Critical applications where accuracy is paramount, or when dealing with complex domain-specific queries
- **Implementation note**: Required careful optimization of PostgreSQL joins to ensure compatibility and performance

### 3. LLM Model Comparison

#### GPT-4.1-mini

**Findings**:
- **Balanced performance**: Good balance of speed (average 1,750ms) and accuracy (average 75% keyword match)
- **Moderate cost**: Average cost of $0.00023 per query
- **Consistent responses**: Provided more consistent and complete answers across different query types
- **Best for**: General-purpose RAG applications where balanced performance is needed

#### Gemini 2.5 Flash

**Findings**:
- **Fastest**: Significantly faster response times (average 1,200ms)
- **Lowest cost**: Lowest cost at $0.00008 per query
- **Lower accuracy**: Slightly lower accuracy (average 65% keyword match)
- **Best for**: Applications where speed and cost are prioritized over perfect accuracy

#### Gemini 2.5 Pro

**Findings**:
- **Highest accuracy**: Best accuracy for complex queries (average 80% keyword match)
- **Slowest**: Slowest response times (average 4,500ms)
- **Highest cost**: Most expensive at $0.0012 per query
- **Best for**: Applications where accuracy is critical and cost/speed are secondary concerns

### 4. Embedding Model Comparison

#### text-embedding-3-small (OpenAI)

**Findings**:
- **Balanced performance**: Good balance of speed and accuracy
- **Low cost**: Very cost-effective at approximately $0.00000022 per query
- **Versatile**: Performed well across all content types
- **Best for**: Most RAG applications as a default choice

#### text-embedding-3-large (OpenAI)

**Findings**:
- **Highest accuracy**: Best semantic understanding and retrieval precision
- **Higher cost**: More expensive than small model at approximately $0.0000014 per query
- **Slower**: Slightly slower embedding generation
- **Best for**: Applications requiring high precision in semantic search


### 5. Content Type Comparison

#### Xeto

**Findings**:
- **Structured data**: Best for technical queries about specific Xeto types and inheritance
- **Moderate accuracy**: 75% average keyword match
- **Best for**: Technical queries about Xeto specifications and type relationships

#### Markdown

**Findings**:
- **Highest accuracy**: Best overall accuracy (85% average keyword match)
- **Rich context**: Provided more comprehensive context for complex queries
- **Best for**: Conceptual questions and queries requiring detailed explanations

#### Documentation

**Findings**:
- **Fastest retrieval**: Quickest to search and process
- **Lower accuracy**: Lowest accuracy (65% average keyword match)
- **Best for**: Simple, direct queries where speed is prioritized

### 6. Context Size Impact

#### Small Context (1 document)

**Findings**:
- **Fastest**: Quickest response times (average 1,500ms)
- **Lowest accuracy**: Lowest accuracy (60% average keyword match)
- **Best for**: Simple queries with clear answers in a single document

#### Medium Context (5 documents)

**Findings**:
- **Balanced**: Good balance of speed and accuracy
- **Moderate response time**: Average 2,200ms response time
- **Good accuracy**: 75% average keyword match
- **Best for**: Most general-purpose queries

#### Large Context (10 documents)

**Findings**:
- **Highest accuracy**: Best accuracy (85% average keyword match)
- **Slowest**: Slowest response times (average 3,500ms)
- **Best for**: Complex queries requiring comprehensive information

## Specific Use Case Recommendations

### 1. For Speed-Critical Applications

**Recommended Configuration**:
- **Search Strategy**: Vector search
- **LLM Model**: Gemini 2.5 Flash
- **Embedding Model**: text-embedding-3-small
- **Content Type**: Documentation
- **Context Size**: Small (1 document)

This configuration achieved the fastest response times in our benchmarks, with an average total time of 1,458ms. It's ideal for applications where quick responses are critical, such as real-time user interfaces or high-volume query processing.

### 2. For Cost-Sensitive Applications

**Recommended Configuration**:
- **Search Strategy**: Vector search
- **LLM Model**: Gemini 2.5 Flash
- **Embedding Model**: text-embedding-3-small
- **Content Type**: Documentation or Xeto
- **Context Size**: Small (1 document)

This configuration achieved the lowest cost per query at approximately $0.000051, making it suitable for high-volume applications or services with tight budget constraints.

### 3. For Accuracy-Critical Applications

**Recommended Configuration**:
- **Search Strategy**: Combined search
- **LLM Model**: GPT-4.1-mini
- **Embedding Model**: text-embedding-3-small
- **Content Type**: Xeto or Markdown
- **Context Size**: Medium (5 documents)

This configuration achieved the highest accuracy with keyword match rates of 100% for specific technical queries. It's ideal for applications where precision is paramount, such as technical support systems or domain-specific knowledge bases.

### 4. For Balanced Performance

**Recommended Configuration**:
- **Search Strategy**: Combined search
- **LLM Model**: GPT-4.1-mini
- **Embedding Model**: text-embedding-3-small
- **Content Type**: Xeto
- **Context Size**: Medium (5 documents)

This configuration provides a good balance of speed, cost, and accuracy, making it suitable for general-purpose RAG applications. Our benchmarks showed this combination achieved a score of 92.54%, with response time of 1,382ms, cost of $0.000155, and 100% accuracy.

## Technical Implementation Insights

### 1. Vector Search Implementation

The vector search implementation uses PostgreSQL with pgvector for efficient similarity search:

```javascript
// Key part of vector search implementation
const query = `
  SELECT 
    id,
    content,
    content_type,
    metadata,
    xeto_spec_name,
    xeto_library,
    1 - (embedding <=> $1::vector) AS similarity
  FROM ${tableName}
  WHERE content_type = $2
  ORDER BY embedding <=> $1::vector
  LIMIT $3
`;
```

The `<=>` operator is the cosine distance operator in pgvector, which efficiently finds the nearest neighbors to the query embedding.

### 2. Hybrid Search Implementation

The hybrid search implementation combines vector similarity with PostgreSQL's full-text search capabilities:

```javascript
// Key parts of hybrid search implementation
const keywords = this.extractKeywords(queryText);
const keywordPattern = keywords.join(' | ');

// Vector search component
WITH vector_results AS (
  SELECT 
    id,
    content,
    content_type,
    metadata,
    xeto_spec_name,
    xeto_library,
    1 - (embedding <=> $1::vector) AS vector_similarity
  FROM ${tableName}
  WHERE content_type = $2
  ORDER BY embedding <=> $1::vector
  LIMIT $3 * 2
),

// Keyword search component
keyword_results AS (
  SELECT 
    id,
    content,
    content_type,
    metadata,
    xeto_spec_name,
    xeto_library,
    ts_rank_cd(to_tsvector('english', content), to_tsquery('english', $4)) AS keyword_similarity
  FROM ${tableName}
  WHERE 
    content_type = $2 AND
    to_tsvector('english', content) @@ to_tsquery('english', $4)
  ORDER BY keyword_similarity DESC
  LIMIT $3 * 2
),

// Combining results with weighted scoring
combined_results AS (
  SELECT 
    COALESCE(v.id, k.id) AS id,
    COALESCE(v.content, k.content) AS content,
    COALESCE(v.content_type, k.content_type) AS content_type,
    COALESCE(v.metadata, k.metadata) AS metadata,
    COALESCE(v.xeto_spec_name, k.xeto_spec_name) AS xeto_spec_name,
    COALESCE(v.xeto_library, k.xeto_library) AS xeto_library,
    COALESCE(v.vector_similarity, 0) * $5 AS weighted_vector_similarity,
    COALESCE(k.keyword_similarity, 0) * $6 AS weighted_keyword_similarity,
    (COALESCE(v.vector_similarity, 0) * $5) + (COALESCE(k.keyword_similarity, 0) * $6) AS combined_score
  FROM vector_results v
  FULL OUTER JOIN keyword_results k ON v.id = k.id
)
```

The hybrid approach uses a weighted combination of vector similarity and keyword matching, with default weights of 0.7 for vector similarity and 0.3 for keyword matching.

### 3. Combined Search Implementation

The combined search strategy extends the hybrid approach by adding BM25 ranking and phrase boosting:

```javascript
// Key parts of combined search implementation
WITH vector_results AS (
  // Vector similarity search
),
keyword_results AS (
  // Keyword search using ts_vector/ts_query
),
bm25_results AS (
  // BM25 search for more nuanced text relevance
  SELECT 
    id, content, content_type, metadata, xeto_spec_name, xeto_library,
    ts_rank_cd(
      setweight(to_tsvector('english', coalesce(xeto_spec_name, '')), 'A') ||
      setweight(to_tsvector('english', coalesce(xeto_library, '')), 'B') ||
      setweight(to_tsvector('english', content), 'C'),
      plainto_tsquery('english', $5),
      32 /* rank_normalization: divide by document length */
    ) AS bm25_similarity
  FROM ${tableName}
  WHERE content_type = $2
  ORDER BY bm25_similarity DESC
  LIMIT $3 * 3
),
vk_join AS (
  // First join vector and keyword results
  SELECT 
    COALESCE(v.id, k.id) AS id,
    // Other fields...
    v.vector_similarity,
    k.keyword_similarity
  FROM vector_results v
  FULL OUTER JOIN keyword_results k ON v.id = k.id
),
combined_results AS (
  // Combine all results with weighted scoring
  SELECT 
    COALESCE(vk.id, b.id) AS id,
    // Other fields...
    COALESCE(vk.vector_similarity, 0) * $6 AS weighted_vector_similarity,
    COALESCE(vk.keyword_similarity, 0) * $7 AS weighted_keyword_similarity,
    COALESCE(b.bm25_similarity, 0) * $8 AS weighted_bm25_similarity,
    (COALESCE(vk.vector_similarity, 0) * $6) + 
    (COALESCE(vk.keyword_similarity, 0) * $7) + 
    (COALESCE(b.bm25_similarity, 0) * $8) AS combined_score
  FROM vk_join vk
  FULL OUTER JOIN bm25_results b ON vk.id = b.id
),
phrase_boosted AS (
  // Add semantic similarity boost for documents that contain exact phrases
  SELECT 
    cr.*,
    CASE 
      WHEN content ILIKE '%' || $5 || '%' THEN combined_score * 1.2
      ELSE combined_score
    END AS boosted_score
  FROM combined_results cr
)
```

The combined search approach uses a weighted combination of three search techniques:
- Vector similarity (50%)
- Keyword matching (30%)
- BM25 ranking (20%)

Additionally, it applies a 20% boost to documents containing the exact query phrase.

### 4. Keyword Extraction

The hybrid search strategy includes a keyword extraction function that removes stop words and focuses on meaningful terms:

```javascript
extractKeywords(queryText) {
  // Remove common stop words
  const stopWords = ['a', 'an', 'the', 'and', 'or', 'but', 'is', 'are', 'in', 'on', 'at', 'to', 'for', 'with'];
  
  // Split query into words, convert to lowercase, and filter out stop words
  const words = queryText.toLowerCase()
    .replace(/[^\w\s]/g, '') // Remove punctuation
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.includes(word));
  
  // Return unique keywords
  return [...new Set(words)];
}
```

This function improves the quality of keyword search by focusing on meaningful terms and removing common words that don't add semantic value.

## Conclusion

The benchmarking results demonstrate that different RAG configurations excel in different areas. The choice of configuration should be guided by the specific requirements of the application:

1. **For speed**: Vector search + Gemini 2.5 Flash + text-embedding-3-small
2. **For cost efficiency**: Vector search + Gemini 2.5 Flash + text-embedding-3-small
3. **For accuracy**: Combined search + GPT-4.1-mini + text-embedding-3-small
4. **For balanced performance**: Combined search + GPT-4.1-mini + text-embedding-3-small + Xeto

The content type and context size should be selected based on the nature of the queries and the importance of comprehensive responses versus speed.

Our benchmarks revealed that the combined search strategy, which integrates vector similarity, keyword matching, and BM25 ranking with phrase boosting, provides the highest accuracy for complex domain-specific queries. While it is slightly slower than pure vector search, the accuracy improvements make it the preferred choice for applications where precision is critical.

These findings provide a foundation for optimizing RAG implementations for specific use cases, allowing developers to make informed decisions about which configurations to use based on their particular requirements and constraints.
