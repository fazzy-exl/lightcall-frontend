// Récupère l'ID du serveur dans l'URL
const params = new URLSearchParams(window.location.search);
const serverId = params.get("id");

// Charge les infos du serveur
fetch(`https://lightcall-backend.onrender.com/servers/${serverId}`)
    .then(res => res.json())
    .then(server => {
        document.getElementById("server-title").textContent = server.name;
    });

// Charge les salons
fetch(`https://lightcall-backend.onrender.com/servers/${serverId}/channels`)
    .then(res => res.json())
    .then(channels => {
        const voiceList = document.getElementById("voice-channel-list");
        voiceList.innerHTML = "";

        channels.forEach(channel => {
            const btn = document.createElement("button");
            btn.textContent = "🔊 " + channel.name;

            btn.onclick = () => {
                window.location.href = `call.html?channel=${channel.id}`;
            };

            voiceList.appendChild(btn);
        });
    });
