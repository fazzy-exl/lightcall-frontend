console.log("Call.js chargé");

// ---------------------------------------------
// WebSocket — une seule connexion globale
// ---------------------------------------------
const ws = new WebSocket("wss://lightcall-backend.onrender.com");

let localStream = null;
let audioCtx = null; // ← ajoute en haut avec les autres variables
let originalStream = null;
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

    // FIX : demander seulement le micro, pas la caméra
    const ok = await resetCamera(false); // false = caméra fermée
    if (!ok) {
        alert("Impossible d'accéder au micro.");
        joinBtn.disabled = false;
        return;
    }

    // FIX : afficher les boutons et cacher "Rejoindre"
    document.getElementById("call-panel").classList.add("call-active");
    joinBtn.style.display = "none";

    const userId = localStorage.getItem("userId");
    addVideoStream(localStream, userId, videosDiv);

    // FIX : marquer la caméra comme fermée visuellement
    const container = document.getElementById("video_container_" + userId);
    if (container) container.classList.add("cam-off");
    cameraEnabled = false;

    setTimeout(() => {
        const video = document.getElementById("video_" + userId);
        if (video) detectSpeaking(localStream, video);
    }, 200);

    ws.send(JSON.stringify({
        type: "join",
        id: userId,
        channel: channelId
    }));

    joinSound.play().catch(() => {});
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
        placeholder.id = "placeholder_" + id;

        // FIX : utiliser l'avatar au lieu du texte
        const avatarImg = document.createElement("img");
        avatarImg.src = "/images/Casque Transparent.JPEG";
        avatarImg.style.width = "100px";
        avatarImg.style.height = "100px";
        avatarImg.style.borderRadius = "50%";
        avatarImg.style.objectFit = "cover";
        placeholder.appendChild(avatarImg);

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
            // FIX : ne cacher le placeholder que si la caméra est vraiment activée
            if (ph && typeof cameraEnabled !== "undefined" && cameraEnabled) {
                ph.style.display = "none";
            }
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
        camOffSound.play().catch(() => {});
        localStream.getVideoTracks().forEach(t => t.stop());
        videoElement.srcObject = null;
        container.classList.add("cam-off");
        cameraEnabled = false;

    } else {
        camOnSound.play().catch(() => {});
        // Afficher l'animation
        const spinner = document.createElement("div");
        spinner.className = "cam-loading";
        spinner.id = "cam-spinner-" + userId;
        spinner.innerHTML = `
            <div class="cam-dots">
                <div class="cam-dot"></div>
                <div class="cam-dot"></div>
                <div class="cam-dot"></div>
            </div>
        `;
        container.appendChild(spinner);

        try {
            const newStream = await navigator.mediaDevices.getUserMedia({
                video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } }
            });
            const newTrack = newStream.getVideoTracks()[0];

            localStream.getVideoTracks().forEach(t => localStream.removeTrack(t));
            localStream.addTrack(newTrack);
            videoElement.srcObject = localStream;

            for (const id in peers) {
                const sender = peers[id].pc.getSenders().find(s => s.track && s.track.kind === "video");
                if (sender) await sender.replaceTrack(newTrack);
            }

            // Retirer le spinner quand la vidéo est prête
            videoElement.onloadedmetadata = () => {
                videoElement.play();
                const sp = document.getElementById("cam-spinner-" + userId);
                if (sp) sp.remove();
            };

            container.classList.remove("cam-off");
            cameraEnabled = true;

        } catch (e) {
            const sp = document.getElementById("cam-spinner-" + userId);
            if (sp) sp.remove();
            console.error("Impossible de rouvrir la caméra :", e);
            alert("Impossible d'accéder à la caméra.");
        }
    }
}

// Appelée quand on quitte l'appel
function stopCall() {
    leaveSound.play().catch(() => {});

    // FIX : stopper le stream original (celui qui tient le vrai micro)
    if (originalStream) {
        originalStream.getTracks().forEach(t => t.stop());
        originalStream = null;
    }

    // FIX : fermer l'AudioContext pour libérer le micro
    if (audioCtx) {
        audioCtx.close();
        audioCtx = null;
    }

    if (localStream) {
        localStream.getTracks().forEach(t => t.stop()); // ← arrête caméra ET micro
        localStream = null;
    }

    for (const id in peers) {
        peers[id].pc.close();
        delete peers[id];
    }

    const userId = localStorage.getItem("userId");
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "leave", id: userId }));
    }

    cameraEnabled = true;
    micEnabled = true;

    // FIX : réinitialiser les boutons
    const callPanel = document.getElementById("call-panel");
    if (callPanel) callPanel.classList.remove("call-active");
    const joinBtn = document.getElementById("joinBtn");
    if (joinBtn) { joinBtn.style.display = "block"; joinBtn.disabled = false; }

    console.log("Appel terminé, caméra et micro fermés.");
}

async function resetCamera(withVideo = true) {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: withVideo ? { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, min: 24 } } : false,
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
                sampleRate: 48000,
                channelCount: 1
            }
        });

        originalStream = stream;

        // FIX : sauvegarder l'AudioContext pour pouvoir le fermer plus tard
        audioCtx = new AudioContext();
        const source = audioCtx.createMediaStreamSource(stream);

        const highPass = audioCtx.createBiquadFilter();
        highPass.type = "highpass";
        highPass.frequency.value = 80;

        const lowPass = audioCtx.createBiquadFilter();
        lowPass.type = "lowpass";
        lowPass.frequency.value = 8000;

        source.connect(highPass);
        highPass.connect(lowPass);

        const destination = audioCtx.createMediaStreamDestination();
        lowPass.connect(destination);

        // FIX : aussi stopper le stream original
        audioCtx.originalStream = stream;

        const filteredStream = new MediaStream([
            ...stream.getVideoTracks(),
            ...destination.stream.getAudioTracks()
        ]);

        localStream = filteredStream;
        return true;

    } catch (e) {
        console.error("Impossible d'accéder à la caméra :", e);
        return false;
    }
}

// ---------------------------------------------
// 6) Partage d'écran
// ---------------------------------------------
let screenSharing = false;
let currentScreenTrack = null;

async function shareScreen() {
    const shareBtn = document.getElementById("shareBtn");

    if (screenSharing) {
        // FIX : arrêter le partage
        stopScreenShare();
        return;
    }

    try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const screenTrack = screenStream.getVideoTracks()[0];
        currentScreenTrack = screenTrack;
        const userId = localStorage.getItem("userId");
        const videosDiv = document.getElementById("videos");

        addScreenStream(screenStream, userId, videosDiv);

        for (const id in peers) {
            const sender = peers[id].pc.getSenders().find(s => s.track && s.track.kind === "video");
            if (sender) sender.replaceTrack(screenTrack);
        }

        screenSharing = true;
        shareBtn.textContent = "Arrêter le partage";
        shareBtn.style.background = "#d9534f";

        // Si l'utilisateur arrête via le bouton natif du navigateur
        screenTrack.onended = () => stopScreenShare();

    } catch (e) {
        console.log("Partage d'écran annulé");
    }
}

function stopScreenShare() {
    const shareBtn = document.getElementById("shareBtn");
    const userId = localStorage.getItem("userId");

    const screenContainer = document.getElementById("screen_container_" + userId);
    if (screenContainer) screenContainer.remove();

    if (currentScreenTrack) {
        currentScreenTrack.stop();
        currentScreenTrack = null;
    }

    const camTrack = localStream?.getVideoTracks()[0];
    for (const id in peers) {
        const sender = peers[id].pc.getSenders().find(s => s.track && s.track.kind === "video");
        if (sender) sender.replaceTrack(camTrack || null);
    }

    screenSharing = false;
    shareBtn.textContent = "Partager";
    shareBtn.style.background = "";
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

// Sons d'appel
const joinSound = new Audio("/sounds/join.wav");
const leaveSound = new Audio("/sounds/leave.wav");
joinSound.volume = 0.4;
leaveSound.volume = 0.4;

const camOnSound = new Audio("/sounds/cam-on.wav");
const camOffSound = new Audio("/sounds/cam-off.wav");
camOnSound.volume = 0.35;
camOffSound.volume = 0.35;