// Workbox types for PWA
interface WorkboxLifecycleEvent {
  isUpdate?: boolean;
  isExternal?: boolean;
}

interface Workbox {
  register: () => void;
  addEventListener: (event: string, callback: (event: WorkboxLifecycleEvent) => void) => void;
}

declare global {
  interface Window {
    workbox: Workbox | undefined;
  }
}

export {};
