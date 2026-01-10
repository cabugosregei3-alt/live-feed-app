<template>
  <ion-page>
    <ion-header class="ion-no-border">
      <ion-toolbar>
        <ion-title>Friends</ion-title>
        <ion-buttons slot="end">
          <ion-button @click="manualRefresh" class="refresh-btn">
            <ion-icon slot="icon-only" :icon="refreshOutline" :class="{ 'spinning': isRefreshing }"></ion-icon>
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    
    <ion-content class="ion-padding friends-page">
      <div class="add-friend-container">
        <div class="custom-input-group">
          <ion-label>Add a Friend</ion-label>
          <div class="input-container">
            <ion-icon :icon="personAddOutline" class="input-icon"></ion-icon>
            <input v-model="targetId" placeholder="Paste their User ID here" />
          </div>
        </div>
        <ion-button expand="block" @click="sendInvite" class="send-btn">
          Send Request
        </ion-button>
      </div>

      <div v-if="pending.length > 0" class="section-container">
        <h2 class="section-title">Pending Invites</h2>
        <div class="pending-list">
          <div v-for="req in pending" :key="req.id" class="pending-card">
            <div class="pending-info">
              <div class="mini-avatar">?</div>
              <div class="text-content">
                <h3>New Request</h3>
                <p>ID: {{ req.sender_id.substring(0, 8) }}...</p>
              </div>
            </div>
            <ion-button size="small" @click="acceptFriend(req.id)" class="accept-btn">
              Accept
            </ion-button>
          </div>
        </div>
      </div>

      <div class="section-container">
        <h2 class="section-title">My Connections</h2>
        
        <div v-if="acceptedFriends.length === 0" class="empty-state">
          <ion-icon :icon="peopleOutline"></ion-icon>
          <p>No friends found. Start sharing your ID!</p>
        </div>

        <div v-else class="friend-grid">
          <div v-for="friend in acceptedFriends" :key="friend.id" class="friend-card">
            <div class="friend-main">
              <div class="friend-avatar-container">
                <img v-if="friend.avatar_url" :src="friend.avatar_url" class="friend-img" />
                <div v-else class="friend-placeholder">
                  {{ friend.username?.charAt(0).toUpperCase() || '?' }}
                </div>
              </div>
              <div class="friend-details">
                <h3>{{ friend.username || 'Friend' }}</h3>
                <p>ID: {{ friend.friend_id.substring(0, 8) }}...</p>
              </div>
            </div>
            <ion-button fill="clear" color="danger" @click="removeFriend(friend.id)" class="remove-btn">
              <ion-icon :icon="trashOutline" slot="icon-only"></ion-icon>
            </ion-button>
          </div>
        </div>
      </div>

      <ion-refresher slot="fixed" @ionRefresh="doRefresh($event)">
        <ion-refresher-content></ion-refresher-content>
      </ion-refresher>
    </ion-content>
  </ion-page>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { supabase } from '../lib/supabase';
import { 
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent, 
  IonButton, IonLabel, IonIcon, IonRefresher, IonRefresherContent, toastController 
} from '@ionic/vue';
import { trashOutline, personAddOutline, refreshOutline, peopleOutline } from 'ionicons/icons';

const targetId = ref('');
const pending = ref([]);
const acceptedFriends = ref([]);
const isRefreshing = ref(false);
const deletingIds = new Set();
let friendshipChannel = null;

const showToast = async (msg, color) => {
  const toast = await toastController.create({ message: msg, duration: 2000, color, position: 'bottom' });
  toast.present();
};

const fetchData = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { data: pData } = await supabase.from('friendships').select('*').eq('receiver_id', user.id).eq('status', 'pending');
  pending.value = pData || [];

  const { data: aData } = await supabase.from('friendships').select('*').eq('status', 'accepted').or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`);

  if (aData) {
    const list = [];
    for (const rel of aData) {
      if (deletingIds.has(rel.id)) continue;
      const fId = rel.sender_id === user.id ? rel.receiver_id : rel.sender_id;
      // Fetch profile INCLUDING avatar_url
      const { data: prof } = await supabase.from('profiles').select('username, avatar_url').eq('id', fId).single();
      list.push({ id: rel.id, friend_id: fId, username: prof?.username || 'Unknown', avatar_url: prof?.avatar_url });
    }
    acceptedFriends.value = list;
  }
};

const manualRefresh = async () => {
  isRefreshing.value = true;
  await fetchData();
  setTimeout(() => isRefreshing.value = false, 600);
};

const doRefresh = async (event) => {
  await fetchData();
  event.target.complete();
};

const sendInvite = async () => {
  const cleanId = targetId.value.trim();
  if (!cleanId) return;
  const { data: { user } } = await supabase.auth.getUser();
  if (cleanId === user.id) return showToast("You cannot add yourself!", "warning");
  const { error } = await supabase.from('friendships').insert({ sender_id: user.id, receiver_id: cleanId });
  if (error) showToast("Request failed", 'danger');
  else {
    targetId.value = '';
    showToast("Request Sent!", 'success');
    fetchData();
  }
};

const acceptFriend = async (id) => {
  const { error } = await supabase.from('friendships').update({ status: 'accepted' }).eq('id', id);
  if (!error) fetchData();
};

const removeFriend = async (id) => {
  deletingIds.add(id);
  acceptedFriends.value = acceptedFriends.value.filter(f => f.id !== id);
  const { error } = await supabase.from('friendships').delete().eq('id', id);
  if (error) { showToast("Error", 'danger'); fetchData(); }
  else { showToast("Friend removed", 'dark'); }
};

onMounted(() => {
  fetchData();
  friendshipChannel = supabase.channel('friend-system').on('postgres_changes', { event: '*', schema: 'public', table: 'friendships' }, fetchData).subscribe();
});

onUnmounted(() => { if (friendshipChannel) supabase.removeChannel(friendshipChannel); });
</script>

<style scoped>
.friends-page {
  --background: #ffffff;
}

.refresh-btn { --color: #2dd36f; }

/* Add Friend Custom Container */
.add-friend-container {
  background: #f8f9f8;
  border-radius: 20px;
  padding: 20px;
  margin-bottom: 30px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.02);
}

.custom-input-group ion-label {
  display: block;
  font-weight: 700;
  font-size: 0.9rem;
  margin-bottom: 10px;
  color: #1a1a1a;
}

.input-container {
  background: white;
  border-radius: 14px;
  padding: 12px 16px;
  display: flex;
  align-items: center;
  border: 2px solid transparent;
  transition: 0.3s ease;
}

.input-container:focus-within {
  border-color: #2dd36f;
  box-shadow: 0 4px 12px rgba(45, 211, 111, 0.1);
}

.input-icon { color: #2dd36f; margin-right: 12px; font-size: 20px; }
.input-container input { border: none; background: transparent; width: 100%; outline: none; }

.send-btn {
  --background: #2dd36f;
  --border-radius: 12px;
  margin-top: 15px;
  font-weight: 700;
  height: 48px;
}

/* Sections */
.section-container { margin-top: 10px; }
.section-title {
  font-size: 1.1rem;
  font-weight: 800;
  color: #1a1a1a;
  margin-bottom: 15px;
  padding-left: 5px;
}

/* Pending Card */
.pending-card {
  background: #ffffff;
  border: 1px solid rgba(45, 211, 111, 0.2);
  border-radius: 16px;
  padding: 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.pending-info { display: flex; align-items: center; gap: 12px; }
.mini-avatar {
  width: 40px; height: 40px; background: #e8f9ef; color: #2dd36f;
  border-radius: 12px; display: flex; align-items: center; justify-content: center;
  font-weight: bold;
}

.text-content h3 { font-size: 0.95rem; font-weight: 700; margin: 0; }
.text-content p { font-size: 0.8rem; color: #8c8c8c; margin: 2px 0 0 0; }
.accept-btn { --background: #2dd36f; --border-radius: 10px; font-weight: 700; }

/* Friends Grid/List */
.friend-card {
  background: #f8f9f8;
  border-radius: 16px;
  padding: 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.friend-main { display: flex; align-items: center; gap: 15px; }

.friend-avatar-container { width: 50px; height: 50px; }
.friend-img, .friend-placeholder {
  width: 50px; height: 50px; border-radius: 15px;
  object-fit: cover; background: #2dd36f; color: white;
  display: flex; align-items: center; justify-content: center;
  font-weight: 800; font-size: 1.2rem;
}

.friend-details h3 { font-size: 1rem; font-weight: 700; margin: 0; }
.friend-details p { font-size: 0.8rem; color: #8c8c8c; margin: 2px 0 0 0; }

.empty-state {
  text-align: center; padding: 40px 20px; color: #8c8c8c;
}
.empty-state ion-icon { font-size: 48px; margin-bottom: 10px; color: #e0e0e0; }

.spinning { animation: rotate 0.6s linear infinite; }
@keyframes rotate { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
</style>