# Use official PHP 8.4 with Apache for Drupal 11
FROM php:8.4-apache

# Set working directory
WORKDIR /var/www/html

# Build arguments (can be overridden at build time)
ARG APP_URL=https://guinea.dataforall.org
ARG DB_NAME=p3709-prod-drupal-26-guinea
ARG DB_USER=csfdba
# Secrets: no defaults. Supply at runtime (k8s secretRef) or via --build-arg for local builds.
ARG DB_PASSWORD
ARG DB_HOST=10.0.1.166
ARG DB_PORT=3306
ARG DB_DRIVER=mysqli
ARG DB_ISOLATION_LEVEL="READ COMMITTED"
ARG DRUPAL_ENVIRONMENT=production
ARG DRUPAL_CONFIG_SYNC_DIRECTORY=sites/default/files/config/sync
ARG DRUPAL_FILE_PUBLIC_PATH=sites/default/files
ARG DRUPAL_TRUSTED_HOST_PATTERNS=^guinea$,^guinea\.localhost$,^localhost$,^guinea\.dataforall\.org$
ARG DRUPAL_HASH_SALT

# Environment variables (defaults to production, can be overridden at runtime)
ENV APP_URL=${APP_URL}
ENV DB_NAME=${DB_NAME}
ENV DB_USER=${DB_USER}
ENV DB_PASSWORD=${DB_PASSWORD}
ENV DB_HOST=${DB_HOST}
ENV DB_PORT=${DB_PORT}
ENV DB_DRIVER=${DB_DRIVER}
ENV DB_ISOLATION_LEVEL=${DB_ISOLATION_LEVEL}
ENV DRUPAL_ENVIRONMENT=${DRUPAL_ENVIRONMENT}
ENV DRUPAL_CONFIG_SYNC_DIRECTORY=${DRUPAL_CONFIG_SYNC_DIRECTORY}
ENV DRUPAL_FILE_PUBLIC_PATH=${DRUPAL_FILE_PUBLIC_PATH}
ENV DRUPAL_TRUSTED_HOST_PATTERNS=${DRUPAL_TRUSTED_HOST_PATTERNS}
ENV DRUPAL_HASH_SALT=${DRUPAL_HASH_SALT}
# GD must be built with JPEG + WebP so Drupal image styles can generate derivatives
# (e.g. admin thumbnails as *.jpg.webp). libpng-only GD breaks WebP conversion on OCI.
RUN apt-get update && apt-get install -y \
    git \
    curl \
    libpng-dev \
    libjpeg62-turbo-dev \
    libfreetype6-dev \
    libwebp-dev \
    libonig-dev \
    libxml2-dev \
    libzip-dev \
    zip \
    unzip \
    && docker-php-ext-install -j"$(nproc)" \
    pdo_mysql \
    mbstring \
    exif \
    pcntl \
    bcmath \
    zip \
    opcache \
    && docker-php-ext-configure gd \
        --with-freetype \
        --with-jpeg \
        --with-webp \
    && docker-php-ext-install -j"$(nproc)" gd \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Install Composer
COPY --from=composer:latest /usr/bin/composer /usr/bin/composer

# Enable Apache mod_rewrite and headers for Drupal
RUN a2enmod rewrite headers expires

# PHP overrides for Drupal (see https://www.drupal.org/docs/system-requirements/php-requirements)
RUN echo "memory_limit = 512M" > /usr/local/etc/php/conf.d/drupal.ini && \
    echo "upload_max_filesize = 128M" >> /usr/local/etc/php/conf.d/drupal.ini && \
    echo "post_max_size = 72M" >> /usr/local/etc/php/conf.d/drupal.ini && \
    echo "max_execution_time = 300" >> /usr/local/etc/php/conf.d/drupal.ini && \
    echo "max_input_vars = 5000" >> /usr/local/etc/php/conf.d/drupal.ini && \
    echo "realpath_cache_size = 4096K" >> /usr/local/etc/php/conf.d/drupal.ini && \
    echo "realpath_cache_ttl = 600" >> /usr/local/etc/php/conf.d/drupal.ini && \
    echo "output_buffering = 4096" >> /usr/local/etc/php/conf.d/drupal.ini && \
    echo "implicit_flush = Off" >> /usr/local/etc/php/conf.d/drupal.ini && \
    echo "default_socket_timeout = 300" >> /usr/local/etc/php/conf.d/drupal.ini

# Configure OPcache for production
RUN echo "opcache.enable=1" > /usr/local/etc/php/conf.d/opcache.ini && \
    echo "opcache.memory_consumption=128" >> /usr/local/etc/php/conf.d/opcache.ini && \
    echo "opcache.interned_strings_buffer=8" >> /usr/local/etc/php/conf.d/opcache.ini && \
    echo "opcache.max_accelerated_files=4000" >> /usr/local/etc/php/conf.d/opcache.ini && \
    echo "opcache.revalidate_freq=2" >> /usr/local/etc/php/conf.d/opcache.ini && \
    echo "opcache.fast_shutdown=1" >> /usr/local/etc/php/conf.d/opcache.ini

# Create default Apache virtual host configuration
# Note: apache-vhost.conf is environment-specific - server should customize via volume mount or override
RUN echo '<VirtualHost *:80>' > /etc/apache2/sites-available/000-default.conf && \
    echo '    ServerName localhost' >> /etc/apache2/sites-available/000-default.conf && \
    echo '    DocumentRoot /var/www/html/web' >> /etc/apache2/sites-available/000-default.conf && \
    echo '    <Directory /var/www/html/web>' >> /etc/apache2/sites-available/000-default.conf && \
    echo '        Options -Indexes +FollowSymLinks' >> /etc/apache2/sites-available/000-default.conf && \
    echo '        AllowOverride All' >> /etc/apache2/sites-available/000-default.conf && \
    echo '        Require all granted' >> /etc/apache2/sites-available/000-default.conf && \
    echo '    </Directory>' >> /etc/apache2/sites-available/000-default.conf && \
    echo '    ErrorLog ${APACHE_LOG_DIR}/error.log' >> /etc/apache2/sites-available/000-default.conf && \
    echo '    CustomLog ${APACHE_LOG_DIR}/access.log combined' >> /etc/apache2/sites-available/000-default.conf && \
    echo '</VirtualHost>' >> /etc/apache2/sites-available/000-default.conf

# Copy Apache MPM configuration
COPY docker/apache-mpm.conf /etc/apache2/conf-available/mpm-custom.conf
RUN a2enconf mpm-custom

# Copy entrypoint script and fix-permissions script
COPY docker/docker-entrypoint.sh /usr/local/bin/
COPY docker/fix-permissions.sh /usr/local/bin/
COPY docker/verify-permissions.sh /usr/local/bin/
COPY docker/test-permissions.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh /usr/local/bin/fix-permissions.sh /usr/local/bin/verify-permissions.sh /usr/local/bin/test-permissions.sh

# Copy application files
COPY . /var/www/html/

# Create necessary directories that might not exist
# CRITICAL: Create directories with proper ownership and permissions from the start
# Use setgid bit (2775) so new directories inherit the group automatically
RUN mkdir -p /var/www/html/web/sites/default/files && \
    mkdir -p /var/www/html/web/sites/default/files/config/sync && \
    mkdir -p /var/www/html/web/sites/default/files/translations && \
    mkdir -p /var/www/html/web/sites/default/files/php && \
    mkdir -p /var/www/html/web/sites/default/files/php/twig && \
    mkdir -p /var/www/html/web/sites/default/files/private && \
    mkdir -p /var/www/html/web/sites/default/files/temporary && \
    # Set ownership immediately after creation
    chown -R www-data:www-data /var/www/html/web/sites/default/files && \
    # Set base permissions for files directory with setgid bit (2775 = rwxrwxr-x with setgid)
    # This ensures new directories created by Drupal inherit the www-data group
    chmod 2775 /var/www/html/web/sites/default/files && \
    # Ensure php directory and twig subdirectory have correct permissions with setgid
    chmod 2775 /var/www/html/web/sites/default/files/php && \
    chmod 2775 /var/www/html/web/sites/default/files/php/twig

# Create .htaccess file in public files directory for security (SA-CORE-2013-003)
# This file should NOT be in version control - it's created on the server
RUN printf '# Turn off all options we don'\''t need.\nOptions -Indexes -ExecCGI -Includes -MultiViews\n\n# Set the catch-all handler to prevent scripts from being executed.\nSetHandler Drupal_Security_Do_Not_Remove_See_SA_2006_006\n<Files *>\n  # Override the handler again if we'\''re run later in the evaluation list.\n  SetHandler Drupal_Security_Do_Not_Remove_See_SA_2013_003\n</Files>\n\n# If we know how to do it safely, disable the PHP engine entirely.\n<IfModule mod_php.c>\n  php_flag engine off\n</IfModule>\n<IfModule mod_php5.c>\n  php_flag engine off\n</IfModule>\n<IfModule mod_php7.c>\n  php_flag engine off\n</IfModule>\n<IfModule mod_php8.c>\n  php_flag engine off\n</IfModule>\n' > /var/www/html/web/sites/default/files/.htaccess

# Set ownership for all files and directories
RUN chown -R www-data:www-data /var/www/html

# Set base permissions: directories 755, files 644
RUN find /var/www/html -type d -exec chmod 755 {} \; && \
    find /var/www/html -type f -exec chmod 644 {} \;

# Set executable permissions for scripts and binaries (shell scripts and bin directory)
RUN find /var/www/html -type f -name "*.sh" -exec chmod 755 {} \; && \
    find /var/www/html -type f -path "*/bin/*" -exec chmod 755 {} \;

# Set writable permissions for Drupal directories that need write access
# CRITICAL: These directories must be writable by www-data for Drupal to function
RUN if [ -d /var/www/html/web/sites/default/files ]; then \
        # Set directory permissions recursively (2775 with setgid for directories)
        find /var/www/html/web/sites/default/files -type d -exec chmod 2775 {} \; && \
        # Set file permissions (664 for files)
        find /var/www/html/web/sites/default/files -type f -exec chmod 664 {} \; && \
        # Explicitly ensure php and twig directories are writable (most critical for Twig cache)
        [ -d /var/www/html/web/sites/default/files/php ] && chmod 775 /var/www/html/web/sites/default/files/php && \
        [ -d /var/www/html/web/sites/default/files/php/twig ] && chmod 775 /var/www/html/web/sites/default/files/php/twig && \
        # Ensure ownership is correct (critical for www-data to write)
        chown -R www-data:www-data /var/www/html/web/sites/default/files/php; \
    fi

# Set read-only permissions for sensitive configuration files
RUN if [ -f /var/www/html/web/sites/default/settings.php ]; then \
        chmod 444 /var/www/html/web/sites/default/settings.php; \
    fi && \
    if [ -f /var/www/html/web/sites/default/settings.local.php ]; then \
        chmod 444 /var/www/html/web/sites/default/settings.local.php; \
    fi

# Ensure sites/default directory is not writable (security) - Drupal standard is 555
RUN [ -d /var/www/html/web/sites/default ] && chmod 555 /var/www/html/web/sites/default || true

# Install Composer dependencies from lock file (audit disabled for local/dev builds)
RUN composer config audit.block-insecure false && \
    composer install --no-dev --optimize-autoloader --no-interaction

# Re-apply permissions after composer install (in case composer changed them)
# CRITICAL: Ensure files directory permissions are correct for Drupal to write cache files
RUN chown -R www-data:www-data /var/www/html && \
    find /var/www/html -type d -exec chmod 755 {} \; && \
    find /var/www/html -type f -exec chmod 644 {} \; && \
    find /var/www/html -type f -name "*.sh" -exec chmod 755 {} \; && \
    find /var/www/html -type f -path "*/bin/*" -exec chmod 755 {} \; && \
    find /var/www/html/vendor/drush -type f \( -name 'drush' -o -name 'drush.php' \) -exec chmod 755 {} \; && \
    [ -d /var/www/html/web/sites/default ] && chmod 555 /var/www/html/web/sites/default && \
    # CRITICAL: Set writable permissions for files directory (Drupal needs this)
    # Use setgid bit (2775) so new directories inherit the group automatically
    if [ -d /var/www/html/web/sites/default/files ]; then \
        chown -R www-data:www-data /var/www/html/web/sites/default/files && \
        find /var/www/html/web/sites/default/files -type d -exec chmod 2775 {} \; && \
        find /var/www/html/web/sites/default/files -type f -exec chmod 664 {} \; && \
        # Explicitly ensure php/twig directory is writable with setgid (most critical for Twig cache)
        [ -d /var/www/html/web/sites/default/files/php ] && chmod 2775 /var/www/html/web/sites/default/files/php && \
        [ -d /var/www/html/web/sites/default/files/php/twig ] && chmod 2775 /var/www/html/web/sites/default/files/php/twig && \
        chown -R www-data:www-data /var/www/html/web/sites/default/files/php; \
    fi && \
    if [ -f /var/www/html/web/sites/default/settings.php ]; then \
        chmod 444 /var/www/html/web/sites/default/settings.php; \
    fi && \
    if [ -f /var/www/html/web/sites/default/settings.local.php ]; then \
        chmod 444 /var/www/html/web/sites/default/settings.local.php; \
    fi

# Expose port 80
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
    CMD curl -f http://localhost/ || exit 1

# Use entrypoint script (all permissions are managed in Dockerfile)
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]

# Start Apache
CMD ["apache2-foreground"]

