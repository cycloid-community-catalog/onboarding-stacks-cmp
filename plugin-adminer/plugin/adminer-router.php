<?php
// Route every request to Adminer (single-file distribution).
// Adminer expects a normal web SAPI environment; fill gaps when proxied.
if (!isset($_SERVER['REQUEST_URI']) || $_SERVER['REQUEST_URI'] === '') {
    $_SERVER['REQUEST_URI'] = '/';
}
if (!isset($_SERVER['HTTP_HOST']) || $_SERVER['HTTP_HOST'] === '') {
    $_SERVER['HTTP_HOST'] = '127.0.0.1';
}

require __DIR__ . '/adminer.php';
