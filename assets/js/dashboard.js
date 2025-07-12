document.addEventListener("DOMContentLoaded", () => {
    // --- AUTH CHECK & CONFIG ---
    if (localStorage.getItem('isLoggedIn') !== 'true') {
        window.location.href = 'login.html';
        return;
    }
    // GANTI IP ADDRESS INI DENGAN IP NODE-RED ANDA
    const NODE_RED_URL = 'https://wastelog-nodered-services.up.railway.app';
    const WEBSOCKET_URL = 'https://wastelog-nodered-services.up.railway.app/ws/realtimelocation';
    const DEVICE_ID = 'gps_wastelog_01';

    // --- ELEMENTS ---
    const dashboardContainer = document.getElementById('dashboard-container');
    const sidebarToggle = document.getElementById('sidebar-toggle');
    const calendarEl = document.getElementById('calendar');
    const logoutButton = document.getElementById('logoutButton');
    const manualMeasureBtn = document.getElementById('manualMeasureBtn');
    const mapElement = document.getElementById('map');
    const addGeofenceBtn = document.getElementById('addGeofenceBtn');
    const geofenceFormContainer = document.getElementById('geofenceFormContainer');
    const geofenceForm = document.getElementById('geofenceForm');
    const cancelGeofenceBtn = document.getElementById('cancelGeofence');
    const geofenceTableBody = document.querySelector('#geofenceTable tbody');
    const eventPopover = document.getElementById('event-popover');
    
    // Elemen baru untuk hasil pengukuran manual
    const manualMeasureResultCard = document.getElementById('manualMeasureResultCard');
    const manualVolumeEl = document.getElementById('manualVolume');
    const manualDistanceEl = document.getElementById('manualDistance');
    const manualTimestampEl = document.getElementById('manualTimestamp');
      
    // --- STATE ---
    let geofenceData = []; 

    // --- MAP SETUP ---
    const map = L.map(mapElement).setView([-7.414038, 109.373714], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(map);
    const vehicleIcon = L.icon({ iconUrl: 'assets/images/truck.png', iconSize: [45, 45], iconAnchor: [22, 44], popupAnchor: [0, -45] });
    let vehicleMarker = L.marker([0, 0], { icon: vehicleIcon }).addTo(map).bindPopup("Lokasi Truk Sampah");
    let geofenceLayers = L.layerGroup().addTo(map);

    // --- FUNGSI-FUNGSI ---
    const fetchInitialVehicleLocation = async () => {
        try {
            const response = await fetch(`${NODE_RED_URL}/api/realtimelocation?deviceId=${DEVICE_ID}`);
            if (!response.ok) throw new Error(`Server Response: ${response.status}`);
            const data = await response.json();
            if (data.latitude && data.longitude) {
                const initialLatLng = [data.latitude, data.longitude];
                vehicleMarker.setLatLng(initialLatLng);
                map.setView(initialLatLng, 16);
            }
        } catch (error) {
            console.error("Gagal mengambil lokasi awal:", error);
        }
    };
    
    const connectWebSocket = () => {
        const ws = new WebSocket(WEBSOCKET_URL);
        ws.onopen = () => console.log('WebSocket terhubung!');
        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.latitude && data.longitude) {
                    const newLatLng = [data.latitude, data.longitude];
                    if(vehicleMarker) {
                       vehicleMarker.setLatLng(newLatLng);
                       map.panTo(newLatLng);
                    }
                }
            } catch (e) {
                console.error("Gagal mem-parsing data WebSocket:", e);
            }
        };
        ws.onerror = (err) => console.error('WebSocket error:', err);
        ws.onclose = () => {
            console.log('WebSocket terputus. Mencoba menghubungkan kembali dalam 5 detik...');
            setTimeout(connectWebSocket, 5000);
        };
    };

    const renderGeofences = (geofences) => {
        geofenceLayers.clearLayers();
        geofenceTableBody.innerHTML = '';
        geofences.forEach(fence => {
            const innerRadius = Math.min(fence.radius1, fence.radius2);
            const outerRadius = Math.max(fence.radius1, fence.radius2);
            L.circle([fence.latitude, fence.longitude], { radius: innerRadius, color: '#2E7D32', weight: 2, fillOpacity: 0.1 }).addTo(geofenceLayers).bindTooltip(fence.nama);
            L.circle([fence.latitude, fence.longitude], { radius: outerRadius, color: '#D32F2F', weight: 2, fillOpacity: 0.1, dashArray: '5, 10' }).addTo(geofenceLayers);
            
            const row = document.createElement('tr');
            row.setAttribute('data-id', fence.id);
            row.innerHTML = `
                <td>${fence.nama}</td>
                <td>
                    <button class="btn btn-secondary btn-sm edit-btn" data-id="${fence.id}">Edit</button> 
                    <button class="btn btn-danger btn-sm delete-btn" data-id="${fence.id}">Hapus</button>
                </td>`;
            geofenceTableBody.appendChild(row);
        });
    };
      
    const fetchAndDisplayGeofences = async () => { 
        try { 
            const response = await fetch(`${NODE_RED_URL}/api/geofences`);
            if (!response.ok) throw new Error("Gagal mengambil data dari server");
            const fences = await response.json();
            geofenceData = fences;
            renderGeofences(geofenceData);
        } catch (error) { 
            console.error('Gagal mengambil data geofence:', error);
            alert('Gagal memuat data area geofence.');
        } 
    };
      
    const showGeofenceForm = (fence = null) => {
        if (fence) {
            document.getElementById('geofenceId').value = fence.id;
            document.getElementById('geofenceName').value = fence.nama;
            document.getElementById('geofenceLat').value = fence.latitude;
            document.getElementById('geofenceLon').value = fence.longitude;
            document.getElementById('geofenceRadius1').value = Math.min(fence.radius1, fence.radius2);
            document.getElementById('geofenceRadius2').value = Math.max(fence.radius1, fence.radius2);
        } else {
            geofenceForm.reset();
            document.getElementById('geofenceId').value = '';
        }
        geofenceFormContainer.classList.remove('hidden');
    };
    
    // --- EVENT LISTENERS ---
    sidebarToggle.addEventListener('click', () => {
        dashboardContainer.classList.toggle('sidebar-closed');
        setTimeout(() => map.invalidateSize(), 300); 
    });

    logoutButton.addEventListener('click', () => { 
        localStorage.removeItem('isLoggedIn'); 
        window.location.href = 'index.html'; 
    });

    // === LOGIKA PENGUKURAN MANUAL ===
    manualMeasureBtn.addEventListener('click', async () => {
        if (!confirm('Anda yakin ingin memicu pengukuran volume manual?')) return;
        
        const originalButtonText = manualMeasureBtn.innerHTML;
        manualMeasureBtn.disabled = true;
        manualMeasureBtn.innerHTML = `<i class="fas fa-spinner fa-spin fa-fw"></i> <span class="nav-text">Mengukur...</span>`;
        manualMeasureResultCard.style.display = 'none';

        try {
            // 1. Kirim perintah untuk mulai mengukur
            const postResponse = await fetch(`${NODE_RED_URL}/api/measure`, { method: 'POST' });
            if (postResponse.status !== 202) throw new Error(`Server tidak bisa memulai pengukuran. Status: ${postResponse.status}`);
            
            // 2. Beri jeda waktu untuk sensor bekerja dan data disimpan di Firestore
            await new Promise(resolve => setTimeout(resolve, 5000)); // Tunggu 5 detik

            // 3. Ambil hasil pengukuran terakhir dari endpoint yang BENAR
            // Menggunakan /api/current_volume karena data manual hanya disimpan di sana.
            const getResponse = await fetch(`${NODE_RED_URL}/api/current_volume?deviceId=${DEVICE_ID}`);
            if (!getResponse.ok) {
                // Coba berikan pesan error yang lebih deskriptif
                if(getResponse.status === 404) {
                    throw new Error(`Data pengukuran manual untuk device '${DEVICE_ID}' belum ditemukan.`);
                }
                throw new Error(`Tidak bisa mengambil hasil pengukuran. Status: ${getResponse.status}`);
            }

            const result = await getResponse.json();

            // 4. Tampilkan hasilnya di kartu
            manualVolumeEl.textContent = `${result.calculatedVolume_liter.toFixed(2)} Liter`;
            manualDistanceEl.textContent = `${result.distance_cm} cm`;
            manualTimestampEl.textContent = new Date(result.timestamp).toLocaleString('id-ID');
            manualMeasureResultCard.style.display = 'block';

        } catch (error) { 
            console.error('Gagal melakukan pengukuran manual:', error); 
            alert(`Gagal melakukan pengukuran manual. \n\nError: ${error.message}`);
        } finally {
            // Kembalikan tombol ke keadaan semula
            manualMeasureBtn.disabled = false;
            manualMeasureBtn.innerHTML = originalButtonText;
        }
    });

    addGeofenceBtn.addEventListener('click', () => showGeofenceForm());
    cancelGeofenceBtn.addEventListener('click', () => geofenceFormContainer.classList.add('hidden'));
    
    map.on('click', (e) => { 
        if (!geofenceFormContainer.classList.contains('hidden')) { 
            document.getElementById('geofenceLat').value = e.latlng.lat.toFixed(6); 
            document.getElementById('geofenceLon').value = e.latlng.lng.toFixed(6); 
        } 
    });
      
    geofenceForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('geofenceId').value;
        const body = { 
            nama: document.getElementById('geofenceName').value, 
            latitude: parseFloat(document.getElementById('geofenceLat').value), 
            longitude: parseFloat(document.getElementById('geofenceLon').value), 
            radius1: parseInt(document.getElementById('geofenceRadius1').value, 10), 
            radius2: parseInt(document.getElementById('geofenceRadius2').value, 10)
        };
        const url = id ? `${NODE_RED_URL}/api/geofences/${id}` : `${NODE_RED_URL}/api/geofences`;
        const method = id ? 'PUT' : 'POST';
        try {
            const response = await fetch(url, { method: method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), });
            if (response.ok) {
                geofenceFormContainer.classList.add('hidden');
                fetchAndDisplayGeofences();
            } else {
                alert('Gagal menyimpan geofence. Status: ' + response.status);
            }
        } catch (error) { 
            console.error('Error menyimpan geofence:', error); 
            alert('Terjadi kesalahan saat menyimpan data.');
        }
    });

    geofenceTableBody.addEventListener('click', async (e) => {
        const target = e.target.closest('button');
        if (!target) return;
        const id = target.dataset.id;
        if (!id) return;
        if (target.classList.contains('edit-btn')) {
            const fenceToEdit = geofenceData.find(f => f.id === id);
            if (fenceToEdit) showGeofenceForm(fenceToEdit);
        }
        if (target.classList.contains('delete-btn')) {
            if (confirm('Anda yakin ingin menghapus area ini?')) {
                try {
                    await fetch(`${NODE_RED_URL}/api/geofences/${id}`, { method: 'DELETE' });
                    fetchAndDisplayGeofences();
                } catch (error) {
                    console.error('Gagal menghapus geofence:', error);
                    alert('Gagal menghapus area.');
                }
            }
        }
    });
      
    // --- KALENDER SETUP & LOGIKA ---
    const formatTime = (dateStr) => dateStr ? new Date(dateStr).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }).replace(/\./g,':') : '-';
    const formatDuration = (seconds) => (seconds === null || seconds === undefined) ? '-' : `${Math.round(seconds / 60)} menit`;
    const formatVolume = (liters) => (liters === null || liters === undefined) ? '-' : `${liters.toFixed(2)} L`;
      
    const calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',
        locale: 'id',
        headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,dayGridWeek,listWeek' },
        buttonText: { dayGridMonth: 'Bulan', dayGridWeek: 'Minggu', listWeek: 'Daftar' },
        eventContent: (arg) => {
            const props = arg.event.extendedProps;
            if (arg.view.type.includes('dayGrid')) {
                let html = `<div class="event-pill">`;
                if (props.volume !== null && props.volume !== undefined) html += `<i class="fas fa-box-open event-icon"></i>`;
                html += `${arg.event.title}</div>`;
                return { html };
            }
            if (arg.view.type === 'listWeek') {
                const listTitle = `${arg.event.title} | ${formatTime(props.entryTime)} - ${formatTime(props.exitTime)} | Dur: ${formatDuration(props.durationSeconds)} | Vol: ${formatVolume(props.volume)}`;
                return { domNodes: [document.createTextNode(listTitle)] };
            }
            return null;
        },
        eventClick: (info) => {
            info.jsEvent.preventDefault();
            const props = info.event.extendedProps;
            eventPopover.innerHTML = `<div class="event-popover-title">${info.event.title}</div><div class="event-popover-body"><div><i class="far fa-clock"></i> ${formatTime(props.entryTime)} - ${formatTime(props.exitTime)}</div><div><i class="fas fa-hourglass-half"></i> ${formatDuration(props.durationSeconds)}</div><div><i class="fas fa-box-open"></i> ${formatVolume(props.volume)}</div></div>`;
            const rect = info.el.getBoundingClientRect();
            eventPopover.style.display = 'block';
            eventPopover.style.left = `${rect.left + window.scrollX}px`;
            eventPopover.style.top = `${rect.bottom + window.scrollY + 5}px`;
            const closePopover = (e) => {
                if (!eventPopover.contains(e.target) && eventPopover.style.display === 'block') {
                    eventPopover.style.display = 'none';
                    document.removeEventListener('click', closePopover, true);
                }
            };
            document.addEventListener('click', closePopover, true);
        }
    });
    calendar.render();

    const fetchHistoryAndRender = async () => {
        try {
            const [historyRes, geofencesRes] = await Promise.all([
                fetch(`${NODE_RED_URL}/api/history?deviceId=${DEVICE_ID}`),
                fetch(`${NODE_RED_URL}/api/geofences`)
            ]);
            if (!historyRes.ok || !geofencesRes.ok) return;

            const historyLogs = await historyRes.json();
            const geofences = await geofencesRes.json();
            const geofenceMap = new Map(geofences.map(f => [f.id, f.nama]));
            const processedVisits = {};
            
            historyLogs
                .filter(log => log.event === 'EXITED' && log.areaId && log.entryTime)
                .forEach(log => {
                    const visitKey = `${log.areaId}-${log.entryTime}`;
                    processedVisits[visitKey] = {
                        start: log.entryTime,
                        title: geofenceMap.get(log.areaId) || log.areaName || 'Area Tak Dikenal',
                        entryTime: log.entryTime, exitTime: log.exitTime,
                        durationSeconds: log.durationSeconds, areaId: log.areaId, volume: null
                    };
                });
            
            historyLogs
                .filter(log => log.event === 'VOLUME_MEASUREMENT' && log.areaId && log.source === 'auto_exit') // Hanya proses volume dari log otomatis
                .forEach(volumeLog => {
                    const measureTime = new Date(volumeLog.timestamp).getTime();
                    const relevantVisit = Object.values(processedVisits)
                        .filter(visit => 
                            visit.areaId === volumeLog.areaId && 
                            new Date(visit.exitTime).getTime() <= measureTime
                        )
                        .sort((a, b) => new Date(b.exitTime) - new Date(a.exitTime))[0];
                    if (relevantVisit && relevantVisit.volume === null) {
                        relevantVisit.volume = volumeLog.calculatedVolume_liter;
                    }
                });
                
            const calendarEvents = Object.values(processedVisits).map(visit => ({
                title: visit.title, start: visit.start, extendedProps: visit
            }));
            
            calendar.getEventSources().forEach(source => source.remove());
            calendar.addEventSource(calendarEvents);

        } catch (error) {
            console.error('Terjadi error saat memproses data histori:', error);
        }
    };
      
    // --- INISIALISASI DASHBOARD ---
    const initializeDashboard = () => {
        fetchInitialVehicleLocation(); 
        connectWebSocket();
        fetchAndDisplayGeofences();
        fetchHistoryAndRender();
        setInterval(fetchHistoryAndRender, 60000); 
    };

    initializeDashboard();
});
