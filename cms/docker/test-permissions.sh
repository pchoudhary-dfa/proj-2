#!/bin/bash
# Test script to verify Drupal file permissions are working correctly
# This simulates what Drupal does when creating directories for Twig caching

set -e

FILES_DIR="/var/www/html/web/sites/default/files"
PHP_TWIG_DIR="$FILES_DIR/php/twig"

echo "=========================================="
echo "Testing Drupal File Permissions"
echo "=========================================="
echo ""

# Test 1: Check if directories exist
echo "Test 1: Checking if required directories exist..."
if [ -d "$FILES_DIR" ]; then
    echo "✓ Files directory exists: $FILES_DIR"
else
    echo "✗ Files directory does NOT exist: $FILES_DIR"
    exit 1
fi

if [ -d "$PHP_TWIG_DIR" ]; then
    echo "✓ PHP/Twig directory exists: $PHP_TWIG_DIR"
else
    echo "✗ PHP/Twig directory does NOT exist: $PHP_TWIG_DIR"
    exit 1
fi
echo ""

# Test 2: Check ownership
echo "Test 2: Checking directory ownership..."
FILES_OWNER=$(stat -c '%U:%G' "$FILES_DIR" 2>/dev/null || stat -f '%Su:%Sg' "$FILES_DIR" 2>/dev/null)
if [ "$FILES_OWNER" = "www-data:www-data" ]; then
    echo "✓ Files directory ownership is correct: $FILES_OWNER"
else
    echo "✗ Files directory ownership is incorrect: $FILES_OWNER (expected www-data:www-data)"
    exit 1
fi

PHP_TWIG_OWNER=$(stat -c '%U:%G' "$PHP_TWIG_DIR" 2>/dev/null || stat -f '%Su:%Sg' "$PHP_TWIG_DIR" 2>/dev/null)
if [ "$PHP_TWIG_OWNER" = "www-data:www-data" ]; then
    echo "✓ PHP/Twig directory ownership is correct: $PHP_TWIG_OWNER"
else
    echo "✗ PHP/Twig directory ownership is incorrect: $PHP_TWIG_OWNER (expected www-data:www-data)"
    exit 1
fi
echo ""

# Test 3: Check permissions
echo "Test 3: Checking directory permissions..."
FILES_PERMS=$(stat -c '%a' "$FILES_DIR" 2>/dev/null || stat -f '%A' "$FILES_DIR" 2>/dev/null)
if [ "$FILES_PERMS" = "775" ] || [ "$FILES_PERMS" = "2775" ]; then
    if [ "$FILES_PERMS" = "2775" ]; then
        echo "✓ Files directory permissions are correct with setgid: $FILES_PERMS (recommended)"
    else
        echo "✓ Files directory permissions are correct: $FILES_PERMS (setgid bit not set, but acceptable)"
    fi
else
    echo "✗ Files directory permissions are incorrect: $FILES_PERMS (expected 775 or 2775)"
    exit 1
fi

PHP_TWIG_PERMS=$(stat -c '%a' "$PHP_TWIG_DIR" 2>/dev/null || stat -f '%A' "$PHP_TWIG_DIR" 2>/dev/null)
if [ "$PHP_TWIG_PERMS" = "775" ] || [ "$PHP_TWIG_PERMS" = "2775" ]; then
    if [ "$PHP_TWIG_PERMS" = "2775" ]; then
        echo "✓ PHP/Twig directory permissions are correct with setgid: $PHP_TWIG_PERMS (recommended)"
    else
        echo "✓ PHP/Twig directory permissions are correct: $PHP_TWIG_PERMS (setgid bit not set, but acceptable)"
    fi
else
    echo "✗ PHP/Twig directory permissions are incorrect: $PHP_TWIG_PERMS (expected 775 or 2775)"
    exit 1
fi
echo ""

# Test 4: Test if www-data can write (most important test)
echo "Test 4: Testing if www-data user can create directories (simulating Drupal behavior)..."
if [ "$(id -u)" = "0" ]; then
    TEST_DIR="$PHP_TWIG_DIR/.test_write_$(date +%s)"
    
    # Try to create a directory as www-data
    if su -s /bin/bash -c "mkdir -p '$TEST_DIR' && rmdir '$TEST_DIR'" www-data 2>/dev/null; then
        echo "✓ www-data can create directories in php/twig (this is what Drupal needs!)"
    else
        echo "✗ www-data CANNOT create directories in php/twig"
        echo "  This will cause 'Permission Denied' errors in Drupal!"
        exit 1
    fi
else
    echo "⚠ Skipping www-data write test (not running as root)"
    # Just check if current user can write
    if [ -w "$PHP_TWIG_DIR" ]; then
        echo "✓ Current user can write to php/twig"
    else
        echo "✗ Current user cannot write to php/twig"
        exit 1
    fi
fi
echo ""

# Test 5: Simulate Drupal's FileStorage->createDirectory() behavior
echo "Test 5: Simulating Drupal's directory creation (FileStorage->createDirectory())..."
if [ "$(id -u)" = "0" ]; then
    # Create a nested directory structure like Drupal does
    TEST_NESTED_DIR="$PHP_TWIG_DIR/test/nested/directory/$(date +%s)"
    
    if su -s /bin/bash -c "mkdir -p '$TEST_NESTED_DIR' && rmdir '$TEST_NESTED_DIR' && rmdir '$(dirname $TEST_NESTED_DIR)' && rmdir '$(dirname $(dirname $TEST_NESTED_DIR))' && rmdir '$(dirname $(dirname $(dirname $TEST_NESTED_DIR)))'" www-data 2>/dev/null; then
        echo "✓ www-data can create nested directories (like Drupal does)"
    else
        echo "✗ www-data cannot create nested directories"
        exit 1
    fi
else
    echo "⚠ Skipping nested directory test (not running as root)"
fi
echo ""

# Test 6: Check if files can be created
echo "Test 6: Testing if www-data can create files..."
if [ "$(id -u)" = "0" ]; then
    TEST_FILE="$PHP_TWIG_DIR/.test_file_$(date +%s).txt"
    
    if su -s /bin/bash -c "echo 'test' > '$TEST_FILE' && rm -f '$TEST_FILE'" www-data 2>/dev/null; then
        echo "✓ www-data can create files in php/twig"
    else
        echo "✗ www-data cannot create files in php/twig"
        exit 1
    fi
else
    echo "⚠ Skipping file creation test (not running as root)"
fi
echo ""

echo "=========================================="
echo "✓ All permission tests passed!"
echo "=========================================="
echo ""
echo "The container is ready for Drupal to use."
echo "Drupal should be able to create directories and files in:"
echo "  - $PHP_TWIG_DIR"
echo ""
