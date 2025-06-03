-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Main documents table for storing all content variants and embeddings
CREATE TABLE IF NOT EXISTS documents_1536 (
    id SERIAL PRIMARY KEY,
    content TEXT NOT NULL,
    content_type VARCHAR(50) NOT NULL, -- 'raw_xeto', 'markdown', 'json_ast', 'hybrid_semantic'
    embedding_model VARCHAR(100) NOT NULL, -- e.g., 'text-embedding-3-small', 'text-embedding-004'
    embedding VECTOR(1536), -- For OpenAI small and Gemini models
    metadata JSONB DEFAULT '{}',
    xeto_spec_name VARCHAR(255),
    xeto_library VARCHAR(100), -- e.g., 'ph.points', 'ph.equips'
    inheritance_path TEXT[], -- Array of parent types
    file_path TEXT, -- Original file path
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Table for 3072-dimension embeddings (OpenAI large)
CREATE TABLE IF NOT EXISTS documents_3072 (
    id SERIAL PRIMARY KEY,
    content TEXT NOT NULL,
    content_type VARCHAR(50) NOT NULL,
    embedding_model VARCHAR(100) NOT NULL,
    embedding VECTOR(3072), -- For OpenAI large model
    metadata JSONB DEFAULT '{}',
    xeto_spec_name VARCHAR(255),
    xeto_library VARCHAR(100),
    inheritance_path TEXT[],
    file_path TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Table for 768-dimension embeddings (Gemini stable)
CREATE TABLE IF NOT EXISTS documents_768 (
    id SERIAL PRIMARY KEY,
    content TEXT NOT NULL,
    content_type VARCHAR(50) NOT NULL,
    embedding_model VARCHAR(100) NOT NULL,
    embedding VECTOR(768), -- For Gemini stable model
    metadata JSONB DEFAULT '{}',
    xeto_spec_name VARCHAR(255),
    xeto_library VARCHAR(100),
    inheritance_path TEXT[],
    file_path TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- View to unify all document tables
-- First drop the view if it exists, or drop the table if it exists
DROP VIEW IF EXISTS documents_view;
DROP TABLE IF EXISTS documents;

-- Create the unified view
CREATE OR REPLACE VIEW documents_view AS
    SELECT id, content, content_type, embedding_model, NULL::vector AS embedding, 
           metadata, xeto_spec_name, xeto_library, inheritance_path, file_path, 
           created_at, updated_at, '1536'::text AS dimension_size
    FROM documents_1536
    UNION ALL
    SELECT id, content, content_type, embedding_model, NULL::vector AS embedding, 
           metadata, xeto_spec_name, xeto_library, inheritance_path, file_path, 
           created_at, updated_at, '3072'::text AS dimension_size
    FROM documents_3072
    UNION ALL
    SELECT id, content, content_type, embedding_model, NULL::vector AS embedding, 
           metadata, xeto_spec_name, xeto_library, inheritance_path, file_path, 
           created_at, updated_at, '768'::text AS dimension_size
    FROM documents_768;

-- Benchmark results table
CREATE TABLE IF NOT EXISTS benchmark_results (
    id SERIAL PRIMARY KEY,
    test_run_id UUID NOT NULL,
    query_text TEXT NOT NULL,
    content_type VARCHAR(50) NOT NULL,
    embedding_model VARCHAR(100) NOT NULL,
    llm_model VARCHAR(100) NOT NULL,
    response_text TEXT,
    retrieved_document_ids INTEGER[],
    metrics JSONB DEFAULT '{}', -- Store timing, similarity scores, costs
    created_at TIMESTAMP DEFAULT NOW()
);

-- Test queries table
CREATE TABLE IF NOT EXISTS test_queries (
    id SERIAL PRIMARY KEY,
    category VARCHAR(100) NOT NULL, -- 'direct_lookup', 'inheritance', 'functional', etc.
    query_text TEXT NOT NULL,
    expected_keywords TEXT[], -- Keywords that should appear in good responses
    difficulty_level INTEGER DEFAULT 1, -- 1-5 scale
    created_at TIMESTAMP DEFAULT NOW()
);

-- Performance metrics table
CREATE TABLE IF NOT EXISTS performance_metrics (
    id SERIAL PRIMARY KEY,
    test_run_id UUID NOT NULL,
    metric_name VARCHAR(100) NOT NULL,
    metric_value DECIMAL,
    metric_unit VARCHAR(50),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_documents_1536_content_type ON documents_1536(content_type);
CREATE INDEX IF NOT EXISTS idx_documents_1536_embedding_model ON documents_1536(embedding_model);
CREATE INDEX IF NOT EXISTS idx_documents_1536_xeto_spec ON documents_1536(xeto_spec_name);
CREATE INDEX IF NOT EXISTS idx_documents_1536_xeto_library ON documents_1536(xeto_library);
CREATE INDEX IF NOT EXISTS idx_documents_1536_created_at ON documents_1536(created_at);

CREATE INDEX IF NOT EXISTS idx_documents_3072_content_type ON documents_3072(content_type);
CREATE INDEX IF NOT EXISTS idx_documents_3072_embedding_model ON documents_3072(embedding_model);
CREATE INDEX IF NOT EXISTS idx_documents_3072_xeto_spec ON documents_3072(xeto_spec_name);
CREATE INDEX IF NOT EXISTS idx_documents_3072_xeto_library ON documents_3072(xeto_library);
CREATE INDEX IF NOT EXISTS idx_documents_3072_created_at ON documents_3072(created_at);

CREATE INDEX IF NOT EXISTS idx_documents_768_content_type ON documents_768(content_type);
CREATE INDEX IF NOT EXISTS idx_documents_768_embedding_model ON documents_768(embedding_model);
CREATE INDEX IF NOT EXISTS idx_documents_768_xeto_spec ON documents_768(xeto_spec_name);
CREATE INDEX IF NOT EXISTS idx_documents_768_xeto_library ON documents_768(xeto_library);
CREATE INDEX IF NOT EXISTS idx_documents_768_created_at ON documents_768(created_at);

-- Vector similarity search indexes (will be created after data is loaded)
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_1536_embedding_cosine 
-- ON documents_1536 USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_3072_embedding_cosine 
-- ON documents_3072 USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_768_embedding_cosine 
-- ON documents_768 USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Benchmark results indexes
CREATE INDEX IF NOT EXISTS idx_benchmark_results_test_run ON benchmark_results(test_run_id);
CREATE INDEX IF NOT EXISTS idx_benchmark_results_models ON benchmark_results(content_type, embedding_model, llm_model);
CREATE INDEX IF NOT EXISTS idx_benchmark_results_created_at ON benchmark_results(created_at);

-- Test queries indexes
CREATE INDEX IF NOT EXISTS idx_test_queries_category ON test_queries(category);

-- Performance metrics indexes
CREATE INDEX IF NOT EXISTS idx_performance_metrics_test_run ON performance_metrics(test_run_id);
CREATE INDEX IF NOT EXISTS idx_performance_metrics_name ON performance_metrics(metric_name);

-- Insert default test queries if they don't exist
INSERT INTO test_queries (category, query_text, expected_keywords, difficulty_level) VALUES
-- Direct Type Lookup
('direct_lookup', 'What is Co2Sensor?', ARRAY['Co2Sensor', 'carbon dioxide', 'sensor', 'abstract'], 1),
('direct_lookup', 'Show me ZoneAirTempSensor specification', ARRAY['ZoneAirTempSensor', 'zone', 'air', 'temperature', 'sensor'], 1),
('direct_lookup', 'What are the properties of DischargeAirTempSensor?', ARRAY['DischargeAirTempSensor', 'discharge', 'air', 'temperature'], 2),

-- Inheritance and Relationships
('inheritance', 'What types inherit from NumberPoint?', ARRAY['NumberPoint', 'inherit', 'sensor', 'setpoint'], 2),
('inheritance', 'Show me all sensor types for air temperature', ARRAY['sensor', 'air', 'temperature', 'AirTempSensor'], 2),
('inheritance', 'What is the difference between Co2Point and Co2Sensor?', ARRAY['Co2Point', 'Co2Sensor', 'difference', 'abstract'], 3),

-- Functional Queries
('functional', 'How do I measure CO2 in a zone?', ARRAY['CO2', 'zone', 'measure', 'ZoneCo2Sensor'], 2),
('functional', 'What sensors are available for discharge air temperature?', ARRAY['sensor', 'discharge', 'air', 'temperature'], 2),
('functional', 'Show me all setpoint types for zone temperature control', ARRAY['setpoint', 'zone', 'temperature', 'control'], 3),

-- Complex Multi-Part Queries
('complex', 'What is the complete hierarchy for zone air temperature control including sensors, setpoints, and commands?', ARRAY['hierarchy', 'zone', 'air', 'temperature', 'sensor', 'setpoint', 'command'], 4),
('complex', 'How do VAV systems connect to air handlers in the xeto model?', ARRAY['VAV', 'air handler', 'connect', 'relationship'], 4),
('complex', 'What are all the measurement points available for an air handling unit?', ARRAY['measurement', 'points', 'air handling unit', 'AHU'], 3),

-- Troubleshooting Queries
('troubleshooting', 'What diagnostic points are available for fan operation?', ARRAY['diagnostic', 'fan', 'operation', 'points'], 3),
('troubleshooting', 'Show me all pressure measurement types for ductwork', ARRAY['pressure', 'measurement', 'ductwork', 'sensor'], 2),
('troubleshooting', 'What temperature sensors can I use to verify economizer operation?', ARRAY['temperature', 'sensor', 'economizer', 'operation'], 3)
ON CONFLICT DO NOTHING;
