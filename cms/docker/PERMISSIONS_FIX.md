# Drupal Twig Cache Permissions Fix

## Problem

Drupal was throwing this error:
```
User warning: mkdir(): Permission Denied in Drupal\Component\PhpStorage\FileStorage->createDirectory()
```

This happens when Drupal tries to create subdirectories in `/var/www/html/web/sites/default/files/php/twig/` for compiled Twig templates, but the web server (running as `www-data`) doesn't have write permissions.

## Root Cause

1. **Docker volumes**: When Docker creates named volumes (like `drupal_files`), they may have root ownership or incorrect permissions
2. **Parent directory permissions**: The `mkdir()` function needs write permission on the **parent directory** to create subdirectories
3. **Volume mounting**: Volumes are mounted AFTER the Dockerfile runs, so permissions set during build may be overridden

## Solution

The fix has three layers:

### 1. Dockerfile (Build Time)
- Creates the `php/twig` directory structure during image build
- Sets ownership to `www-data:www-data`
- Sets permissions to `775` (read/write/execute for owner and group)

### 2. Entrypoint Script (Runtime)
- Runs **every time the container starts** (after volumes are mounted)
- Creates directories if they don't exist
- **Fixes ownership and permissions** on mounted volumes
- Specifically ensures `/var/www/html/web/sites/default/files/php` is writable

### 3. Verification Script
- Allows you to test permissions without deploying to production
- Can be run inside the container to verify everything works

## How to Verify the Fix

### Step 1: Rebuild and Start Containers
```bash
docker-compose down
docker-compose build
docker-compose up -d
```

### Step 2: Check Container Logs
Look for the entrypoint script output:
```bash
docker-compose logs web | grep "Setting up Drupal file directories"
```

### Step 3: Run Verification Script
```bash
docker exec guinea_web /usr/local/bin/verify-permissions.sh
```

This will show:
- ✅ Which directories exist
- ✅ Current permissions and ownership
- ✅ Whether write operations work
- ✅ Current user/group information

### Step 4: Test in Browser
1. Visit your Drupal site
2. Check if the permission error is gone
3. Clear Drupal cache: `drush cr` or via admin UI

## Expected Results

After the fix, you should see:

1. **Verification script output:**
   ```
   ✓ /var/www/html/web/sites/default/files/php exists
   ✓ /var/www/html/web/sites/default/files/php/twig exists
   ✓ Successfully created test directory
   ```

2. **Directory permissions:**
   ```
   /var/www/html/web/sites/default/files/php: 775 www-data:www-data (writable)
   ```

3. **No permission errors** in Drupal logs or browser

## Troubleshooting

### If permissions still don't work:

1. **Check if entrypoint script ran:**
   ```bash
   docker exec guinea_web ls -la /var/www/html/web/sites/default/files/php
   ```
   Should show `www-data www-data` as owner

2. **Manually fix permissions (one-time):**
   ```bash
   docker exec -u root guinea_web chown -R www-data:www-data /var/www/html/web/sites/default/files/php
   docker exec -u root guinea_web chmod -R 775 /var/www/html/web/sites/default/files/php
   ```

3. **Check if volume is mounted correctly:**
   ```bash
   docker exec guinea_web mount | grep files
   ```

4. **Windows/Docker Desktop users:**
   - Named volumes should work fine
   - If using bind mounts, ensure the host directory has correct permissions
   - On Windows, chmod/chown may not work on bind mounts, but named volumes work correctly

## Technical Details

### Why 775 permissions?
- `7` (owner/www-data): read, write, execute
- `7` (group/www-data): read, write, execute  
- `5` (others): read, execute (no write)

This allows:
- Apache (running as www-data) to create files and directories
- Drupal to create nested cache directories
- Security: others can't write

### Why entrypoint script?
- Docker volumes are mounted **after** the image is built
- Entrypoint runs **after** volumes are mounted but **before** Apache starts
- This ensures permissions are correct every time the container starts
- Handles both fresh volumes and existing volumes with wrong permissions

## Files Modified

1. `Dockerfile` - Creates directories and sets permissions at build time
2. `docker/docker-entrypoint.sh` - Fixes permissions at runtime (critical for volumes)
3. `docker/verify-permissions.sh` - New verification script
4. `docker-compose.yml` - No changes needed (already uses named volumes)

## Confidence Level

✅ **High** - This solution addresses the exact error:
- Creates the required directory structure
- Sets correct ownership (www-data:www-data)
- Sets correct permissions (775)
- Runs on every container start (handles volume mounting)
- Includes verification tools

The fix follows Docker and Drupal best practices for file permissions.
