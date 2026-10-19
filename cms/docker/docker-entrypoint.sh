#!/bin/bash
set -e

# Function to set secure permissions on settings files
set_secure_permissions() {
    # Ensure settings.php is read-only for security (Drupal requirement)
    if [ -f /var/www/html/web/sites/default/settings.php ]; then
        chmod 444 /var/www/html/web/sites/default/settings.php 2>/dev/null || true
        # On Windows volumes, chmod might not work, but we try anyway
    fi

    # Ensure settings.local.php is read-only for security
    if [ -f /var/www/html/web/sites/default/settings.local.php ]; then
        chmod 444 /var/www/html/web/sites/default/settings.local.php 2>/dev/null || true
    fi

    # Ensure sites/default directory is not writable (security)
    chmod 555 /var/www/html/web/sites/default 2>/dev/null || true
}

# Function to ensure file upload directories exist and have correct permissions
setup_file_directories() {
    echo "Setting up Drupal file directories and permissions..."
    
    # Create necessary directories if they don't exist (important for mounted volumes)
    # Order matters: create parent directories first
    mkdir -p /var/www/html/web/sites/default/files
    mkdir -p /var/www/html/web/sites/default/files/config/sync
    mkdir -p /var/www/html/web/sites/default/files/php
    mkdir -p /var/www/html/web/sites/default/files/php/twig
    mkdir -p /var/www/html/web/sites/default/files/private
    mkdir -p /var/www/html/web/sites/default/files/temporary
    
    # Set ownership to www-data (Apache user)
    # This is critical for file uploads and cache to work
    # Use -R to recursively set ownership on all files and subdirectories
    chown -R www-data:www-data /var/www/html/web/sites/default/files
    
    # Set writable permissions for file directories
    # 775 allows owner (www-data) and group (www-data) to write, others to read
    # This is essential for Drupal to create cache files and subdirectories
    chmod -R 775 /var/www/html/web/sites/default/files
    
    # Explicitly ensure php directory and its subdirectories are writable
    # This is critical for Twig template cache which creates nested directories
    if [ -d /var/www/html/web/sites/default/files/php ]; then
        chmod -R 775 /var/www/html/web/sites/default/files/php
        # Ensure parent directory is writable so mkdir() can create subdirectories
        chmod 775 /var/www/html/web/sites/default/files/php
    fi
    
    # Verify critical directories exist and are writable
    if [ ! -w /var/www/html/web/sites/default/files/php ]; then
        echo "WARNING: /var/www/html/web/sites/default/files/php is not writable" >&2
    fi
    
    echo "File directories setup complete."
}

# Set permissions on startup
set_secure_permissions

# Setup file directories for uploads
setup_file_directories

# Execute the command passed to it
exec "$@"

