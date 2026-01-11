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

      <div class="map-overlay-stats" v-else>
        <div class="stat-badge">
          <div class="pulse-green"></div>
          <span>{{ friends.length }} Friends | {{ customPins.length }} Notes</span>
        </div>
        <div class="instruction-toast" v-if="!isRouting">Tap map to drop a note</div>
        <div class="instruction-toast routing-text" v-else>Following Green Path...</div>
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

          <l-marker v-for="pin in customPins" :key="pin.id" :lat-lng="[pin.lat, pin.lng]" @click="presentActionSheet(pin)">
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

      <ion-modal :is-open="isModalOpen" @didDismiss="closeModal" :initial-breakpoint="0.4" :breakpoints="[0, 0.4]">
        <ion-header class="ion-no-border">
          <ion-toolbar>
            <ion-title>{{ editingPinId ? 'Update Note' : 'Add a Note' }}</ion-title>
            <ion-buttons slot="end"><ion-button @click="closeModal">Cancel</ion-button></ion-buttons>
          </ion-toolbar>
        </ion-header>
        <ion-content class="ion-padding">
          <div class="modal-body">
            <ion-item lines="none" class="input-item">
              <ion-textarea v-model="newPinDesc" :placeholder="editingPinId ? 'Update your description...' : 'What\'s happening here?'" :rows="4" auto-grow></ion-textarea>
            </ion-item>
            <ion-button expand="block" @click="handleSavePin" class="confirm-btn">{{ editingPinId ? 'Save Changes' : 'Drop Note' }} 📍</ion-button>
          </div>
        </ion-content>
      </ion-modal>

      <ion-action-sheet :is-open="isActionSheetOpen" :header="selectedPin?.profiles?.username + '\'s Note'"
        :sub-header="selectedPin?.description" :buttons="actionSheetButtons"
        @didDismiss="isActionSheetOpen = false"></ion-action-sheet>
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
  IonActionSheet, IonSpinner
} from '@ionic/vue';
import {
  locateOutline, refreshOutline, trashOutline, createOutline, navigateOutline
} from 'ionicons/icons';

// --- STATES ---
const zoom = ref(15);
const myCenter = ref([0, 0]);
const mapCenter = ref([0, 0]);
const isCalibrating = ref(true);
const currentUserId = ref(null);
const friends = ref([]);
const customPins = ref([]);
const isRefreshing = ref(false);
const mapInstance = ref(null);
const isRouting = ref(false);
let routingControl = null;
let watchId = null;

// UI States
const isModalOpen = ref(false);
const isActionSheetOpen = ref(false);
const selectedPin = ref(null);
const editingPinId = ref(null);
const newPinDesc = ref("");
const pendingCoords = ref(null);

const getWeatherEmoji = (code) => {
  if (code <= 1) return '☀️';
  if (code <= 3) return '☁️';
  if (code <= 48) return '🌫️';
  if (code <= 67) return '🌧️';
  if (code <= 77) return '❄️';
  if (code <= 82) return '🌦️';
  return '⛈️';
};

// --- LOCATION TRACKING (FIXED ACCURACY) ---
const startTracking = async () => {
  try {
    const permissions = await Geolocation.checkPermissions();
    if (permissions.location !== 'granted') {
      await Geolocation.requestPermissions();
    }

    // Initial Calibration
    const pos = await Geolocation.getCurrentPosition({
      enableHighAccuracy: true,
      maximumAge: 0 // Prevent cached locations
    });

    myCenter.value = [pos.coords.latitude, pos.coords.longitude];
    mapCenter.value = [pos.coords.latitude, pos.coords.longitude];
    isCalibrating.value = false;

    // Continuous Watch
    watchId = await Geolocation.watchPosition({
      enableHighAccuracy: true, // Forces GPS Satellites
      timeout: 3000,
      maximumAge: 0 
    }, (position) => {
      if (position) {
        // --- ACCURACY FILTER ---
        // If accuracy is worse than 50 meters, ignore the "jumpy" data
        if (position.coords.accuracy > 50) return;

        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        const newLatLng = L.latLng(lat, lng);
        
        myCenter.value = [lat, lng];

        // --- AUTO-RECALCULATE ---
        if (isRouting.value && routingControl) {
          const currentWaypoints = routingControl.getWaypoints();
          if (currentWaypoints[0].latLng) {
            const distFromLineStart = newLatLng.distanceTo(currentWaypoints[0].latLng);
            if (distFromLineStart > 40) { // If user moved 40m from the current path start
              recalculateRoute();
            }
          }
        }

        if (currentUserId.value) {
          supabase.from('locations').upsert({
            user_id: currentUserId.value,
            lat: lat,
            lng: lng,
            updated_at: new Date()
          });
        }
      }
    });
  } catch (e) {
    console.error("Location Error:", e);
    isCalibrating.value = false;
  }
};

// --- ROUTING LOGIC ---
const startRouting = (pin) => {
  const map = mapInstance.value?.leafletObject;
  if (!map || !myCenter.value) return;

  selectedPin.value = pin;
  isRouting.value = true;

  if (routingControl) map.removeControl(routingControl);

  routingControl = L.Routing.control({
    waypoints: [
      L.latLng(myCenter.value[0], myCenter.value[1]),
      L.latLng(pin.lat, pin.lng)
    ],
    lineOptions: {
      styles: [
        { color: '#1a73e8', opacity: 0.15, weight: 9 },
        { color: '#2dd36f', opacity: 0.8, weight: 6 }
      ],
      extendToWaypoints: true
    },
    router: L.Routing.osrmv1({ serviceUrl: `https://router.project-osrm.org/route/v1` }),
    show: false,
    addWaypoints: false,
    draggableWaypoints: false,
    fitSelectedRoutes: true,
    createMarker: () => null
  }).addTo(map);
};

const recalculateRoute = () => {
  if (!routingControl || !selectedPin.value) return;
  routingControl.setWaypoints([
    L.latLng(myCenter.value[0], myCenter.value[1]),
    L.latLng(selectedPin.value.lat, selectedPin.value.lng)
  ]);
};

const clearRoute = () => {
  const map = mapInstance.value?.leafletObject;
  if (map && routingControl) {
    map.removeControl(routingControl);
    routingControl = null;
  }
  selectedPin.value = null;
  isRouting.value = false;
};

// --- SUPABASE DATA ---
const fetchCustomPins = async () => {
  const { data } = await supabase.from('map_pins').select('*, profiles(username)');
  if (data) customPins.value = data;
};

const fetchFriendsLocations = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  currentUserId.value = user.id;

  const { data: friendshipData } = await supabase
    .from('friendships').select('sender_id, receiver_id').eq('status', 'accepted')
    .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`);

  const friendIds = friendshipData?.map(f => f.sender_id === user.id ? f.receiver_id : f.sender_id) || [];
  const { data: locationsData } = await supabase
    .from('locations').select(`lat, lng, user_id, profiles(username, avatar_url)`).in('user_id', friendIds);

  const friendsWithWeather = await Promise.all((locationsData || []).map(async (f) => {
    try {
      const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${f.lat}&longitude=${f.lng}&current_weather=true`);
      const data = await res.json();
      return { ...f, weather: data.current_weather };
    } catch { return f; }
  }));
  friends.value = friendsWithWeather;
};

const handleMapClick = (e) => {
  if (isRouting.value) return;
  editingPinId.value = null;
  pendingCoords.value = e.latlng;
  newPinDesc.value = "";
  isModalOpen.value = true;
};

const handleSavePin = async () => {
  if (!newPinDesc.value.trim() || !currentUserId.value) return;
  if (editingPinId.value) {
    await supabase.from('map_pins').update({ description: newPinDesc.value.trim() }).eq('id', editingPinId.value);
  } else {
    await supabase.from('map_pins').insert({
      user_id: currentUserId.value, lat: pendingCoords.value.lat, lng: pendingCoords.value.lng, description: newPinDesc.value.trim()
    });
  }
  fetchCustomPins();
  closeModal();
};

const deletePin = async (id) => {
  const { error } = await supabase.from('map_pins').delete().eq('id', id);
  if (!error) fetchCustomPins();
};

const presentActionSheet = (pin) => {
  selectedPin.value = pin;
  isActionSheetOpen.value = true;
};

const actionSheetButtons = computed(() => {
  const buttons = [
    { text: 'Show Path to Note', icon: navigateOutline, handler: () => startRouting(selectedPin.value) }
  ];
  if (selectedPin.value?.user_id === currentUserId.value) {
    buttons.push(
      { text: 'Edit Note', icon: createOutline, handler: () => {
          editingPinId.value = selectedPin.value.id;
          newPinDesc.value = selectedPin.value.description;
          isModalOpen.value = true;
        }
      },
      { text: 'Remove Note', role: 'destructive', icon: trashOutline, handler: () => deletePin(selectedPin.value.id) }
    );
  }
  buttons.push({ text: 'Cancel', role: 'cancel' });
  return buttons;
});

const closeModal = () => {
  isModalOpen.value = false;
  editingPinId.value = null;
  pendingCoords.value = null;
};

const onMapReady = (leafletObject) => {
  nextTick(() => { setTimeout(() => { if (leafletObject) leafletObject.invalidateSize(); }, 400); });
};

const manualRefresh = async () => {
  isRefreshing.value = true;
  await Promise.all([fetchFriendsLocations(), fetchCustomPins()]);
  setTimeout(() => isRefreshing.value = false, 600);
};

const centerOnMe = () => {
  const map = mapInstance.value?.leafletObject;
  if (map) map.flyTo(myCenter.value, 17, { duration: 1.2 });
};

onMounted(async () => {
  await fetchFriendsLocations();
  await fetchCustomPins();
  startTracking();

  supabase.channel('map-sync')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'locations' }, fetchFriendsLocations)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'map_pins' }, fetchCustomPins)
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

.calibration-overlay {
  position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: white; z-index: 2000;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 15px;
}

:deep(.leaflet-routing-container) { display: none !important; }
.routing-text { color: #2dd36f; font-weight: bold; }
.modal-body { display: flex; flex-direction: column; gap: 12px; }
.input-item { --background: #f4f5f8; --border-radius: 12px; --padding-start: 12px; font-size: 0.95rem; }
.confirm-btn { --border-radius: 12px; --background: #2dd36f; font-weight: 700; margin-top: 10px; }
.ghost-pin { opacity: 0.6; filter: grayscale(1); }
.custom-note-pin { font-size: 30px; display: flex; align-items: center; justify-content: center; filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3)); }
.instruction-toast { font-size: 11px; color: #666; margin-top: 4px; text-align: center; }

.my-location-marker { position: relative; display: flex; align-items: center; justify-content: center; }
.core-dot { width: 14px; height: 14px; background: #2dd36f; border: 3px solid white; border-radius: 50%; z-index: 2; box-shadow: 0 0 10px rgba(0,0,0,0.2); }
.pulse-ring { position: absolute; width: 35px; height: 35px; background: rgba(45, 211, 111, 0.3); border-radius: 50%; animation: pulse-ring 2s infinite; }

.friend-marker-pin { display: flex; flex-direction: column; align-items: center; }
.avatar-box { width: 45px; height: 45px; background: #2dd36f; border: 3px solid white; border-radius: 15px; display: flex; align-items: center; justify-content: center; font-weight: 800; color: white; box-shadow: 0 5px 15px rgba(0, 0, 0, 0.2); position: relative; }
.map-avatar-img { width: 100%; height: 100%; object-fit: cover; border-radius: 12px; }
.pin-beak { width: 0; height: 0; border-left: 8px solid transparent; border-right: 8px solid transparent; border-top: 10px solid white; margin-top: -2px; }
.weather-mini-badge { position: absolute; top: -8px; right: -8px; background: white; border-radius: 50%; width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; font-size: 12px; box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2); z-index: 10; }

.map-controls { position: absolute; bottom: 30px; right: 20px; z-index: 1000; display: flex; flex-direction: column; gap: 12px; }
.control-btn { width: 50px; height: 50px; background: white; border: none; border-radius: 16px; display: flex; align-items: center; justify-content: center; font-size: 24px; color: #2dd36f; box-shadow: 0 4px 15px rgba(0, 0, 0, 0.15); }

.map-overlay-stats { position: absolute; top: 15px; left: 15px; z-index: 1000; display: flex; flex-direction: column; }
.stat-badge { background: white; padding: 8px 16px; border-radius: 20px; display: flex; align-items: center; gap: 10px; box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1); font-weight: 700; font-size: 0.85rem; }
.pulse-green { width: 10px; height: 10px; background: #2dd36f; border-radius: 50%; animation: pulse-ring 1.5s infinite; }

.recalc-btn { flex-direction: column; gap: 2px; background: #2dd36f !important; color: white !important; font-size: 18px; }
.recalc-btn small { font-size: 8px; font-weight: bold; text-transform: uppercase; }

@keyframes pulse-ring { 0% { transform: scale(0.5); opacity: 1; } 100% { transform: scale(1.5); opacity: 0; } }
.spinning { animation: rotate 0.8s linear infinite; }
@keyframes rotate { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
</style>