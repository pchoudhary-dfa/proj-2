#!/bin/bash
# Script to verify Drupal file permissions are correct
# Run this inside the container: docker exec guinea_web /usr/local/bin/verify-permissions.sh

echo "=== Verifying Drupal File Permissions ==="
echo ""

# Check if directories exist
echo "1. Checking if directories exist..."
DIRS=(
    "/var/www/html/web/sites/default/files"
    "/var/www/html/web/sites/default/files/php"
    "/var/www/html/web/sites/default/files/php/twig"
    "/var/www/html/web/sites/default/files/config/sync"
)

for dir in "${DIRS[@]}"; do
    if [ -d "$dir" ]; then
        echo "  ✓ $dir exists"
    else
        echo "  ✗ $dir MISSING"
    fi
done

echo ""
echo "2. Checking directory permissions..."

# Check permissions on critical directories
check_permissions() {
    local dir=$1
    if [ -d "$dir" ]; then
        local perms=$(stat -c "%a" "$dir" 2>/dev/null || stat -f "%OLp" "$dir" 2>/dev/null)
        local owner=$(stat -c "%U:%G" "$dir" 2>/dev/null || stat -f "%Su:%Sg" "$dir" 2>/dev/null)
        local writable=""
        if [ -w "$dir" ]; then
            writable="(writable)"
        else
            writable="(NOT WRITABLE)"
        fi
        echo "  $dir: $perms $owner $writable"
    fi
}

check_permissions "/var/www/html/web/sites/default/files"
check_permissions "/var/www/html/web/sites/default/files/php"
check_permissions "/var/www/html/web/sites/default/files/php/twig"

echo ""
echo "3. Testing write capability..."

# Test if we can create a directory (simulating what Drupal does)
TEST_DIR="/var/www/html/web/sites/default/files/php/twig/test_$(date +%s)"
if mkdir -p "$TEST_DIR" 2>/dev/null; then
    echo "  ✓ Successfully created test directory: $TEST_DIR"
    rmdir "$TEST_DIR" 2>/dev/null
    echo "  ✓ Successfully removed test directory"
else
    echo "  ✗ FAILED to create test directory in php/twig"
    echo "     This indicates a permissions problem!"
fi

echo ""
echo "4. Current user and group:"
echo "  User: $(whoami)"
echo "  UID: $(id -u)"
echo "  GID: $(id -g)"
echo "  Groups: $(groups)"

echo ""
echo "=== Verification Complete ==="
