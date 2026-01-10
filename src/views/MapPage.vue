<template>
  <ion-page>
    <ion-header class="ion-no-border">
      <ion-toolbar>
        <ion-title>Live Feed</ion-title>
        <ion-buttons slot="end">
          <ion-button @click="manualRefresh" class="refresh-btn">
            <ion-icon 
              slot="icon-only" 
              :icon="refreshOutline" 
              :class="{ 'spinning': isRefreshing }"
            ></ion-icon>
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content :scroll-y="false" class="map-content">
      <div class="map-overlay-stats" v-if="friends.length > 0">
        <div class="stat-badge">
          <div class="pulse-green"></div>
          <span>{{ friends.length }} Friends Online</span>
        </div>
      </div>

      <div class="map-wrapper">
        <l-map 
          ref="mapInstance" 
          v-model:zoom="zoom" 
          :center="myCenter" 
          :use-global-leaflet="false"
          :options="{ zoomControl: false, attributionControl: false }"
          @ready="onMapReady"
        >
          <l-tile-layer 
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
            layer-type="base"
            name="CartoDB"
          ></l-tile-layer>

          <l-tile-layer 
            v-if="showRadar"
            :url="radarUrl"
            :opacity="0.6"
            layer-type="overlay"
            name="Radar"
          ></l-tile-layer>

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
            <l-tooltip :options="{ direction: 'top', offset: [0, -60], className: 'custom-tooltip' }" permanent>
              {{ friend.profiles?.username || 'Friend' }} 
              <span v-if="friend.weather">({{ Math.round(friend.weather.temperature) }}°C)</span>
            </l-tooltip>
          </l-marker>
        </l-map>

        <div class="map-controls">
          <button class="control-btn" :class="{ 'active-layer': showRadar }" @click="toggleRadar">
            <ion-icon :icon="cloudOutline"></ion-icon>
          </button>
          <button class="control-btn" @click="centerOnMe">
            <ion-icon :icon="locateOutline"></ion-icon>
          </button>
        </div>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup>
import { ref, onMounted, onUnmounted, nextTick } from 'vue';
import { LMap, LTileLayer, LMarker, LTooltip, LIcon } from "@vue-leaflet/vue-leaflet";
import "leaflet/dist/leaflet.css";
import { supabase } from '../lib/supabase';
import { 
  IonPage, IonContent, IonHeader, IonToolbar, IonTitle, 
  IonIcon, IonButtons, IonButton 
} from '@ionic/vue';
import { locateOutline, refreshOutline, cloudOutline } from 'ionicons/icons';

const zoom = ref(15);
const myCenter = ref([10, 120]); 
const friends = ref([]);
const isRefreshing = ref(false);
const mapInstance = ref(null);
const showRadar = ref(false);
const radarUrl = ref("");
let watchId = null;

const getWeatherEmoji = (code) => {
  if (code <= 1) return '☀️';
  if (code <= 3) return '☁️';
  if (code <= 48) return '🌫️';
  if (code <= 67) return '🌧️';
  if (code <= 77) return '❄️';
  if (code <= 82) return '🌦️';
  return '⛈️';
};

const fetchWeatherForFriend = async (lat, lng) => {
  try {
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current_weather=true`);
    const data = await res.json();
    return data.current_weather;
  } catch (e) {
    console.error("Weather fetch failed", e);
    return null;
  }
};

const toggleRadar = async () => {
  if (!showRadar.value) {
    try {
      const res = await fetch('https://api.rainviewer.com/public/weather-maps.json');
      const data = await res.json();
      const latestTime = data.radar.past[data.radar.past.length - 1].time;
      radarUrl.value = `https://tilecache.rainviewer.com/v2/radar/${latestTime}/256/{z}/{x}/{y}/2/1_1.png`;
    } catch (e) {
      console.error("Radar fetch failed", e);
    }
  }
  showRadar.value = !showRadar.value;
};

const fetchFriendsLocations = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { data: friendshipData } = await supabase
    .from('friendships')
    .select('sender_id, receiver_id')
    .eq('status', 'accepted')
    .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`);

  if (!friendshipData || friendshipData.length === 0) {
    friends.value = [];
    return;
  }

  const friendIds = friendshipData.map(f => f.sender_id === user.id ? f.receiver_id : f.sender_id);

  const { data: locationsData } = await supabase
    .from('locations')
    .select(`lat, lng, user_id, profiles(username, avatar_url)`)
    .in('user_id', friendIds);

  const friendsWithWeather = await Promise.all((locationsData || []).map(async (f) => {
    const weather = await fetchWeatherForFriend(f.lat, f.lng);
    return { ...f, weather };
  }));

  friends.value = friendsWithWeather;
};

// Fixed onMapReady to receive the leaflet instance properly
const onMapReady = (leafletObject) => {
  nextTick(() => {
    setTimeout(() => {
      if (leafletObject) {
        leafletObject.invalidateSize();
      } else if (mapInstance.value?.leafletObject) {
        mapInstance.value.leafletObject.invalidateSize();
      }
    }, 400);
  });
};

const manualRefresh = async () => {
  isRefreshing.value = true;
  await fetchFriendsLocations();
  setTimeout(() => isRefreshing.value = false, 600);
};

const startTracking = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  watchId = navigator.geolocation.watchPosition(async (pos) => {
    const { latitude, longitude } = pos.coords;
    myCenter.value = [latitude, longitude];
    await supabase.from('locations').upsert({
      user_id: user.id, 
      lat: latitude, 
      lng: longitude, 
      updated_at: new Date()
    });
  }, (err) => console.error("Geo error:", err), { enableHighAccuracy: true });
};

const centerOnMe = () => {
  const map = mapInstance.value?.leafletObject;
  if (map) {
    map.flyTo(myCenter.value, 17, { duration: 1.5 });
  }
};

onMounted(() => {
  startTracking();
  fetchFriendsLocations();
  supabase.channel('map-sync')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'locations' }, fetchFriendsLocations)
    .subscribe();
});

onUnmounted(() => {
  if (watchId) navigator.geolocation.clearWatch(watchId);
  supabase.removeAllChannels();
});
</script>

<style scoped>
.map-content { --background: #ffffff; height: 100%; }
.map-wrapper { height: 100%; width: 100%; position: relative; }
:deep(.leaflet-container) { height: 100% !important; width: 100% !important; background: #f8f9fa; }

/* Weather Badge on Avatar */
.weather-mini-badge {
  position: absolute;
  top: -8px;
  right: -8px;
  background: white;
  border-radius: 50%;
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  box-shadow: 0 2px 5px rgba(0,0,0,0.2);
  z-index: 10;
}

/* My Location Marker */
.my-location-marker { position: relative; display: flex; align-items: center; justify-content: center; }
.core-dot { width: 14px; height: 14px; background: #2dd36f; border: 3px solid white; border-radius: 50%; z-index: 2; }
.pulse-ring { position: absolute; width: 35px; height: 35px; background: rgba(45, 211, 111, 0.3); border-radius: 50%; animation: pulse-ring 2s infinite; }

/* Friend Marker Pin */
.friend-marker-pin { display: flex; flex-direction: column; align-items: center; position: relative; }
.avatar-box {
  width: 45px; height: 45px;
  background: #2dd36f;
  border: 3px solid white;
  border-radius: 15px;
  overflow: visible;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 800; color: white;
  box-shadow: 0 5px 15px rgba(0,0,0,0.2);
  position: relative;
}
.map-avatar-img { width: 100%; height: 100%; object-fit: cover; border-radius: 12px; }
.pin-beak { width: 0; height: 0; border-left: 8px solid transparent; border-right: 8px solid transparent; border-top: 10px solid white; margin-top: -2px; }

/* Controls */
.map-controls { position: absolute; bottom: 30px; right: 20px; z-index: 1000; display: flex; flex-direction: column; gap: 12px; }
.control-btn { width: 50px; height: 50px; background: white; border: none; border-radius: 16px; display: flex; align-items: center; justify-content: center; font-size: 24px; color: #2dd36f; box-shadow: 0 4px 15px rgba(0,0,0,0.15); }
.active-layer { background: #2dd36f !important; color: white !important; }

/* Stats Badge */
.map-overlay-stats { position: absolute; top: 15px; left: 15px; z-index: 1000; }
.stat-badge { background: white; padding: 8px 16px; border-radius: 20px; display: flex; align-items: center; gap: 10px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); font-weight: 700; font-size: 0.85rem; }
.pulse-green { width: 10px; height: 10px; background: #2dd36f; border-radius: 50%; animation: pulse-ring 1.5s infinite; }

@keyframes pulse-ring { 0% { transform: scale(0.5); opacity: 1; } 100% { transform: scale(1.5); opacity: 0; } }
.spinning { animation: rotate 0.8s linear infinite; }
@keyframes rotate { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
</style>