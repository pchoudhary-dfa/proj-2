-- Search tables for DW search feature. Authoritative DDL; see apps/datawarehouse/services/search_index/tables.py for Core Table refs.

CREATE TABLE IF NOT EXISTS search_keywords (
  id BIGINT NOT NULL AUTO_INCREMENT,
  keyword_type ENUM('INDICATOR','AREA','TIME_PERIOD','SUBGROUP') NOT NULL,
  language_code VARCHAR(3) NOT NULL,
  canonical_text VARCHAR(255) NOT NULL,
  normalized_text VARCHAR(255) NOT NULL,
  entity_id BIGINT NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_keyword_type_entity_lang (keyword_type, entity_id, language_code),
  KEY idx_keyword_lang_type (language_code, keyword_type),
  KEY idx_keyword_lang_norm (language_code, normalized_text)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS search_keyword_synonym (
  id BIGINT NOT NULL AUTO_INCREMENT,
  keyword_id BIGINT NOT NULL,
  language_code VARCHAR(3) NOT NULL,
  synonym_text VARCHAR(255) NOT NULL,
  normalized_synonym VARCHAR(255) NOT NULL,
  synonym_type ENUM('SYNONYM','ALIAS','ABBREVIATION') NOT NULL,
  PRIMARY KEY (id),
  KEY idx_synonym_lang_norm (language_code, normalized_synonym),
  KEY idx_synonym_norm (normalized_synonym),
  KEY idx_synonym_keyword_id (keyword_id),
  CONSTRAINT fk_synonym_keyword
    FOREIGN KEY (keyword_id) REFERENCES search_keywords(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS search_keyword_ngram (
  id BIGINT NOT NULL AUTO_INCREMENT,
  keyword_id BIGINT NOT NULL,
  ngram VARCHAR(10) NOT NULL,
  PRIMARY KEY (id),
  KEY idx_ngram (ngram),
  KEY idx_keyword_id (keyword_id),
  UNIQUE KEY uq_keyword_ngram (keyword_id, ngram),
  CONSTRAINT fk_ngram_keyword
    FOREIGN KEY (keyword_id) REFERENCES search_keywords(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
