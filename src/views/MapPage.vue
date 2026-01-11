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
          placeholder="Search spots or notes..." 
          @ionInput="handleSearch"
          @ionClear="searchResults = []"
          class="custom-searchbar">
        </ion-searchbar>
        
        <ion-list v-if="searchResults.length > 0" class="search-results-list">
          <ion-item v-for="result in searchResults" :key="result.id" button @click="selectSearchResult(result)">
            <ion-label>
              <h2>{{ result.description }}</h2>
              <p>{{ result.pinType === 'global' ? 'Official Spot 🌟' : 'Friend Note 📍' }}</p>
            </ion-label>
            <ion-icon :icon="navigateOutline" slot="end" color="primary"></ion-icon>
          </ion-item>
        </ion-list>
      </div>

      <div class="map-overlay-stats" v-if="!isCalibrating">
        <div class="stat-badge">
          <div class="pulse-green"></div>
          <div class="stat-text">
            <span>{{ friends.length }} Online | {{ customPins.length }} Notes</span>
            <small v-if="lastSyncTime" class="sync-time">Updated: {{ lastSyncTime }}</small>
          </div>
        </div>
      </div>

      <div class="map-wrapper">
        <l-map 
          ref="mapInstance" 
          v-model:zoom="zoom" 
          :center="mapCenter" 
          :use-global-leaflet="true"
          :options="{ zoomControl: false, attributionControl: false, tap: false }" 
          @ready="onMapReady" 
          @click="handleMapClick"
        >
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
          </l-marker>

          <l-marker v-for="pin in customPins" :key="'pin-'+pin.id" :lat-lng="[pin.lat, pin.lng]" @click="presentActionSheet(pin, 'user')">
            <l-icon :icon-size="[35, 35]" :icon-anchor="[17, 35]">
              <div class="custom-note-pin">📍</div>
            </l-icon>
          </l-marker>

          <l-marker :lat-lng="myCenter" class="smooth-marker">
            <l-icon :icon-size="[24, 24]" :icon-anchor="[12, 12]">
              <div class="my-location-marker">
                <div class="pulse-ring"></div>
                <div class="core-dot"></div>
              </div>
            </l-icon>
          </l-marker>

          <l-marker v-for="friend in friends" :key="friend.user_id" :lat-lng="[friend.lat, friend.lng]" class="smooth-marker">
            <l-icon :icon-size="[50, 60]" :icon-anchor="[25, 60]">
              <div class="friend-marker-pin">
                <div class="avatar-box">
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
              <ion-textarea v-model="newPinDesc" :placeholder="isGlobalMode ? 'Describe spot...' : 'Leave a note...'" :rows="4" auto-grow></ion-textarea>
            </ion-item>
            <ion-button expand="block" @click="handleSavePin" class="confirm-btn">
              {{ editingPinId ? 'Save Changes' : (isGlobalMode ? 'Drop Global Spot 🌟' : 'Drop Friend Note 📍') }}
            </ion-button>
          </div>
        </ion-content>
      </ion-modal>

      <ion-action-sheet 
        :is-open="isActionSheetOpen" 
        :header="selectedPin?.pinType === 'global' ? '🌟 Official' : (selectedPin?.profiles?.username + '\'s Note')"
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
  IonActionSheet, IonSpinner, IonLabel, IonToggle, IonSearchbar, IonList
} from '@ionic/vue';
import {
  locateOutline, refreshOutline, trashOutline, createOutline, navigateOutline
} from 'ionicons/icons';

const ROOT_ID = 'f0221dc3-cd62-47df-9752-c830594e0144'; 

// --- STATE ---
const zoom = ref(15);
const myCenter = ref([0, 0]);
const mapCenter = ref([0, 0]);
const isCalibrating = ref(true);
const currentUserId = ref(null);
const friends = ref([]);
const customPins = ref([]);
const globalSpots = ref([]);
const isRefreshing = ref(false);
const lastSyncTime = ref("");
const mapInstance = ref(null);
const isRouting = ref(false);
const searchQuery = ref("");
const searchResults = ref([]);
const isModalOpen = ref(false);
const isActionSheetOpen = ref(false);
const selectedPin = ref(null);
const editingPinId = ref(null);
const isGlobalMode = ref(false);
const newPinDesc = ref("");
const pendingCoords = ref(null);

let routingControl = null;
let watchId = null;
let broadcastChannel = null;
let lastSavedPos = { lat: 0, lng: 0 };

// --- SEARCH LOGIC FIXED ---
const handleSearch = (ev) => {
  const query = ev.target.value?.toLowerCase().trim();
  if (!query) {
    searchResults.value = [];
    return;
  }

  // Search through Global Official Spots
  const globalMatches = globalSpots.value
    .filter(s => s.description.toLowerCase().includes(query))
    .map(s => ({ ...s, pinType: 'global' }));

  // Search through User/Friend Notes
  const pinMatches = customPins.value
    .filter(p => p.description.toLowerCase().includes(query))
    .map(p => ({ ...p, pinType: 'user' }));

  searchResults.value = [...globalMatches, ...pinMatches].slice(0, 6);
};

const selectSearchResult = (item) => {
  if (!mapInstance.value) return;
  
  const map = mapInstance.value.leafletObject;
  map.flyTo([item.lat, item.lng], 18, { animate: true, duration: 1.5 });
  
  presentActionSheet(item, item.pinType);
  
  // Clear search UI
  searchQuery.value = "";
  searchResults.value = [];
};

// --- DATA FETCHING ---
const fetchAllData = async () => {
  if (!currentUserId.value) return;

  const { data: friendships } = await supabase.from('friendships').select('sender_id, receiver_id').eq('status', 'accepted').or(`sender_id.eq.${currentUserId.value},receiver_id.eq.${currentUserId.value}`);
  const ids = friendships?.map(f => f.sender_id === currentUserId.value ? f.receiver_id : f.sender_id) || [];

  const [locs, pins, globals] = await Promise.all([
    ids.length ? supabase.from('locations').select(`lat, lng, user_id, profiles(username, avatar_url)`).in('user_id', ids) : Promise.resolve({ data: [] }),
    supabase.from('map_pins').select('*, profiles(username)').in('user_id', [...ids, currentUserId.value]),
    supabase.from('global_spots').select('*')
  ]);

  if (locs.data) friends.value = locs.data;
  if (pins.data) customPins.value = pins.data;
  if (globals.data) globalSpots.value = globals.data;
  
  updateSyncTimestamp();
};

// --- OTHER HANDLERS ---
const manualRefresh = async () => {
  isRefreshing.value = true;
  clearRoute();
  await fetchAllData();
  setTimeout(() => isRefreshing.value = false, 800);
};

const handleMapClick = (e) => {
  if (isRouting.value || searchQuery.value) return;
  editingPinId.value = null; isGlobalMode.value = false;
  pendingCoords.value = e.latlng; newPinDesc.value = ""; isModalOpen.value = true;
};

const handleSavePin = async () => {
  if (!newPinDesc.value.trim()) return;
  const table = isGlobalMode.value ? 'global_spots' : 'map_pins';
  if (editingPinId.value) {
    await supabase.from(table).update({ description: newPinDesc.value }).eq('id', editingPinId.value);
  } else {
    const payload = isGlobalMode.value 
      ? { title: 'Spot', description: newPinDesc.value, lat: pendingCoords.value.lat, lng: pendingCoords.value.lng }
      : { user_id: currentUserId.value, description: newPinDesc.value, lat: pendingCoords.value.lat, lng: pendingCoords.value.lng };
    await supabase.from(table).insert(payload);
  }
  fetchAllData();
  closeModal();
};

const centerOnMe = () => mapInstance.value?.leafletObject.flyTo(myCenter.value, 17);
const presentActionSheet = (pin, type) => { selectedPin.value = { ...pin, pinType: type }; isActionSheetOpen.value = true; };
const closeModal = () => { isModalOpen.value = false; pendingCoords.value = null; };
const onMapReady = (o) => nextTick(() => setTimeout(() => o?.invalidateSize(), 400));
const clearRoute = () => { if (routingControl) mapInstance.value?.leafletObject.removeControl(routingControl); routingControl = null; isRouting.value = false; };
const updateSyncTimestamp = () => { lastSyncTime.value = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); };

const actionSheetButtons = computed(() => {
  const btns = [];
  if (selectedPin.value?.user_id === currentUserId.value || currentUserId.value === ROOT_ID) {
    btns.push({ text: 'Edit', icon: createOutline, handler: () => { editingPinId.value = selectedPin.value.id; newPinDesc.value = selectedPin.value.description; isModalOpen.value = true; } });
    btns.push({ text: 'Delete', role: 'destructive', icon: trashOutline, handler: async () => {
      await supabase.from(selectedPin.value.pinType === 'global' ? 'global_spots' : 'map_pins').delete().eq('id', selectedPin.value.id);
      fetchAllData();
    }});
  }
  btns.push({ text: 'Cancel', role: 'cancel' });
  return btns;
});

onMounted(async () => {
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    currentUserId.value = user.id;
    await fetchAllData();
    const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true });
    myCenter.value = [pos.coords.latitude, pos.coords.longitude];
    mapCenter.value = [pos.coords.latitude, pos.coords.longitude];
    isCalibrating.value = false;
  }
});
</script>

<style scoped>
.map-content { --background: #fff !important; height: 100%; }
.map-wrapper { height: 100%; width: 100%; position: relative; }
:deep(.leaflet-container) { height: 100% !important; background: #f8f9fa !important; }

/* SEARCH UI - DESIGN PRESERVED BUT FIXED Z-INDEX */
.search-container { position: absolute; top: 10px; left: 50%; transform: translateX(-50%); width: 92%; z-index: 10000; }
.custom-searchbar { --border-radius: 16px; --box-shadow: 0 4px 12px rgba(0,0,0,0.15); --background: #fff !important; }
.search-results-list { background: white; border-radius: 12px; margin-top: 5px; box-shadow: 0 8px 16px rgba(0,0,0,0.1); max-height: 250px; overflow-y: auto; }

.map-overlay-stats { position: absolute; top: 75px; left: 15px; z-index: 1000; }
.stat-badge { background: white; padding: 8px 16px; border-radius: 20px; display: flex; align-items: center; gap: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
.stat-text { display: flex; flex-direction: column; line-height: 1.2; }
.stat-text span { font-weight: bold; font-size: 0.8rem; color: #333; }
.sync-time { font-size: 0.65rem; color: #666; }

/* Pulse Indicator */
.pulse-green { width: 8px; height: 8px; background: #2dd36f; border-radius: 50%; box-shadow: 0 0 0 rgba(45, 211, 111, 0.4); animation: statusPulse 2s infinite; }
@keyframes statusPulse { 0% { box-shadow: 0 0 0 0 rgba(45, 211, 111, 0.7); } 70% { box-shadow: 0 0 0 10px rgba(45, 211, 111, 0); } 100% { box-shadow: 0 0 0 0 rgba(45, 211, 111, 0); } }

/* Markers */
.my-location-marker { position: relative; display: flex; align-items: center; justify-content: center; }
.core-dot { width: 14px; height: 14px; background: #2dd36f; border: 3px solid white; border-radius: 50%; z-index: 2; }
.pulse-ring { position: absolute; width: 35px; height: 35px; background: rgba(45,211,111,0.3); border-radius: 50%; animation: pulse 2s infinite; }

.friend-marker-pin { display: flex; flex-direction: column; align-items: center; }
.avatar-box { width: 45px; height: 45px; background: #2dd36f; border: 3px solid white; border-radius: 15px; overflow: hidden; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; }
.map-avatar-img { width: 100%; height: 100%; object-fit: cover; }
.pin-beak { width: 0; height: 0; border-left: 8px solid transparent; border-right: 8px solid transparent; border-top: 10px solid white; margin-top: -2px; }

/* Controls */
.map-controls { position: absolute; bottom: 30px; right: 20px; z-index: 1000; display: flex; flex-direction: column; gap: 12px; }
.control-btn { width: 50px; height: 50px; background: white; border: none; border-radius: 16px; display: flex; align-items: center; justify-content: center; font-size: 24px; color: #2dd36f; box-shadow: 0 4px 15px rgba(0,0,0,0.15); }

@keyframes pulse { 0% { transform: scale(0.5); opacity: 1; } 100% { transform: scale(1.5); opacity: 0; } }
.spinning { animation: rotate 0.8s linear infinite; }
@keyframes rotate { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
</style>
<style>
/* Global Leaflet Overrides */
.leaflet-div-icon { background: transparent !important; border: none !important; }
.leaflet-routing-container { display: none !important; }
.leaflet-tooltip { background: white !important; color: #000 !important; border: none !important; box-shadow: 0 2px 8px rgba(0,0,0,0.1) !important; font-weight: bold; padding: 6px 10px; border-radius: 8px; }
.ghost-pin { opacity: 0.6; filter: grayscale(1); }
</style>