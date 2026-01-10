<template>
  <ion-page>
    <ion-tabs>
      <ion-router-outlet></ion-router-outlet>
      
      <ion-tab-bar slot="bottom">
        <ion-tab-button tab="map" href="/tabs/map">
          <ion-icon :icon="mapOutline" />
          <ion-label>Map</ion-label>
        </ion-tab-button>

        <ion-tab-button tab="friends" href="/tabs/friends">
          <ion-icon :icon="peopleOutline" />
          <ion-label>Friends</ion-label>
        </ion-tab-button>

        <ion-tab-button tab="profile" href="/tabs/profile">
          <ion-icon :icon="personOutline" />
          <ion-label>Profile</ion-label>
        </ion-tab-button>
      </ion-tab-bar>
    </ion-tabs>
  </ion-page>
</template>

<script setup>
import { IonPage, IonTabs, IonTabBar, IonTabButton, IonIcon, IonLabel, IonRouterOutlet } from '@ionic/vue';
import { mapOutline, peopleOutline, personOutline } from 'ionicons/icons';
</script>

<style scoped>
/* Modern Green & White Tab Bar Styling */
ion-tab-bar {
  --background: #ffffff;
  --border: 0;
  border-top: 1px solid rgba(45, 211, 111, 0.1); /* Subtle green border */
  height: 65px;
  padding-bottom: env(safe-area-inset-bottom);
  box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.05); /* Soft elevation shadow */
}

ion-tab-button {
  --color: #8c8c8c; /* Gray for inactive tabs */
  --color-selected: #2dd36f; /* Signature Green for active tab */
  transition: all 0.3s ease;
}

/* Style for the icons */
ion-icon {
  font-size: 24px;
  margin-bottom: 2px;
}

/* Style for the labels */
ion-label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.3px;
}

/* Subtle "Active" effect: make the icon pop slightly when selected */
ion-tab-button.tab-selected ion-icon {
  transform: translateY(-2px);
  filter: drop-shadow(0 2px 4px rgba(45, 211, 111, 0.3));
}
</style>