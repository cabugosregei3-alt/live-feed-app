/// <reference types="vite/client" />

// This tells TypeScript how to handle Vue files
declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

// This prevents the error for your router file
declare module './router' {
  const router: any
  export default router
}