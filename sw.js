// Service worker minimal — juste assez pour rendre l'app installable
self.addEventListener("install", (event) => {
    self.skipWaiting();
});

self.addEventListener("activate", (event) => {
    self.clients.claim();
});

// Pas de cache pour l'instant — toujours aller chercher le réseau
self.addEventListener("fetch", (event) => {
    event.respondWith(fetch(event.request));
});