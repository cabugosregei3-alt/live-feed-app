<template>
  <ion-page>
    <ion-header class="ion-no-border">
      <ion-toolbar>
        <ion-title>Live Feed</ion-title>
        <ion-buttons slot="end">
          <ion-button v-if="isRouting" @click="clearRoute" color="danger" fill="clear">
            Clear Route
          </ion-button>
          <ion-button @click="manualRefresh" class="refresh-btn">
            <ion-icon slot="icon-only" :icon="refreshOutline" :class="{ 'spinning': isRefreshing }"></ion-icon>
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content :scroll-y="false" class="map-content">
      <div v-if="isCalibrating" class="calibration-overlay">
        <ion-spinner name="crescent"></ion-spinner>
        <p>Connecting to Satellites...</p>
      </div>

      <div class="search-container" v-if="!isCalibrating">
        <ion-searchbar 
          v-model="searchQuery" 
          placeholder="Search global spots..." 
          @ionInput="handleSearch"
          class="custom-searchbar">
        </ion-searchbar>
        
        <ion-list v-if="searchResults.length > 0" class="search-results-list">
          <ion-item v-for="result in searchResults" :key="result.id" button @click="selectSearchResult(result)">
            <ion-label>
              <h2>{{ result.description }}</h2>
              <p>Official Spot 🌟</p>
            </ion-label>
            <ion-icon :icon="navigateOutline" slot="end" color="primary"></ion-icon>
          </ion-item>
        </ion-list>
      </div>

      <div class="map-overlay-stats" v-if="!isCalibrating">
        <div class="stat-badge">
          <div class="pulse-green"></div>
          <span>{{ friends.length }} Friends Online | {{ customPins.length }} Friend Notes</span>
        </div>
        <div class="instruction-toast" v-if="!isRouting">Tap map to leave a note</div>
      </div>

      <div class="map-wrapper">
        <l-map ref="mapInstance" v-model:zoom="zoom" :center="mapCenter" :use-global-leaflet="true"
          :options="{ zoomControl: false, attributionControl: false }" @ready="onMapReady" @click="handleMapClick">
          
          <l-tile-layer url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" layer-type="base" name="CartoDB"></l-tile-layer>

          <l-marker v-if="isModalOpen && !editingPinId && pendingCoords" :lat-lng="[pendingCoords.lat, pendingCoords.lng]">
            <l-icon :icon-size="[35, 35]" :icon-anchor="[17, 35]">
              <div class="custom-note-pin ghost-pin">📍</div>
            </l-icon>
          </l-marker>

          <l-marker v-for="spot in globalSpots" :key="'global-'+spot.id" :lat-lng="[spot.lat, spot.lng]" @click="presentActionSheet(spot, 'global')">
            <l-icon :icon-size="[40, 40]" :icon-anchor="[20, 40]">
              <div class="global-spot-pin">🌟</div>
            </l-icon>
            <l-tooltip :options="{ direction: 'top', className: 'global-tooltip' }">
              <strong>OFFICIAL</strong>: {{ spot.description }}
            </l-tooltip>
          </l-marker>

          <l-marker v-for="pin in customPins" :key="'pin-'+pin.id" :lat-lng="[pin.lat, pin.lng]" @click="presentActionSheet(pin, 'user')">
            <l-icon :icon-size="[35, 35]" :icon-anchor="[17, 35]">
              <div class="custom-note-pin">📍</div>
            </l-icon>
            <l-tooltip :options="{ direction: 'top', className: 'note-tooltip' }">
              <strong>{{ pin.profiles?.username || 'User' }}</strong>: {{ pin.description }}
            </l-tooltip>
          </l-marker>

          <l-marker :lat-lng="myCenter">
            <l-icon :icon-size="[24, 24]">
              <div class="my-location-marker">
                <div class="pulse-ring"></div>
                <div class="core-dot"></div>
              </div>
            </l-icon>
          </l-marker>

          <l-marker v-for="friend in friends" :key="friend.user_id" :lat-lng="[friend.lat, friend.lng]">
            <l-icon :icon-size="[50, 60]" :icon-anchor="[25, 60]">
              <div class="friend-marker-pin">
                <div class="avatar-box">
                  <div class="weather-mini-badge" v-if="friend.weather">
                    {{ getWeatherEmoji(friend.weather.weathercode) }}
                  </div>
                  <img v-if="friend.profiles?.avatar_url" :src="friend.profiles.avatar_url" class="map-avatar-img" />
                  <span v-else>{{ friend.profiles?.username?.charAt(0).toUpperCase() || '?' }}</span>
                </div>
                <div class="pin-beak"></div>
              </div>
            </l-icon>
          </l-marker>
        </l-map>

        <div class="map-controls">
          <button v-if="isRouting" class="control-btn recalc-btn" @click="recalculateRoute">
            <ion-icon :icon="refreshOutline"></ion-icon>
            <small>Recalc</small>
          </button>
          <button class="control-btn" @click="centerOnMe">
            <ion-icon :icon="locateOutline"></ion-icon>
          </button>
        </div>
      </div>

      <ion-modal :is-open="isModalOpen" @didDismiss="closeModal" :initial-breakpoint="0.5" :breakpoints="[0, 0.5]">
        <ion-header class="ion-no-border">
          <ion-toolbar>
            <ion-title>{{ editingPinId ? 'Update Detail' : 'Add Pin' }}</ion-title>
            <ion-buttons slot="end"><ion-button @click="closeModal">Cancel</ion-button></ion-buttons>
          </ion-toolbar>
        </ion-header>
        <ion-content class="ion-padding">
          <div class="modal-body">
            <ion-item v-if="currentUserId === ROOT_ID && !editingPinId" lines="none" class="admin-toggle-item">
              <ion-label>Post as Global Official Spot?</ion-label>
              <ion-toggle v-model="isGlobalMode" color="warning"></ion-toggle>
            </ion-item>

            <ion-item lines="none" class="input-item">
              <ion-textarea 
                v-model="newPinDesc" 
                :placeholder="isGlobalMode ? 'Describe this official spot...' : 'Leave a note for your friends...'" 
                :rows="4" 
                auto-grow>
              </ion-textarea>
            </ion-item>
            <ion-button expand="block" @click="handleSavePin" class="confirm-btn">
              {{ editingPinId ? 'Save Changes' : (isGlobalMode ? 'Drop Global Spot 🌟' : 'Drop Friend Note 📍') }}
            </ion-button>
          </div>
        </ion-content>
      </ion-modal>

      <ion-action-sheet 
        :is-open="isActionSheetOpen" 
        :header="selectedPin?.pinType === 'global' ? '🌟 Official Location' : (selectedPin?.profiles?.username + '\'s Note 📍')"
        :sub-header="selectedPin?.description" 
        :buttons="actionSheetButtons"
        @didDismiss="isActionSheetOpen = false">
      </ion-action-sheet>
    </ion-content>
  </ion-page>
</template>

<script setup>
import { ref, onMounted, onUnmounted, nextTick, computed } from 'vue';
import { LMap, LTileLayer, LMarker, LTooltip, LIcon } from "@vue-leaflet/vue-leaflet";
import L from 'leaflet';
import 'leaflet-routing-machine';
import "leaflet/dist/leaflet.css";
import { supabase } from '../lib/supabase';
import { Geolocation } from '@capacitor/geolocation';
import {
  IonPage, IonContent, IonHeader, IonToolbar, IonTitle,
  IonIcon, IonButtons, IonButton, IonModal, IonTextarea, IonItem,
  IonActionSheet, IonSpinner, IonLabel, IonToggle, toastController,
  IonSearchbar, IonList
} from '@ionic/vue';
import {
  locateOutline, refreshOutline, trashOutline, createOutline, navigateOutline
} from 'ionicons/icons';

const ROOT_ID = 'f0221dc3-cd62-47df-9752-c830594e0144'; 

const zoom = ref(15);
const myCenter = ref([0, 0]);
const mapCenter = ref([0, 0]);
const isCalibrating = ref(true);
const currentUserId = ref(null);
const friends = ref([]);
const customPins = ref([]);
const globalSpots = ref([]);
const isRefreshing = ref(false);
const mapInstance = ref(null);
const isRouting = ref(false);
let routingControl = null;
let watchId = null;

const searchQuery = ref("");
const searchResults = ref([]);
const isModalOpen = ref(false);
const isActionSheetOpen = ref(false);
const selectedPin = ref(null);
const editingPinId = ref(null);
const isGlobalMode = ref(false);
const newPinDesc = ref("");
const pendingCoords = ref(null);

const showToast = async (msg, color = 'dark') => {
  const t = await toastController.create({ message: msg, duration: 2000, color });
  t.present();
};

const getWeatherEmoji = (code) => {
  if (code <= 1) return '☀️';
  if (code <= 3) return '☁️';
  if (code <= 48) return '🌫️';
  if (code <= 67) return '🌧️';
  if (code <= 77) return '❄️';
  if (code <= 82) return '🌦️';
  return '⛈️';
};

// --- SEARCH LOGIC ---
const handleSearch = (ev) => {
  const query = ev.target.value.toLowerCase();
  if (!query) { searchResults.value = []; return; }
  searchResults.value = globalSpots.value.filter(spot => 
    spot.description.toLowerCase().includes(query)
  ).slice(0, 5); 
};

const selectSearchResult = (spot) => {
  const map = mapInstance.value?.leafletObject;
  if (map) {
    map.flyTo([spot.lat, spot.lng], 18, { duration: 1.5 });
    presentActionSheet(spot, 'global');
  }
  searchQuery.value = "";
  searchResults.value = [];
};

// --- LOCATION TRACKING ---
const startTracking = async () => {
  try {
    const permissions = await Geolocation.checkPermissions();
    if (permissions.location !== 'granted') await Geolocation.requestPermissions();
    const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 10000 });
    myCenter.value = [pos.coords.latitude, pos.coords.longitude];
    mapCenter.value = [pos.coords.latitude, pos.coords.longitude];
    isCalibrating.value = false;

    watchId = await Geolocation.watchPosition({ enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }, (position, err) => {
      if (err) return;
      if (position) {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        myCenter.value = [lat, lng];
        if (currentUserId.value) {
          supabase.from('locations').upsert({ user_id: currentUserId.value, lat, lng, updated_at: new Date() }).then();
        }
      }
    });
  } catch (e) {
    isCalibrating.value = false;
  }
};

// --- ROUTING ---
const startRouting = (pin) => {
  const map = mapInstance.value?.leafletObject;
  if (!map || !myCenter.value) return;
  selectedPin.value = pin;
  isRouting.value = true;
  if (routingControl) map.removeControl(routingControl);
  routingControl = L.Routing.control({
    waypoints: [L.latLng(myCenter.value[0], myCenter.value[1]), L.latLng(pin.lat, pin.lng)],
    lineOptions: { styles: [{ color: '#1a73e8', opacity: 0.15, weight: 9 }, { color: '#2dd36f', opacity: 0.8, weight: 6 }] },
    router: L.Routing.osrmv1({ serviceUrl: `https://router.project-osrm.org/route/v1` }),
    show: false, addWaypoints: false, draggableWaypoints: false, fitSelectedRoutes: true,
    createMarker: () => null
  }).addTo(map);
};

const recalculateRoute = () => {
  if (!routingControl || !selectedPin.value) return;
  routingControl.setWaypoints([L.latLng(myCenter.value[0], myCenter.value[1]), L.latLng(selectedPin.value.lat, selectedPin.value.lng)]);
};

const clearRoute = () => {
  const map = mapInstance.value?.leafletObject;
  if (map && routingControl) { map.removeControl(routingControl); routingControl = null; }
  isRouting.value = false;
};

// --- DATA FETCHING ---

// 1. Global Spots: Everyone sees these
const fetchGlobalSpots = async () => {
  const { data } = await supabase.from('global_spots').select('*');
  if (data) globalSpots.value = data;
};

// 2. Personal Pins: FRIENDS ONLY Logic
const fetchCustomPins = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  // Step A: Get accepted friendships
  const { data: friendshipData } = await supabase
    .from('friendships')
    .select('sender_id, receiver_id')
    .eq('status', 'accepted')
    .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`);

  // Step B: Collect Friend IDs
  const friendIds = friendshipData?.map(f => 
    f.sender_id === user.id ? f.receiver_id : f.sender_id
  ) || [];

  // Step C: Allowed IDs = Friends + Yourself
  const allowedIds = [...friendIds, user.id];

  // Step D: Query only pins from those IDs
  const { data: pinsData } = await supabase
    .from('map_pins')
    .select('*, profiles(username)')
    .in('user_id', allowedIds);

  if (pinsData) customPins.value = pinsData;
};

// 3. Live Location: Friends Only Logic
const fetchFriendsLocations = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  currentUserId.value = user.id;

  const { data: friendshipData } = await supabase
    .from('friendships').select('sender_id, receiver_id').eq('status', 'accepted')
    .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`);

  const friendIds = friendshipData?.map(f => f.sender_id === user.id ? f.receiver_id : f.sender_id) || [];
  if (friendIds.length === 0) { friends.value = []; return; }

  const { data: locationsData } = await supabase
    .from('locations').select(`lat, lng, user_id, profiles(username, avatar_url)`).in('user_id', friendIds);

  if (locationsData) {
    friends.value = await Promise.all(locationsData.map(async (f) => {
      try {
        const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${f.lat}&longitude=${f.lng}&current_weather=true`);
        const d = await res.json();
        return { ...f, weather: d.current_weather };
      } catch { return f; }
    }));
  }
};

// --- HANDLERS ---
const handleMapClick = (e) => {
  if (isRouting.value || searchQuery.value) return;
  editingPinId.value = null;
  isGlobalMode.value = false;
  pendingCoords.value = e.latlng;
  newPinDesc.value = "";
  isModalOpen.value = true;
};

const handleSavePin = async () => {
  if (!newPinDesc.value.trim() || !currentUserId.value) return;
  const table = isGlobalMode.value ? 'global_spots' : 'map_pins';
  
  if (editingPinId.value) {
    await supabase.from(table).update({ description: newPinDesc.value.trim() }).eq('id', editingPinId.value);
  } else {
    const payload = isGlobalMode.value 
      ? { title: 'Global Spot', description: newPinDesc.value.trim(), lat: pendingCoords.value.lat, lng: pendingCoords.value.lng }
      : { user_id: currentUserId.value, lat: pendingCoords.value.lat, lng: pendingCoords.value.lng, description: newPinDesc.value.trim() };
    await supabase.from(table).insert(payload);
  }
  isGlobalMode.value ? fetchGlobalSpots() : fetchCustomPins();
  closeModal();
};

const deletePin = async (id, type) => {
  const table = type === 'global' ? 'global_spots' : 'map_pins';
  await supabase.from(table).delete().eq('id', id);
  type === 'global' ? fetchGlobalSpots() : fetchCustomPins();
};

const presentActionSheet = (pin, type) => {
  selectedPin.value = { ...pin, pinType: type };
  isActionSheetOpen.value = true;
};

const actionSheetButtons = computed(() => {
  const buttons = [{ text: 'Show Path', icon: navigateOutline, handler: () => startRouting(selectedPin.value) }];
  const isOwner = selectedPin.value?.user_id === currentUserId.value;
  const isAdmin = currentUserId.value === ROOT_ID;

  if (isOwner || isAdmin) {
    buttons.push({
      text: 'Edit', icon: createOutline, 
      handler: () => {
        editingPinId.value = selectedPin.value.id;
        newPinDesc.value = selectedPin.value.description;
        isGlobalMode.value = selectedPin.value.pinType === 'global';
        isModalOpen.value = true;
      }
    }, {
      text: 'Delete', role: 'destructive', icon: trashOutline, 
      handler: () => deletePin(selectedPin.value.id, selectedPin.value.pinType)
    });
  }
  buttons.push({ text: 'Cancel', role: 'cancel' });
  return buttons;
});

const closeModal = () => { isModalOpen.value = false; editingPinId.value = null; pendingCoords.value = null; };

const onMapReady = (obj) => { nextTick(() => setTimeout(() => obj?.invalidateSize(), 400)); };

const manualRefresh = async () => {
  isRefreshing.value = true;
  await Promise.all([fetchFriendsLocations(), fetchCustomPins(), fetchGlobalSpots()]);
  setTimeout(() => isRefreshing.value = false, 600);
};

const centerOnMe = () => {
  const map = mapInstance.value?.leafletObject;
  if (map) map.flyTo(myCenter.value, 17, { duration: 1.2 });
};

onMounted(async () => {
  const { data: { user } } = await supabase.auth.getUser();
  if (user) currentUserId.value = user.id;
  await Promise.all([fetchFriendsLocations(), fetchCustomPins(), fetchGlobalSpots()]);
  startTracking();
  supabase.channel('map-sync')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'locations' }, fetchFriendsLocations)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'map_pins' }, fetchCustomPins)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'global_spots' }, fetchGlobalSpots)
    .subscribe();
});

onUnmounted(async () => { 
  if (watchId) await Geolocation.clearWatch({ id: watchId }); 
  supabase.removeAllChannels(); 
});
</script>

<style scoped>
.map-content { --background: #ffffff; height: 100%; }
.map-wrapper { height: 100%; width: 100%; position: relative; }
:deep(.leaflet-container) { height: 100% !important; width: 100% !important; background: #f8f9fa; }

/* SEARCH UI */
.search-container {
  position: absolute; top: 10px; left: 50%; transform: translateX(-50%);
  width: 92%; max-width: 500px; z-index: 1001;
}
.custom-searchbar { --border-radius: 16px; --box-shadow: 0 4px 12px rgba(0,0,0,0.12); padding: 0; }
.search-results-list {
  background: white; border-radius: 12px; margin-top: 5px; max-height: 200px;
  overflow-y: auto; box-shadow: 0 8px 16px rgba(0,0,0,0.15);
}

/* OVERLAYS */
.calibration-overlay {
  position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: white; z-index: 2000;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 15px;
}
.map-overlay-stats { position: absolute; top: 75px; left: 15px; z-index: 1000; display: flex; flex-direction: column; gap: 5px; }
.stat-badge { 
  background: white; padding: 8px 16px; border-radius: 20px; display: flex; align-items: center; gap: 10px; 
  box-shadow: 0 4px 10px rgba(0,0,0,0.1); font-weight: 700; font-size: 0.8rem; 
}
.instruction-toast {
  background: rgba(255,255,255,0.9); padding: 5px 12px; border-radius: 10px;
  font-size: 0.75rem; width: fit-content; box-shadow: 0 2px 5px rgba(0,0,0,0.05);
}

/* PINS & MARKERS */
.custom-note-pin { font-size: 30px; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3)); }
.global-spot-pin { font-size: 36px; filter: drop-shadow(0 0 8px rgba(255,193,7,0.6)); animation: float 3s infinite ease-in-out; }
@keyframes float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-5px); } }

.my-location-marker { position: relative; display: flex; align-items: center; justify-content: center; }
.core-dot { width: 14px; height: 14px; background: #2dd36f; border: 3px solid white; border-radius: 50%; z-index: 2; }
.pulse-ring { position: absolute; width: 35px; height: 35px; background: rgba(45,211,111,0.3); border-radius: 50%; animation: pulse-ring 2s infinite; }

.friend-marker-pin { display: flex; flex-direction: column; align-items: center; }
.avatar-box { 
  width: 45px; height: 45px; background: #2dd36f; border: 3px solid white; 
  border-radius: 15px; display: flex; align-items: center; justify-content: center; 
  font-weight: 800; color: white; position: relative; 
}
.map-avatar-img { width: 100%; height: 100%; object-fit: cover; border-radius: 12px; }
.pin-beak { width: 0; height: 0; border-left: 8px solid transparent; border-right: 8px solid transparent; border-top: 10px solid white; margin-top: -2px; }
.weather-mini-badge { position: absolute; top: -10px; right: -10px; font-size: 16px; z-index: 10; }

/* CONTROLS */
.map-controls { position: absolute; bottom: 30px; right: 20px; z-index: 1000; display: flex; flex-direction: column; gap: 12px; }
.control-btn { 
  width: 50px; height: 50px; background: white; border: none; border-radius: 16px; 
  display: flex; align-items: center; justify-content: center; font-size: 24px; color: #2dd36f; 
  box-shadow: 0 4px 15px rgba(0,0,0,0.15); 
}
.recalc-btn { flex-direction: column; gap: 2px; background: #2dd36f !important; color: white !important; font-size: 18px; }
.recalc-btn small { font-size: 8px; font-weight: bold; }

@keyframes pulse-ring { 0% { transform: scale(0.5); opacity: 1; } 100% { transform: scale(1.5); opacity: 0; } }
.spinning { animation: rotate 0.8s linear infinite; }
@keyframes rotate { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
</style>

<style>
.leaflet-div-icon { background: transparent !important; border: none !important; }
.leaflet-routing-container { display: none !important; }
</style>