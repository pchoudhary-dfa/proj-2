'use client';

import { useEffect, useState } from 'react';

export default function PWARegister() {
  const [showUpdatePrompt, setShowUpdatePrompt] = useState(false);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const [lastActivity, setLastActivity] = useState(Date.now());
  const [isFormActive, setIsFormActive] = useState(false);

  // Clean up old versioned caches (keeps only current version)
  const cleanupOldCaches = async () => {
    if (!('caches' in window)) return;
    
    // Skip in development mode
    if (process.env.NODE_ENV === 'development') {
      console.log('⏭️  Skipping cache cleanup in development mode');
      return;
    }

    try {
      // Fetch current version from VERSION.txt (with cache)
      const response = await fetch('/VERSION.txt', { cache: 'default' });
      const currentVersion = await response.text();
      const currentCacheVersion = `v${currentVersion.trim()}`;

      // Only log in development or when there are caches to clean
      if (process.env.NODE_ENV !== 'production') {
        console.log('🧹 Current cache version:', currentCacheVersion);
      }

      // Get all cache names
      const cacheNames = await caches.keys();
      const projectPrefix = 'dfa-viz-';

      // Filter caches that belong to this project and are old versions
      const oldCaches = cacheNames.filter(cacheName => {
        // Check if it's our project cache
        if (!cacheName.startsWith(projectPrefix)) return false;

        // Check if it has a version suffix
        const versionMatch = cacheName.match(/-(v\d+\.\d+\.\d+)$/);
        if (!versionMatch) return false;

        // Keep current version, delete others
        const cacheVersion = versionMatch[1];
        return cacheVersion !== currentCacheVersion;
      });

      if (oldCaches.length > 0) {
        console.log('🗑️  Cleaning up old caches:', oldCaches.length, 'cache(s)');
        
        // Delete all old caches
        await Promise.all(
          oldCaches.map(cacheName => caches.delete(cacheName))
        );
        
        console.log('✅ Cache cleanup complete');
      }
    } catch (error) {
      console.error('❌ Error cleaning up old caches:', error);
    }
  };

  const handleUpdate = () => {
    if (waitingWorker) {
      waitingWorker.postMessage({ type: 'SKIP_WAITING' });
      setShowUpdatePrompt(false);
      window.location.reload();
    }
  };

  const checkAndApplyUpdate = (worker: ServiceWorker) => {
    const idleTime = Date.now() - lastActivity;
    const IDLE_THRESHOLD = 5 * 60 * 1000; // 5 minutes
    
    // Only auto-reload if user is idle for 5+ min AND not in a form
    if (!isFormActive && idleTime > IDLE_THRESHOLD) {
      console.log('✅ User idle for 5+ minutes - Applying update automatically...');
      worker.postMessage({ type: 'SKIP_WAITING' });
      window.location.reload();
    }
  };

  useEffect(() => {
    // Track user activity (mouse movement, clicks, keyboard)
    const activityHandler = () => {
      setLastActivity(Date.now());
    };

    // Track if user is in a form field
    const focusInHandler = (e: FocusEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        setIsFormActive(true);
      }
    };

    const focusOutHandler = (e: FocusEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        // Small delay to check if focus moved to another form element
        setTimeout(() => {
          const activeElement = document.activeElement;
          setIsFormActive(
            activeElement instanceof HTMLInputElement ||
            activeElement instanceof HTMLTextAreaElement ||
            activeElement instanceof HTMLSelectElement
          );
        }, 100);
      }
    };

    document.addEventListener('mousemove', activityHandler);
    document.addEventListener('mousedown', activityHandler);
    document.addEventListener('keypress', activityHandler);
    document.addEventListener('scroll', activityHandler);
    document.addEventListener('touchstart', activityHandler);
    document.addEventListener('focusin', focusInHandler);
    document.addEventListener('focusout', focusOutHandler);

    return () => {
      document.removeEventListener('mousemove', activityHandler);
      document.removeEventListener('mousedown', activityHandler);
      document.removeEventListener('keypress', activityHandler);
      document.removeEventListener('scroll', activityHandler);
      document.removeEventListener('touchstart', activityHandler);
      document.removeEventListener('focusin', focusInHandler);
      document.removeEventListener('focusout', focusOutHandler);
    };
  }, []);

  useEffect(() => {
    // Check if PWA is enabled via environment variable
    const isPWAEnabled = process.env.NEXT_PUBLIC_PWA_ENABLED !== 'false';
    
    // Skip service worker registration in development mode or if PWA is disabled
    if (process.env.NODE_ENV === 'development') {
      console.log('⏭️  PWA disabled in development mode');
      return;
    }
    
    if (!isPWAEnabled) {
      console.log('⏭️  PWA disabled via environment variable');
      return;
    }
    
    if (
      typeof window !== 'undefined' &&
      'serviceWorker' in navigator &&
      window.workbox !== undefined
    ) {
      const wb = window.workbox;
      
      wb.addEventListener('installed', (event) => {
        if (event.isUpdate) {
          console.log('🔄 Update available - Showing notification to user');
          setShowUpdatePrompt(true);
        }
      });

      wb.addEventListener('waiting', () => {
        setShowUpdatePrompt(true);
      });

      wb.addEventListener('controlling', () => {
        // Reload will happen after user action or when idle
      });

      wb.addEventListener('activated', () => {
        console.log('✅ PWA activated');
        // Clean up old caches after activation
        cleanupOldCaches();
      });

      wb.register();
      
    } else if (
      typeof window !== 'undefined' &&
      'serviceWorker' in navigator
    ) {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .then((registration) => {
          console.log('✅ PWA registered');
          
          // Clean up old caches on initial registration
          cleanupOldCaches();
          
          // Check for updates when user returns to the tab (better than polling)
          window.addEventListener('focus', () => {
            registration.update();
          });
          
          // Also check when page becomes visible
          document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
              registration.update();
            }
          });
          
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  console.log('🔄 New service worker installed - User will be notified');
                  setWaitingWorker(newWorker);
                  setShowUpdatePrompt(true);
                  
                  // Check every 5 minutes if user is idle enough to auto-apply
                  const idleCheckInterval = setInterval(() => {
                    checkAndApplyUpdate(newWorker);
                  }, 5 * 60 * 1000); // Check every 5 minutes
                  
                  // Listen for controller change (new SW took control)
                  navigator.serviceWorker.addEventListener('controllerchange', () => {
                    console.log('✅ Applying update... ');
                    clearInterval(idleCheckInterval);
                    // Clean up old caches before reload
                    cleanupOldCaches().finally(() => {
                      window.location.reload();
                    });
                  });
                }
              });
            }
          });
        })
        .catch((error) => {
          console.error('❌ PWA registration failed:', error);
        });
    }
  }, []); // ✅ Empty array - run only ONCE on mount

  return (
    <>
      {showUpdatePrompt && (
        <div style={{
          position: 'fixed',
          bottom: '20px',
          right: '20px',
          backgroundColor: '#333',
          color: 'white',
          padding: '16px 24px',
          borderRadius: '8px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          maxWidth: '350px',
          animation: 'slideIn 0.3s ease-out'
        }}>
          <div>
            <strong>🔄 Update Available</strong>
            <p style={{ margin: '8px 0 0 0', fontSize: '14px', lineHeight: '1.5' }}>
              A new version is ready. Update now or it will apply automatically when you&apos;re idle.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={handleUpdate}
              style={{
                backgroundColor: '#4CAF50',
                color: 'white',
                border: 'none',
                padding: '8px 16px',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: 'bold',
                fontSize: '14px'
              }}
            >
              Update Now
            </button>
            <button
              onClick={() => setShowUpdatePrompt(false)}
              style={{
                backgroundColor: '#666',
                color: 'white',
                border: 'none',
                padding: '8px 16px',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              Later
            </button>
          </div>
        </div>
      )}
      <style jsx>{`
        @keyframes slideIn {
          from {
            transform: translateX(400px);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
      `}</style>
    </>
  );
}
