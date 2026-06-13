<?php
// Route every request to Adminer (single-file distribution).
if (!isset($_SERVER['REQUEST_URI']) || $_SERVER['REQUEST_URI'] === '') {
    $_SERVER['REQUEST_URI'] = '/';
}
if (!isset($_SERVER['HTTP_HOST']) || $_SERVER['HTTP_HOST'] === '') {
    $_SERVER['HTTP_HOST'] = '127.0.0.1';
}

// Cross-site iframe (console.cycloid.io → api.us.cycloid.io): cookies need SameSite=None.
// Path=/ covers all iframe URLs on the API host. URL session fallback if cookies are blocked.
$sessionDir = '/tmp/adminer-php-sessions';
if (!is_dir($sessionDir)) {
    mkdir($sessionDir, 0700, true);
}
session_save_path($sessionDir);
session_set_cookie_params([
    'lifetime' => 0,
    'path' => '/',
    'secure' => true,
    'httponly' => true,
    'samesite' => 'None',
]);
ini_set('session.use_trans_sid', '1');
ini_set('session.use_only_cookies', '0');

// Node proxy injects Adminer session via headers (browser cookies are unreliable in cross-site iframes).
foreach (['adminer_sid' => 'HTTP_X_CY_ADMINER_SID', 'adminer_key' => 'HTTP_X_CY_ADMINER_KEY'] as $cookie => $header) {
    if (!empty($_SERVER[$header])) {
        $_COOKIE[$cookie] = $_SERVER[$header];
    }
}

require __DIR__ . '/adminer.php';
