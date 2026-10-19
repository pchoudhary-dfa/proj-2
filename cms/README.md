# Guinea CMS - Drupal Project

This is a Drupal 11.3.1 project managed with Composer.

## Requirements

### Local Development
- PHP 8.3 or higher
- Composer
- MySQL/MariaDB
- Apache/Nginx web server

### Docker (Production Deployment)
- Docker Engine 20.10+

## Installation

### Option 1: Docker (Production)

Build and run the Docker image for production deployment:

```bash
# Build the image
docker build -t guinea-cms:latest .

# Run the container
docker run -d \
  --name guinea-cms \
  -p 80:80 \
  -e DB_NAME=guinea \
  -e DB_USER=your_db_user \
  -e DB_PASSWORD=your_db_password \
  -e DB_HOST=your_db_host \
  -e DB_PORT=3306 \
  -e DRUPAL_TRUSTED_HOST_PATTERNS='^yourdomain\.com$,^www\.yourdomain\.com$' \
  guinea-cms:latest
```

### Option 2: Local Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd guinea
   ```

2. Install dependencies:
   ```bash
   composer install
   ```

3. Copy the environment file:
   ```bash
   cp .env.example .env
   ```

4. Edit `.env` file with your database credentials:
   ```
   DB_NAME=guinea
   DB_USER=root
   DB_PASSWORD=root
   DB_HOST=localhost
   DB_PORT=3306
   ```

5. Create the database:
   ```sql
   CREATE DATABASE guinea CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
   ```

6. Set up the virtual host pointing to the `web` directory:
   - Document root: `/path/to/guinea/web`
   - URL: `http://guinea/`

7. Visit `http://guinea/` in your browser and complete the Drupal installation.

## Development Setup

This project is configured for development with:
- Error reporting enabled
- CSS/JS aggregation disabled
- Development services enabled
- File permissions hardening skipped (for version control)

## Configuration

- Database settings are loaded from `.env` file
- Local overrides are in `web/sites/default/settings.local.php`
- Main settings file: `web/sites/default/settings.php`

## Git Repository

Remote repository: https://git.communitysystemsfoundation.org/projects/GUIN/repos/cms/browse

Note: You may need to update the git remote URL to the actual clone URL:
```bash
git remote set-url origin <actual-git-clone-url>
```

## File Structure

```
guinea/
├── composer.json          # Composer dependencies
├── .env                   # Environment variables (not in git)
├── .env.example           # Environment template
├── .gitignore             # Git ignore rules
├── vendor/                # Composer packages (not in git)
└── web/                   # Web root (DocumentRoot)
    ├── core/              # Drupal core
    ├── modules/           # Custom/contrib modules
    ├── themes/            # Custom/contrib themes
    └── sites/
        └── default/       # Site configuration
            ├── settings.php
            └── settings.local.php
```

## Best Practices

- Never commit `.env` file
- Never commit `settings.local.php` (already in .gitignore)
- Always use Composer to manage dependencies
- Follow Drupal coding standards

# Trigger build
