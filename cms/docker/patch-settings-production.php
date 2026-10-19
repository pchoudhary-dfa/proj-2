<?php

$f = '/var/www/html/web/sites/default/settings.php';
$c = file_get_contents($f);
if ($c === false) {
    fwrite(STDERR, "cannot read settings.php\n");
    exit(1);
}
if (str_contains($c, '$drupal_environment')) {
    echo "already updated\n";
    exit(0);
}

$needle = "if (isset(\$app_root) && isset(\$site_path) && file_exists(\$app_root . '/' . \$site_path . '/settings.local.php')) {\n  include \$app_root . '/' . \$site_path . '/settings.local.php';\n}";
$replacement = "\$drupal_environment = \$_ENV['DRUPAL_ENVIRONMENT'] ?? getenv('DRUPAL_ENVIRONMENT') ?: 'production';\nif (\n  \$drupal_environment !== 'production'\n  && isset(\$app_root)\n  && isset(\$site_path)\n  && file_exists(\$app_root . '/' . \$site_path . '/settings.local.php')\n) {\n  include \$app_root . '/' . \$site_path . '/settings.local.php';\n}";

$normalized = str_replace("\r\n", "\n", $c);
if (!str_contains($normalized, str_replace("\r\n", "\n", $needle))) {
    fwrite(STDERR, "pattern not found\n");
    exit(1);
}

$updated = str_replace($needle, $replacement, $normalized);
chmod($f, 0644);
file_put_contents($f, $updated);
chmod($f, 0444);
echo "updated\n";
