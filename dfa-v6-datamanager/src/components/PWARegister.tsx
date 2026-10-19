'use client';

import { useEffect, useState } from 'react';
import { getAppVersion } from '@/lib/version';

export default function PWARegister() {
  const [showUpdatePrompt, setShowUpdatePrompt] = useState(false);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const [lastActivity, setLastActivity] = useState(Date.now());
  const [isFormActive, setIsFormActive] = useState(false);

  const cleanupOldCaches = async () => {
    if (!('caches' in window)) return;

    if (process.env.NODE_ENV === 'development') {
      console.log('⏭️  Skipping cache cleanup in development mode');
      return;
    }

    try {
      const currentCacheVersion = `v${await getAppVersion()}`;

      if (process.env.NODE_ENV !== 'production') {
        console.log('🧹 Current cache version:', currentCacheVersion);
      }

      const cacheNames = await caches.keys();
      const projectPrefix = 'dfa-dm-';

      const oldCaches = cacheNames.filter(cacheName => {
        if (!cacheName.startsWith(projectPrefix)) return false;

        const versionMatch = cacheName.match(/-(v\d+\.\d+\.\d+)$/);
        if (!versionMatch) return false;

        const cacheVersion = versionMatch[1];
        return cacheVersion !== currentCacheVersion;
      });

      if (oldCaches.length > 0) {
        console.log('🗑️  Cleaning up old caches:', oldCaches.length, 'cache(s)');

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
    const IDLE_THRESHOLD = 5 * 60 * 1000;

    if (!isFormActive && idleTime > IDLE_THRESHOLD) {
      console.log('✅ User idle for 5+ minutes - Applying update automatically...');
      worker.postMessage({ type: 'SKIP_WAITING' });
      window.location.reload();
    }
  };

  useEffect(() => {
    const activityHandler = () => {
      setLastActivity(Date.now());
    };

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
    const isPWAEnabled = process.env.NEXT_PUBLIC_PWA_ENABLED !== 'false';

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

          cleanupOldCaches();

          window.addEventListener('focus', () => {
            registration.update();
          });

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

                  const idleCheckInterval = setInterval(() => {
                    checkAndApplyUpdate(newWorker);
                  }, 5 * 60 * 1000);

                  navigator.serviceWorker.addEventListener('controllerchange', () => {
                    console.log('✅ Applying update... ');
                    clearInterval(idleCheckInterval);
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
  }, []);

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
