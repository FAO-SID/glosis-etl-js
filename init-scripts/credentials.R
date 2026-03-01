# ============================================================================
# PostgreSQL Credentials - Docker Version (PROVEN TO WORK)
# ============================================================================
# This is the simple version that WORKS in Docker.
# Use this immediately while we diagnose the universal version.
#
# Why this works:
# - Simple, no complex detection logic
# - Just gets environment variables and uses sensible defaults
# - The default "glosis-db" works in your Docker setup
#
# Author: Luis Rodriguez Lado (FAO)
# ============================================================================

database_name <- Sys.getenv("DB_NAME", "glosis")
host_name <- Sys.getenv("DB_HOST", "glosis-db")
port_number <- as.numeric(Sys.getenv("DB_PORT", "5432"))
user_name <- Sys.getenv("DB_USER", "glosis")
password_name <- Sys.getenv("DB_PASSWORD", "glosis")

global_pass <- ""


# ============================================================================
# Host name to test in R studio.
# ============================================================================
#host_name <- "localhost"
#port_number <- "5442"

# ============================================================================
# Database schema URL
# ============================================================================
sql_file_url <- "https://raw.githubusercontent.com/FAO-SID/GloSIS/refs/heads/main/glosis-db/versions/glosis-db_latest.sql"

