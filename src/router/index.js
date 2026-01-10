import { createRouter, createWebHistory } from '@ionic/vue-router';
import TabsLayout from '../views/TabsLayout.vue'; // Import the new layout

const routes = [
  {
    path: '/',
    redirect: '/login'
  },
  {
    path: '/login',
    component: () => import('../views/LoginPage.vue')
  },
  {
    path: '/tabs/',
    component: TabsLayout, // Use the new Layout here!
    children: [
      {
        path: '',
        redirect: '/tabs/map'
      },
      {
        path: 'map',
        component: () => import('../views/MapPage.vue')
      },
      {
        path: 'friends',
        component: () => import('../views/FriendsPage.vue')
      },
      {
        path: 'profile',
        component: () => import('../views/ProfilePage.vue')
      }
    ]
  }
];

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes
});

export default router;