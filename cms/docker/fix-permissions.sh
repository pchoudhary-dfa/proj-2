#!/bin/bash
# Script to fix Drupal file permissions for security
# Run this inside the container: docker exec guinea_web /usr/local/bin/fix-permissions.sh

echo "Setting secure permissions for Drupal configuration files..."

# Set settings.php to read-only (444)
if [ -f /var/www/html/web/sites/default/settings.php ]; then
    chmod 444 /var/www/html/web/sites/default/settings.php
    echo "✓ settings.php set to read-only (444)"
else
    echo "✗ settings.php not found"
fi

# Set settings.local.php to read-only (444)
if [ -f /var/www/html/web/sites/default/settings.local.php ]; then
    chmod 444 /var/www/html/web/sites/default/settings.local.php
    echo "✓ settings.local.php set to read-only (444)"
else
    echo "✗ settings.local.php not found"
fi

# Set sites/default directory to read-only (555)
if [ -d /var/www/html/web/sites/default ]; then
    chmod 555 /var/www/html/web/sites/default
    echo "✓ sites/default directory set to read-only (555)"
else
    echo "✗ sites/default directory not found"
fi

echo "Done!"


