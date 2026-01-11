<template>
  <ion-page>
    <ion-header class="ion-no-border">
      <ion-toolbar>
        <ion-title>My Profile</ion-title>
        <ion-buttons slot="end">
          <ion-button color="danger" @click="handleSignOut">
            <ion-icon slot="icon-only" :icon="logOutOutline"></ion-icon>
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding profile-page">
      <div v-if="loading" class="ion-text-center ion-margin-top">
        <ion-spinner name="crescent" color="primary"></ion-spinner>
      </div>

      <div v-else class="content-wrapper">
        <div class="header-section">
          <div class="avatar-wrapper" @click="triggerFileInput">
            <div class="avatar-ring">
              <img v-if="profile.avatar_url" :src="profile.avatar_url" class="profile-avatar-img" />
              <div v-else class="profile-avatar-placeholder">
                {{ profile.username?.charAt(0).toUpperCase() || '?' }}
              </div>
            </div>
            <div class="camera-badge">
              <ion-icon :icon="cameraOutline"></ion-icon>
            </div>
          </div>
          <input type="file" ref="fileInput" hidden accept="image/*" @change="uploadAvatar" />
          
          <h2 class="display-username">{{ profile.username || 'Anonymous' }}</h2>
          <p class="display-name">{{ profile.full_name || 'No Name Set' }}</p>
        </div>

        <div class="info-card">
          <div class="card-header">
            <ion-icon :icon="shareSocialOutline" color="primary"></ion-icon>
            <ion-label>Share with Friends</ion-label>
          </div>
          <div class="id-box">
            <code class="user-id-text">{{ userId }}</code>
            <ion-button fill="clear" size="small" @click="copyId">
              <ion-icon slot="icon-only" :icon="copyOutline"></ion-icon>
            </ion-button>
          </div>
        </div>

        <div class="form-section">
          <div class="custom-input-group">
            <ion-label>Username</ion-label>
            <div class="input-container">
              <input v-model="profile.username" placeholder="Choose a username" />
            </div>
          </div>

          <div class="custom-input-group">
            <ion-label>Full Name</ion-label>
            <div class="input-container">
              <input v-model="profile.full_name" placeholder="Enter your name" />
            </div>
          </div>

          <ion-button expand="block" class="update-btn" @click="updateProfile" :disabled="uploading">
            <ion-spinner v-if="uploading" name="crescent" color="light"></ion-spinner>
            <span v-else>Save Changes</span>
          </ion-button>
        </div>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup>
import { ref } from 'vue'; // Removed onMounted as we use onIonViewWillEnter
import { supabase } from '../lib/supabase';
import { useRouter } from 'vue-router';
import { 
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonButton, 
  IonLabel, IonSpinner, IonButtons, IonIcon, toastController,
  onIonViewWillEnter // Added this for fresh loading
} from '@ionic/vue';
import { logOutOutline, copyOutline, cameraOutline, shareSocialOutline } from 'ionicons/icons';

const router = useRouter();
const loading = ref(true);
const uploading = ref(false);
const fileInput = ref(null);
const userId = ref('');
const profile = ref({ username: '', full_name: '', avatar_url: '' });

const showToast = async (message, color = 'dark') => {
  const toast = await toastController.create({ message, duration: 2000, color, position: 'bottom' });
  await toast.present();
};

const triggerFileInput = () => fileInput.value.click();

const uploadAvatar = async (event) => {
  try {
    uploading.value = true;
    const file = event.target.files[0];
    if (!file) return;
    const fileExt = file.name.split('.').pop();
    const filePath = `${userId.value}.${fileExt}`;
    const { error: uploadError } = await supabase.storage.from('avatar').upload(filePath, file, { upsert: true });
    if (uploadError) throw uploadError;
    const { data: { publicUrl } } = supabase.storage.from('avatar').getPublicUrl(filePath);
    
    // Cache-busting: add a timestamp so the browser doesn't show the old image
    const newUrl = `${publicUrl}?t=${new Date().getTime()}`;
    
    await supabase.from('profiles').update({ avatar_url: newUrl }).eq('id', userId.value);
    profile.value.avatar_url = newUrl;
    showToast('Profile picture updated!', 'success');
  } catch (error) {
    showToast('Error: ' + error.message, 'danger');
  } finally { uploading.value = false; }
};

const loadProfile = async () => {
  try {
    loading.value = true;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { 
      router.replace('/login'); 
      return; 
    }
    userId.value = user.id;
    const { data } = await supabase.from('profiles').select('username, full_name, avatar_url').eq('id', user.id).single();
    
    if (data) {
      // Force refresh the image URL even during load to bypass browser cache
      if (data.avatar_url) {
        data.avatar_url = `${data.avatar_url.split('?')[0]}?t=${new Date().getTime()}`;
      }
      profile.value = data;
    }
  } catch (e) {
    console.error(e);
  } finally { 
    loading.value = false; 
  }
};

const updateProfile = async () => {
  const { error } = await supabase.from('profiles').upsert({
    id: userId.value,
    username: profile.value.username,
    full_name: profile.value.full_name,
    avatar_url: profile.value.avatar_url,
    updated_at: new Date(),
  });
  if (error) showToast(error.message, 'danger');
  else showToast('Profile Updated!', 'success');
};

const handleSignOut = async () => {
  // 1. Clear memory variables first
  profile.value = { username: '', full_name: '', avatar_url: '' };
  userId.value = '';
  
  // 2. Sign out from Supabase
  await supabase.auth.signOut();
  
  // 3. Navigate away and replace history so user can't "back" into the profile
  router.replace('/login');
};

const copyId = async () => {
  await navigator.clipboard.writeText(userId.value);
  showToast('ID Copied!', 'success');
};

// This ensures the data reloads every time you switch to the profile tab
onIonViewWillEnter(() => {
  loadProfile();
});
</script>

<style scoped>
/* styles remain exactly as you designed them */
.profile-page { --background: #ffffff; }
.header-section { text-align: center; margin-bottom: 30px; padding-top: 20px; }
.avatar-wrapper { position: relative; display: inline-block; margin-bottom: 15px; }
.avatar-ring { width: 120px; height: 120px; border-radius: 50%; padding: 4px; background: linear-gradient(45deg, #2dd36f, #a2edbc); display: flex; align-items: center; justify-content: center; }
.profile-avatar-img, .profile-avatar-placeholder { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; background: white; border: 3px solid white; display: flex; align-items: center; justify-content: center; font-size: 3rem; font-weight: 800; color: #2dd36f; }
.camera-badge { position: absolute; bottom: 5px; right: 5px; background: #2dd36f; color: white; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 3px solid white; box-shadow: 0 4px 10px rgba(0,0,0,0.1); }
.display-username { font-size: 1.5rem; font-weight: 800; margin: 0; color: #1a1a1a; }
.display-name { color: #8c8c8c; margin: 5px 0 0 0; }
.info-card { background: #f8f9f8; border-radius: 16px; padding: 16px; margin-bottom: 25px; }
.card-header { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
.card-header ion-label { font-weight: 700; font-size: 0.9rem; color: #1a1a1a; }
.id-box { background: white; border: 1px dashed #2dd36f; border-radius: 12px; display: flex; align-items: center; justify-content: space-between; padding: 4px 4px 4px 12px; }
.user-id-text { font-family: monospace; font-size: 0.85rem; color: #444; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.custom-input-group { margin-bottom: 20px; }
.custom-input-group ion-label { display: block; font-weight: 700; font-size: 0.85rem; margin-bottom: 8px; color: #1a1a1a; padding-left: 4px; }
.input-container { background: #f8f9f8; border-radius: 14px; padding: 14px 16px; border: 2px solid transparent; transition: 0.3s ease; }
.input-container:focus-within { border-color: #2dd36f; background: white; box-shadow: 0 4px 12px rgba(45, 211, 111, 0.1); }
.input-container input { border: none; background: transparent; width: 100%; outline: none; font-size: 1rem; color: #1a1a1a; }
.update-btn { --background: #2dd36f; --border-radius: 14px; --box-shadow: 0 8px 16px rgba(45, 211, 111, 0.2); margin-top: 10px; height: 56px; font-weight: 700; }
</style>