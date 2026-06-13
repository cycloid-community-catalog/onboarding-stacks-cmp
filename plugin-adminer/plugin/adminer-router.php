<?php
// Route every request to Adminer (single-file distribution).
if (!isset($_SERVER['REQUEST_URI']) || $_SERVER['REQUEST_URI'] === '') {
    $_SERVER['REQUEST_URI'] = '/';
}
if (!isset($_SERVER['HTTP_HOST']) || $_SERVER['HTTP_HOST'] === '') {
    $_SERVER['HTTP_HOST'] = '127.0.0.1';
}

// Session cookie must be scoped to the Cycloid iframe path and marked SameSite=None
// so it persists when the console (console.cycloid.io) embeds api.us.cycloid.io.
$basePath = trim($_SERVER['HTTP_X_PLUGIN_BASE_PATH'] ?? '', '/');
$cookiePath = $basePath !== '' ? '/' . $basePath . '/' : '/';
session_set_cookie_params([
    'lifetime' => 0,
    'path' => $cookiePath,
    'secure' => true,
    'httponly' => true,
    'samesite' => 'None',
]);

require __DIR__ . '/adminer.php';
