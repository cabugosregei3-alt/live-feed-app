<template>
  <ion-page>
    <ion-content class="ion-padding auth-page">
      <div class="circles-background">
        <div class="circle circle-1"></div>
        <div class="circle circle-2"></div>
      </div>

      <div class="auth-wrapper">
        <div class="header-section">
          <div class="logo-icon">
            <ion-icon :icon="locationOutline" color="light"></ion-icon>
          </div>
          <h1>{{ isSignUp ? 'Join Us' : 'STS' }}</h1>
          <small>Stephanie's Tracking System</small>
          <p>{{ isSignUp ? 'Create an account to start tracking' : 'Sign in to see your friends' }}</p>
        </div>

        <div class="form-container">
          <div class="input-group">
            <ion-label>Email Address</ion-label>
            <div class="custom-input">
              <ion-icon :icon="mailOutline"></ion-icon>
              <input v-model="email" type="email" placeholder="email@example.com" />
            </div>
          </div>

          <div class="input-group">
            <ion-label>Password</ion-label>
            <div class="custom-input">
              <ion-icon :icon="lockClosedOutline"></ion-icon>
              <input v-model="password" type="password" placeholder="••••••••" />
            </div>
          </div>

          <ion-button expand="block" class="main-btn" @click="handleAuth" :disabled="loading">
            <ion-spinner v-if="loading" name="crescent"></ion-spinner>
            <span v-else>{{ isSignUp ? 'Create Profile' : 'Sign In' }}</span>
          </ion-button>

          <div class="toggle-container">
            <p @click="isSignUp = !isSignUp">
              {{ isSignUp ? 'Already have an account?' : 'New here?' }}
              <span>{{ isSignUp ? 'Login' : 'Create a profile' }}</span>
            </p>
          </div>
        </div>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup>
import { ref } from 'vue';
import { supabase } from '../lib/supabase';
import { useRouter } from 'vue-router';
import { 
  IonPage, IonContent, IonButton, IonIcon, IonSpinner, toastController 
} from '@ionic/vue';
import { mailOutline, lockClosedOutline, locationOutline } from 'ionicons/icons';

const router = useRouter();
const email = ref('');
const password = ref('');
const isSignUp = ref(false);
const loading = ref(false);

const showToast = async (message, color = 'dark') => {
  const toast = await toastController.create({
    message: message,
    duration: 2000,
    color: color,
    position: 'bottom'
  });
  await toast.present();
};

const handleAuth = async () => {
  if (!email.value || !password.value) {
    return showToast('Please fill in all fields', 'danger');
  }

  loading.value = true;
  try {
    if (isSignUp.value) {
      const { error } = await supabase.auth.signUp({
        email: email.value,
        password: password.value,
      });
      if (error) throw error;
      showToast('Registration successful!', 'success');
      router.push('/tabs/profile');
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.value,
        password: password.value
      });
      if (error) throw error;
      showToast('Welcome back!', 'success');
      router.push('/tabs/profile');
    }
  } catch (error) {
    showToast(error.message, 'danger');
  } finally {
    loading.value = false;
  }
};
</script>

<style scoped>
/* Colors: Green (#2dd36f) and White (#ffffff) */

.auth-page {
  --background: #ffffff;
  display: flex;
  align-items: center;
}

/* Decorative background elements */
.circles-background {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  z-index: 0;
}

.circle {
  position: absolute;
  border-radius: 50%;
  background: rgba(45, 211, 111, 0.05);
}

.circle-1 {
  width: 300px;
  height: 300px;
  top: -100px;
  right: -50px;
}

.circle-2 {
  width: 200px;
  height: 200px;
  bottom: -50px;
  left: -50px;
}

.auth-wrapper {
  position: relative;
  z-index: 1;
  padding: 20px;
  margin-top: 10vh;
}

.header-section {
  text-align: center;
  margin-bottom: 40px;
}

.logo-icon {
  background: #2dd36f;
  width: 60px;
  height: 60px;
  border-radius: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 32px;
  margin-bottom: 20px;
  box-shadow: 0 10px 20px rgba(45, 211, 111, 0.3);
}

.header-section h1 {
  font-weight: 800;
  font-size: 2rem;
  color: #1a1a1a;
  margin: 0;
}

.header-section p {
  color: #8c8c8c;
  margin-top: 8px;
}

.form-container {
  text-align: left;
}

.input-group {
  margin-bottom: 20px;
}

.input-group ion-label {
  font-size: 0.9rem;
  font-weight: 600;
  color: #1a1a1a;
  margin-left: 5px;
  display: block;
  margin-bottom: 8px;
}

.custom-input {
  background: #f8f9f8;
  border: 2px solid transparent;
  border-radius: 14px;
  padding: 12px 16px;
  display: flex;
  align-items: center;
  transition: all 0.3s ease;
}

.custom-input:focus-within {
  border-color: #2dd36f;
  background: #ffffff;
  box-shadow: 0 4px 12px rgba(45, 211, 111, 0.1);
}

.custom-input ion-icon {
  font-size: 20px;
  color: #2dd36f;
  margin-right: 12px;
}

.custom-input input {
  border: none;
  background: transparent;
  outline: none;
  width: 100%;
  font-size: 1rem;
  color: #1a1a1a;
}

.main-btn {
  --background: #2dd36f;
  --background-activated: #28ba62;
  --border-radius: 14px;
  --box-shadow: 0 10px 20px rgba(45, 211, 111, 0.2);
  height: 56px;
  margin-top: 30px;
  font-weight: 700;
  font-size: 1rem;
}

.toggle-container {
  margin-top: 25px;
  text-align: center;
}

.toggle-container p {
  color: #8c8c8c;
  font-size: 0.95rem;
}

.toggle-container span {
  color: #2dd36f;
  font-weight: 700;
  cursor: pointer;
  margin-left: 5px;
}
</style>