console.log("Call.js chargé");

// ---------------------------------------------
// WebSocket — une seule connexion globale
// ---------------------------------------------
const ws = new WebSocket("wss://lightcall-backend.onrender.com");

let localStream = null;
const peers = {};

// ---------------------------------------------
// FIX : initCallPage() est appelée par le router
// dans script.js quand on navigue vers /call/:id
// On n'exécute RIEN automatiquement au chargement.
// ---------------------------------------------
function initCallPage(channelId) {
    console.log("Page call initialisée pour le salon :", channelId);

    // Réinitialiser l'état visuel
    const videosDiv = document.getElementById("videos");
    if (videosDiv) videosDiv.innerHTML = "";

    // Récupérer les boutons (ils existent maintenant car la page est active)
    const joinBtn       = document.getElementById("joinBtn");
    const toggleCamBtn  = document.getElementById("toggleCamBtn");
    const toggleMicBtn  = document.getElementById("toggleMicBtn");
    const shareBtn      = document.getElementById("shareBtn");

    if (!joinBtn) {
        console.error("Boutons de l'appel introuvables dans le DOM");
        return;
    }

    // Réinitialiser les boutons (évite les doublons d'événements si on revient)
    joinBtn.disabled = false;
    joinBtn.onclick = () => startCall(channelId, videosDiv);
    toggleMicBtn.onclick = toggleMic;
    toggleCamBtn.onclick = () => toggleCamera();
    shareBtn.onclick = shareScreen;
}

// ---------------------------------------------
// 1) Démarrer l'appel
// ---------------------------------------------
async function startCall(channelId, videosDiv) {
    const joinBtn = document.getElementById("joinBtn");
    joinBtn.disabled = true;

    const ok = await resetCamera();
    if (!ok) {
        alert("Impossible d'accéder à la caméra ou au micro.");
        joinBtn.disabled = false;
        return;
    }

    const userId = localStorage.getItem("userId");
    addVideoStream(localStream, userId, videosDiv);

    // Détection voix locale
    setTimeout(() => {
        const video = document.getElementById("video_" + userId);
        if (video) detectSpeaking(localStream, video);
    }, 200);

    ws.send(JSON.stringify({
        type: "join",
        id: userId,
        channel: channelId
    }));
}

// ---------------------------------------------
// 2) WebSocket messages
// ---------------------------------------------
ws.onmessage = async (msg) => {
    const data = JSON.parse(msg.data);
    const userId = localStorage.getItem("userId");
    if (data.id === userId) return;

    const videosDiv = document.getElementById("videos");

    switch (data.type) {
        case "join":
            if (localStream) createPeerConnection(data.id, true, videosDiv);
            break;

        case "offer":
            await handleOffer(data, videosDiv);
            break;

        case "answer":
            await handleAnswer(data);
            break;

        case "ice":
            if (peers[data.id]) {
                try {
                    await peers[data.id].pc.addIceCandidate(data.candidate);
                } catch (e) {
                    console.error("Erreur ICE:", e);
                }
            }
            break;

        case "mic":
            const container = document.getElementById("video_container_" + data.id);
            if (container) container.classList.toggle("mic-off", !data.enabled);
            break;

        case "leave":
            // Nettoyer la vidéo du pair qui part
            const leaveContainer = document.getElementById("video_container_" + data.id);
            if (leaveContainer) leaveContainer.remove();
            if (peers[data.id]) {
                peers[data.id].pc.close();
                delete peers[data.id];
            }
            break;
    }
};

// ---------------------------------------------
// 3) WebRTC
// ---------------------------------------------
function createPeerConnection(remoteId, isInitiator, videosDiv) {
    const userId = localStorage.getItem("userId");

    const pc = new RTCPeerConnection({
        iceServers: [
            { urls: "stun:stun.l.google.com:19302" },
            {
                urls: "turn:global.relay.metered.ca:80",
                username: "open",
                credential: "open"
            }
        ]
    });

    peers[remoteId] = { pc };

    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

    pc.ontrack = (event) => {
        const stream = event.streams[0];
        const vDiv = videosDiv || document.getElementById("videos");
        addVideoStream(stream, remoteId, vDiv);

        const video = document.getElementById("video_" + remoteId);
        const audioTrack = stream.getAudioTracks()[0];
        if (audioTrack && video) detectSpeaking(new MediaStream([audioTrack]), video);
    };

    pc.onicecandidate = (event) => {
        if (event.candidate) {
            ws.send(JSON.stringify({
                type: "ice",
                id: userId,
                target: remoteId,
                candidate: event.candidate
            }));
        }
    };

    if (isInitiator) createOffer(remoteId, userId);
}

async function createOffer(remoteId, userId) {
    const pc = peers[remoteId].pc;
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    ws.send(JSON.stringify({ type: "offer", id: userId, target: remoteId, offer }));
}

async function handleOffer(data, videosDiv) {
    const userId = localStorage.getItem("userId");
    createPeerConnection(data.id, false, videosDiv);
    const pc = peers[data.id].pc;
    await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    ws.send(JSON.stringify({ type: "answer", id: userId, target: data.id, answer }));
}

async function handleAnswer(data) {
    const pc = peers[data.id].pc;
    await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
}

// ---------------------------------------------
// 4) Afficher une vidéo
// ---------------------------------------------
function addVideoStream(stream, id, videosDiv) {
    const container_id = "video_container_" + id;
    let container = document.getElementById(container_id);
    const userId = localStorage.getItem("userId");
    const vDiv = videosDiv || document.getElementById("videos");

    if (!container) {
        container = document.createElement("div");
        container.id = container_id;
        container.className = "video-container";

        const placeholder = document.createElement("div");
        placeholder.className = "placeholder";
        placeholder.innerText = "Caméra désactivée";
        placeholder.id = "placeholder_" + id;

        const video = document.createElement("video");
        video.id = "video_" + id;
        video.className = "call-video";
        video.autoplay = true;
        video.playsInline = true;

        if (id === userId) {
            video.muted = true;
            video.style.transform = "scaleX(-1)";
        }

        container.appendChild(placeholder);
        container.appendChild(video);
        if (vDiv) vDiv.appendChild(container);
    }

    const video = document.getElementById("video_" + id);
    video.srcObject = stream;
    video.onloadedmetadata = () => {
        video.play();
        if (id === userId) {
            const ph = document.getElementById("placeholder_" + id);
            if (ph) ph.style.display = "none";
        }
    };
}

// ---------------------------------------------
// 5) Caméra / Micro
// ---------------------------------------------
let micEnabled = true;

function toggleMic() {
    if (!localStream) return;
    micEnabled = !micEnabled;

    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) audioTrack.enabled = micEnabled;

    const userId = localStorage.getItem("userId");
    const container = document.getElementById("video_container_" + userId);
    if (container) container.classList.toggle("mic-off", !micEnabled);

    ws.send(JSON.stringify({ type: "mic", id: userId, enabled: micEnabled }));
}

// Variable d'état caméra (en haut du fichier, avec les autres variables)
let cameraEnabled = true;

async function toggleCamera() {
    if (!localStream) return;
    const userId = localStorage.getItem("userId");
    const container = document.getElementById("video_container_" + userId);
    const videoElement = document.getElementById("video_" + userId);
    if (!container || !videoElement) return;

    if (cameraEnabled) {
        // Fermer complètement la caméra
        localStream.getVideoTracks().forEach(t => t.stop());
        videoElement.srcObject = null;
        container.classList.add("cam-off");
        cameraEnabled = false;

    } else {
        // Rouvrir la caméra
        try {
            const newStream = await navigator.mediaDevices.getUserMedia({
                video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } }
            });
            const newTrack = newStream.getVideoTracks()[0];

            // Retirer l'ancienne piste et ajouter la nouvelle
            localStream.getVideoTracks().forEach(t => localStream.removeTrack(t));
            localStream.addTrack(newTrack);
            videoElement.srcObject = localStream;

            // Mettre à jour tous les peers WebRTC
            for (const id in peers) {
                const sender = peers[id].pc.getSenders().find(s => s.track && s.track.kind === "video");
                if (sender) await sender.replaceTrack(newTrack);
            }

            container.classList.remove("cam-off");
            cameraEnabled = true;

        } catch (e) {
            console.error("Impossible de rouvrir la caméra :", e);
            alert("Impossible d'accéder à la caméra.");
        }
    }
}

// Appelée quand on quitte l'appel
function stopCall() {
    // Fermer tous les tracks (caméra + micro)
    if (localStream) {
        localStream.getTracks().forEach(t => t.stop());
        localStream = null;
    }

    // Fermer toutes les connexions WebRTC
    for (const id in peers) {
        peers[id].pc.close();
        delete peers[id];
    }

    // Notifier les autres qu'on part
    const userId = localStorage.getItem("userId");
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "leave", id: userId }));
    }

    // Réinitialiser l'état
    cameraEnabled = true;
    micEnabled = true;

    console.log("Appel terminé, caméra et micro fermés.");
}

async function resetCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, min: 24 } },
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        });
        localStream = stream;
        return true;
    } catch (e) {
        console.error("Impossible d'accéder à la caméra :", e);
        return false;
    }
}

// ---------------------------------------------
// 6) Partage d'écran
// ---------------------------------------------
async function shareScreen() {
    try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const screenTrack = screenStream.getVideoTracks()[0];
        const userId = localStorage.getItem("userId");
        const videosDiv = document.getElementById("videos");

        // Ajouter un nouveau tile pour le partage — camera reste intacte
        addScreenStream(screenStream, userId, videosDiv);

        // Les peers voient le partage à la place de la caméra
        for (const id in peers) {
            const sender = peers[id].pc.getSenders().find(s => s.track && s.track.kind === "video");
            if (sender) sender.replaceTrack(screenTrack);
        }

        // Quand on arrête le partage
        screenTrack.onended = () => {
            const screenContainer = document.getElementById("screen_container_" + userId);
            if (screenContainer) screenContainer.remove();

            // Remettre la caméra pour les peers
            const camTrack = localStream?.getVideoTracks()[0];
            if (camTrack) {
                for (const id in peers) {
                    const sender = peers[id].pc.getSenders().find(s => s.track && s.track.kind === "video");
                    if (sender) sender.replaceTrack(camTrack);
                }
            }
        };

    } catch (e) {
        console.log("Partage d'écran annulé");
    }
}

function addScreenStream(stream, userId, videosDiv) {
    const existing = document.getElementById("screen_container_" + userId);
    if (existing) existing.remove();

    const container = document.createElement("div");
    container.id = "screen_container_" + userId;
    container.className = "video-container";
    container.style.border = "4px solid #5865f2";

    const label = document.createElement("div");
    label.style.cssText = `
        position: absolute; top: 8px; left: 8px;
        background: rgba(0,0,0,0.6); color: white;
        padding: 2px 8px; border-radius: 4px;
        font-size: 12px; z-index: 3;
    `;
    label.textContent = "🖥️ Partage d'écran";

    const video = document.createElement("video");
    video.className = "call-video";
    video.autoplay = true;
    video.playsInline = true;
    video.muted = true;

    container.appendChild(label);
    container.appendChild(video);

    // FIX : ajouter au DOM D'ABORD, puis assigner le stream
    if (videosDiv) videosDiv.appendChild(container);

    video.srcObject = stream;
    video.onloadedmetadata = () => video.play().catch(e => console.error("Erreur play screen:", e));
}

// ---------------------------------------------
// 7) Détection de voix
// ---------------------------------------------
function detectSpeaking(stream, videoElement) {
    try {
        const audioContext = new AudioContext();
        const analyser = audioContext.createAnalyser();
        const microphone = audioContext.createMediaStreamSource(stream);

        analyser.fftSize = 512;
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        microphone.connect(analyser);

        let speakingTimeout = null;

        function checkVolume() {
            analyser.getByteFrequencyData(dataArray);
            const volume = dataArray.reduce((a, b) => a + b) / dataArray.length;

            if (volume > 20) {
                if (videoElement.parentElement) videoElement.parentElement.classList.add("speaking");
                if (speakingTimeout) { clearTimeout(speakingTimeout); speakingTimeout = null; }
            } else {
                if (!speakingTimeout) {
                    speakingTimeout = setTimeout(() => {
                        if (videoElement.parentElement) videoElement.parentElement.classList.remove("speaking");
                        speakingTimeout = null;
                    }, 400);
                }
            }
            requestAnimationFrame(checkVolume);
        }

        checkVolume();
    } catch (e) {
        console.error("Erreur détection voix:", e);
    }
}
