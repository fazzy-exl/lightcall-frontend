self.addEventListener("install", (event) => {
    self.skipWaiting();
});

self.addEventListener("activate", (event) => {
    self.clients.claim();
});

self.addEventListener("fetch", (event) => {
    event.respondWith(
        fetch(event.request).catch(() => {
            // En cas d'échec réseau, on laisse simplement échouer normalement
            return new Response("Erreur réseau", {
                status: 503,
                statusText: "Service Unavailable"
            });
        })
    );
});