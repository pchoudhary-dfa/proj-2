"""
SQL adapter utility to convert MySQL-specific SQL to PostgreSQL
"""
import re
import logging

logger = logging.getLogger(__name__)


def adapt_mysql_to_postgresql(sql: str) -> str:
    """
    Convert MySQL-specific SQL syntax to PostgreSQL-compatible SQL
    
    Args:
        sql: MySQL SQL string
        
    Returns:
        PostgreSQL-compatible SQL string
    """
    # Remove MySQL-specific comments and directives
    sql = remove_mysql_directives(sql)
    
    # Replace MySQL-specific data types
    sql = replace_mysql_data_types(sql)
    
    # Replace AUTO_INCREMENT with SERIAL or IDENTITY
    sql = replace_auto_increment(sql)
    
    # Remove ENGINE clauses
    sql = remove_engine_clauses(sql)
    
    # Remove DEFAULT CHARSET and COLLATE clauses
    sql = remove_charset_clauses(sql)
    sql = remove_collate_clauses(sql)

    # Replace MySQL ENUM with VARCHAR for PostgreSQL
    sql = replace_mysql_enum_with_varchar(sql)

    # Fix datetime defaults
    sql = fix_datetime_defaults(sql)
    
    # Replace backticks with double quotes (PostgreSQL uses double quotes)
    sql = replace_backticks(sql)
    
    # Fix INSERT statements with VALUES
    sql = fix_insert_statements(sql)
    
    return sql


def remove_mysql_directives(sql: str) -> str:
    """Remove MySQL-specific directives and comments"""
    # Remove MySQL version-specific comments like /*!40101 */
    sql = re.sub(r'/\*!\d+\s+.*?\s*\*/', '', sql, flags=re.DOTALL)
    
    # Remove SET statements for MySQL-specific variables
    sql = re.sub(r'SET\s+@\w+\s*=.*?;', '', sql, flags=re.IGNORECASE)
    
    # Remove MySQL-specific SET statements
    patterns_to_remove = [
        r'SET\s+NAMES\s+utf8\s*;',
        r'SET\s+SQL_MODE.*?;',
        r'SET\s+@OLD_UNIQUE_CHECKS.*?;',
        r'SET\s+@OLD_FOREIGN_KEY_CHECKS.*?;',
        r'SET\s+@OLD_SQL_MODE.*?;',
        r'SET\s+@OLD_SQL_NOTES.*?;',
        r'SET\s+@OLD_SQL_MODE.*?;',
    ]
    
    for pattern in patterns_to_remove:
        sql = re.sub(pattern, '', sql, flags=re.IGNORECASE | re.MULTILINE)
    
    # Remove restoration statements
    sql = re.sub(r'SET\s+SQL_MODE=@OLD_SQL_MODE.*?;', '', sql, flags=re.IGNORECASE)
    sql = re.sub(r'SET\s+FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS.*?;', '', sql, flags=re.IGNORECASE)
    sql = re.sub(r'SET\s+UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS.*?;', '', sql, flags=re.IGNORECASE)
    sql = re.sub(r'SET\s+SQL_NOTES=@OLD_SQL_NOTES.*?;', '', sql, flags=re.IGNORECASE)
    
    return sql


def replace_mysql_data_types(sql: str) -> str:
    """Replace MySQL data types with PostgreSQL equivalents"""
    replacements = {
        # Numeric types
        r'\btinyint\(1\)': 'BOOLEAN',
        r'\btinyint\b': 'SMALLINT',
        r'\bint\(11\)': 'INTEGER',
        r'\bdouble\b': 'DOUBLE PRECISION',
        
        # String types
        r'\blongtext\b': 'TEXT',
        r'\blongblob\b': 'BYTEA',
        r'\bblob\b': 'BYTEA',
        r'\bdatetime\b': 'TIMESTAMP',
        
        # Keep varchar as is, but remove length restrictions if needed
    }
    
    for pattern, replacement in replacements.items():
        sql = re.sub(pattern, replacement, sql, flags=re.IGNORECASE)
    
    return sql


def replace_auto_increment(sql: str) -> str:
    """Replace AUTO_INCREMENT with PostgreSQL SERIAL/BIGSERIAL."""
    # BIGINT NOT NULL AUTO_INCREMENT -> BIGSERIAL NOT NULL
    sql = re.sub(
        r"(\w+)\s+BIGINT\s+NOT\s+NULL\s+AUTO_INCREMENT",
        r"\1 BIGSERIAL NOT NULL",
        sql,
        flags=re.IGNORECASE,
    )
    # INT/INT(11) NOT NULL AUTO_INCREMENT -> SERIAL NOT NULL
    sql = re.sub(
        r'(\w+)\s+(?:INTEGER|INT|INT\(11\))\s+NOT\s+NULL\s+AUTO_INCREMENT',
        r'\1 SERIAL NOT NULL',
        sql,
        flags=re.IGNORECASE
    )
    # Strip any remaining standalone AUTO_INCREMENT
    sql = re.sub(
        r'\s+AUTO_INCREMENT',
        '',
        sql,
        flags=re.IGNORECASE
    )
    return sql


def remove_engine_clauses(sql: str) -> str:
    """Remove MySQL ENGINE clauses"""
    sql = re.sub(r'\s+ENGINE\s*=\s*\w+\s*', '', sql, flags=re.IGNORECASE)
    return sql


def remove_charset_clauses(sql: str) -> str:
    """Remove MySQL DEFAULT CHARSET clauses"""
    sql = re.sub(r'\s+DEFAULT\s+CHARSET\s*=\s*\w+\s*', '', sql, flags=re.IGNORECASE)
    return sql


def remove_collate_clauses(sql: str) -> str:
    """Remove MySQL COLLATE clauses (e.g. COLLATE=utf8mb4_unicode_ci)."""
    sql = re.sub(r'\s+COLLATE\s*=\s*\w+', '', sql, flags=re.IGNORECASE)
    return sql


def replace_mysql_enum_with_varchar(sql: str) -> str:
    """Replace MySQL ENUM('v1','v2',...) with VARCHAR(32) for PostgreSQL."""
    # Match ENUM('...','...',...) - single-quoted values, comma-separated
    sql = re.sub(
        r"\bENUM\s*\(\s*'[^']*'(?:\s*,\s*'[^']*')*\s*\)",
        "VARCHAR(32)",
        sql,
        flags=re.IGNORECASE,
    )
    return sql


def fix_datetime_defaults(sql: str) -> str:
    """Fix MySQL datetime defaults that PostgreSQL doesn't support"""
    # Replace '0000-00-00 00:00:00' with NULL or valid timestamp
    sql = re.sub(
        r"'0000-00-00\s+00:00:00'",
        "NULL",
        sql,
        flags=re.IGNORECASE
    )
    
    # Replace DEFAULT '0000-00-00 00:00:00' with DEFAULT NULL
    sql = re.sub(
        r"DEFAULT\s+'0000-00-00\s+00:00:00'",
        "DEFAULT NULL",
        sql,
        flags=re.IGNORECASE
    )
    
    return sql


def replace_backticks(sql: str) -> str:
    """Replace MySQL backticks with PostgreSQL double quotes"""
    # Replace backticks around identifiers
    sql = re.sub(r'`([^`]+)`', r'"\1"', sql)
    return sql


def fix_insert_statements(sql: str) -> str:
    """Fix INSERT statements for PostgreSQL compatibility"""
    # PostgreSQL doesn't support INSERT ... VALUES with FROM dual
    sql = re.sub(
        r'INSERT\s+INTO\s+([^\s(]+)\s+SELECT\s+(.+?)\s+FROM\s+dual',
        r'INSERT INTO \1 VALUES (\2)',
        sql,
        flags=re.IGNORECASE | re.DOTALL
    )
    
    # Remove WHERE NOT EXISTS subqueries that use dual
    # This is a simplified approach - might need more sophisticated handling
    return sql


def split_sql_statements(sql: str) -> list[str]:
    """
    Split SQL string into individual statements
    
    Args:
        sql: SQL string containing multiple statements
        
    Returns:
        List of individual SQL statements
    """
    # Remove comments
    sql = re.sub(r'--.*?$', '', sql, flags=re.MULTILINE)
    sql = re.sub(r'/\*.*?\*/', '', sql, flags=re.DOTALL)
    
    # Split by semicolon, but preserve semicolons in strings
    statements = []
    current_statement = ""
    in_string = False
    string_char = None
    
    for char in sql:
        if char in ("'", '"') and not in_string:
            in_string = True
            string_char = char
        elif char == string_char and in_string:
            in_string = False
            string_char = None
        
        current_statement += char
        
        if char == ';' and not in_string:
            stmt = current_statement.strip()
            if stmt and stmt != ';':
                statements.append(stmt)
            current_statement = ""
    
    # Add remaining statement if any
    if current_statement.strip():
        statements.append(current_statement.strip())
    
    # Filter out empty statements
    return [s for s in statements if s.strip()]

