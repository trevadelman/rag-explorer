/**
 * Combined Search Strategy for RAG
 * 
 * This module implements a comprehensive search strategy that combines multiple
 * approaches (vector search, hybrid search, and potentially others) to provide
 * the most accurate results possible, at the cost of speed and efficiency.
 */

import { Pool } from 'pg';

/**
 * CombinedSearchStrategy class
 */
export class CombinedSearchStrategy {
  /**
   * Constructor
   * @param {Object} dbConfig - Database configuration
   */
  constructor(dbConfig) {
    this.pool = new Pool(dbConfig);
    this.name = 'combined-search';
  }

  /**
   * Perform combined search using multiple strategies
   * @param {Array} embedding - Query embedding vector
   * @param {String} queryText - Original query text for keyword search
   * @param {String} embeddingModel - Embedding model used
   * @param {String} contentType - Content type to search
   * @param {Number} topK - Number of results to return
   * @param {Number} dimension - Embedding dimension
   * @param {Object} options - Additional options
   * @param {Number} options.vectorWeight - Weight for vector search (default: 0.5)
   * @param {Number} options.keywordWeight - Weight for keyword search (default: 0.3)
   * @param {Number} options.bm25Weight - Weight for BM25 search (default: 0.2)
   * @returns {Array} Search results
   */
  async search(embedding, queryText, embeddingModel, contentType, topK, dimension, options = {}) {
    // Set default weights
    const vectorWeight = options.vectorWeight || 0.5;
    const keywordWeight = options.keywordWeight || 0.3;
    const bm25Weight = options.bm25Weight || 0.2;
    
    // Determine which table to use based on dimension
    const tableName = `documents_${dimension}`;
    
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
        LIMIT $3 * 3
      ),
      keyword_results AS (
        -- Keyword search using ts_vector/ts_query
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
        LIMIT $3 * 3
      ),
      bm25_results AS (
        -- BM25 search for more nuanced text relevance
        SELECT 
          id,
          content,
          content_type,
          metadata,
          xeto_spec_name,
          xeto_library,
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
        id,
        content,
        content_type,
        metadata,
        xeto_spec_name,
        xeto_library,
        weighted_vector_similarity / $6 AS vector_similarity,
        weighted_keyword_similarity / $7 AS keyword_similarity,
        weighted_bm25_similarity / $8 AS bm25_similarity,
        boosted_score AS similarity
      FROM phrase_boosted
      ORDER BY boosted_score DESC
      LIMIT $3
    `;
    
    const result = await this.pool.query(query, [
      embeddingStr, 
      contentType, 
      topK, 
      keywordPattern,
      queryText,
      vectorWeight,
      keywordWeight,
      bm25Weight
    ]);
    
    return result.rows.map(row => ({
      id: row.id,
      content: row.content,
      contentType: row.content_type,
      metadata: row.metadata,
      xetoSpecName: row.xeto_spec_name,
      xetoLibrary: row.xeto_library,
      vectorSimilarity: parseFloat(row.vector_similarity || 0),
      keywordSimilarity: parseFloat(row.keyword_similarity || 0),
      bm25Similarity: parseFloat(row.bm25_similarity || 0),
      similarity: parseFloat(row.similarity || 0)
    }));
  }

  /**
   * Extract keywords from query text
   * @param {String} queryText - Query text
   * @returns {Array} Array of keywords
   */
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

  /**
   * Close database connection
   */
  async close() {
    await this.pool.end();
  }
}

/**
 * Create a new combined search strategy
 * @param {Object} dbConfig - Database configuration
 * @returns {CombinedSearchStrategy} Combined search strategy instance
 */
export function createCombinedSearchStrategy(dbConfig) {
  return new CombinedSearchStrategy(dbConfig);
}

export default createCombinedSearchStrategy;
