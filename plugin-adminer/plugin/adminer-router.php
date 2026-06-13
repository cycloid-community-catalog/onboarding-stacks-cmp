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
session_set_cookie_params([
    'lifetime' => 0,
    'path' => '/',
    'secure' => true,
    'httponly' => true,
    'samesite' => 'None',
]);
ini_set('session.use_trans_sid', '1');
ini_set('session.use_only_cookies', '0');

require __DIR__ . '/adminer.php';
