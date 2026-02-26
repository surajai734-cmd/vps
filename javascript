// Service Worker for LUXFEE PWA
const CACHE_NAME = 'luxfee-cache-v1';
const DYNAMIC_CACHE = 'luxfee-dynamic-v1';

// Assets to cache on install
const urlsToCache = [
  '/',
  '/index.html',
  'https://cdn.tailwindcss.com',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css',
  'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600;700;800&family=Poppins:wght@300;400;500;600;700&display=swap',
  'https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/9.22.0/firebase-database-compat.js',
  'https://www.gstatic.com/firebasejs/9.22.0/firebase-auth-compat.js',
  'https://cdn.jsdelivr.net/npm/sweetalert2@11'
];

// Firebase domains to allow
const firebaseDomains = [
  'firebase.googleapis.com',
  'firebasedatabase.googleapis.com',
  'securetoken.googleapis.com',
  'identitytoolkit.googleapis.com'
];

// Install event - cache core assets
self.addEventListener('install', event => {
  console.log('✅ Service Worker installing...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('✅ Caching app resources');
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        console.log('✅ All resources cached successfully');
        return self.skipWaiting();
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  console.log('✅ Service Worker activating...');
  
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME && cache !== DYNAMIC_CACHE) {
            console.log('✅ Clearing old cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => {
      console.log('✅ Service Worker activated');
      return self.clients.claim();
    })
  );
});

// Helper function to check if request is for Firebase
function isFirebaseRequest(url) {
  return firebaseDomains.some(domain => url.includes(domain));
}

// Helper function to check if request is for our app
function isAppRequest(url) {
  return url.includes(self.location.origin) || 
         url.includes('fonts.googleapis.com') || 
         url.includes('cdnjs.cloudflare.com') ||
         url.includes('cdn.jsdelivr.net') ||
         url.includes('cdn.tailwindcss.com') ||
         url.includes('gstatic.com');
}

// Network with cache fallback strategy
async function networkFirst(request) {
  try {
    // Try network first
    const networkResponse = await fetch(request);
    
    // Cache successful responses
    if (networkResponse && networkResponse.status === 200) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.log('Network failed, trying cache:', request.url);
    
    // Fallback to cache
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // If request is for HTML and no cache, return offline page
    if (request.mode === 'navigate') {
      return caches.match('/');
    }
    
    return new Response('Offline - Content not available', {
      status: 503,
      statusText: 'Service Unavailable'
    });
  }
}

// Cache first strategy for static assets
async function cacheFirst(request) {
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }
  
  try {
    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.status === 200) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    return new Response('Offline - Static asset not available', {
      status: 503,
      statusText: 'Service Unavailable'
    });
  }
}

// Fetch event handler
self.addEventListener('fetch', event => {
  const requestUrl = event.request.url;
  
  // Don't cache Firebase API requests
  if (isFirebaseRequest(requestUrl)) {
    event.respondWith(fetch(event.request));
    return;
  }
  
  // For our app resources
  if (isAppRequest(requestUrl)) {
    // For HTML navigation requests
    if (event.request.mode === 'navigate') {
      event.respondWith(networkFirst(event.request));
      return;
    }
    
    // For static assets (CSS, JS, fonts)
    if (requestUrl.includes('.css') || 
        requestUrl.includes('.js') || 
        requestUrl.includes('fonts') ||
        requestUrl.includes('cdn')) {
      event.respondWith(cacheFirst(event.request));
      return;
    }
    
    // For other resources
    event.respondWith(networkFirst(event.request));
  }
});

// Background sync for offline payments
self.addEventListener('sync', event => {
  if (event.tag === 'payment-sync') {
    console.log('🔄 Syncing offline payments');
    event.waitUntil(syncOfflinePayments());
  }
});

// Function to sync offline payments
async function syncOfflinePayments() {
  try {
    const cache = await caches.open('offline-payments');
    const requests = await cache.keys();
    
    for (const request of requests) {
      try {
        const response = await fetch(request);
        if (response.ok) {
          await cache.delete(request);
          console.log('✅ Payment synced successfully');
          
          // Notify all clients about successful sync
          const clients = await self.clients.matchAll();
          clients.forEach(client => {
            client.postMessage({
              type: 'PAYMENT_SYNCED',
              url: request.url
            });
          });
        }
      } catch (error) {
        console.log('❌ Failed to sync payment:', error);
      }
    }
  } catch (error) {
    console.log('❌ Error syncing payments:', error);
  }
}

// Push notification handler
self.addEventListener('push', event => {
  const data = event.data.json();
  
  const options = {
    body: data.body || 'New notification from LUXFEE',
    icon: 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'192\' height=\'192\' viewBox=\'0 0 192 192\'%3E%3Crect width=\'192\' height=\'192\' fill=\'%23667eea\'/%3E%3Ctext x=\'50%25\' y=\'50%25\' dominant-baseline=\'middle\' text-anchor=\'middle\' font-family=\'Arial\' font-size=\'80\' fill=\'white\'%3ELF%3C/text%3E%3C/svg%3E',
    badge: 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'96\' height=\'96\' viewBox=\'0 0 96 96\'%3E%3Crect width=\'96\' height=\'96\' fill=\'%23667eea\'/%3E%3Ctext x=\'50%25\' y=\'50%25\' dominant-baseline=\'middle\' text-anchor=\'middle\' font-family=\'Arial\' font-size=\'40\' fill=\'white\'%3ELF%3C/text%3E%3C/svg%3E',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1,
      url: data.url || '/'
    },
    actions: [
      {
        action: 'open',
        title: 'Open App'
      },
      {
        action: 'close',
        title: 'Close'
      }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(
      data.title || 'LUXFEE',
      options
    )
  );
});

// Notification click handler
self.addEventListener('notificationclick', event => {
  event.notification.close();

  if (event.action === 'open') {
    event.waitUntil(
      clients.openWindow(event.notification.data.url || '/')
    );
  } else if (event.action === 'close') {
    // Just close the notification
    return;
  }
});

// Message handler from client
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CACHE_PAYMENT') {
    // Cache payment request for offline sync
    event.waitUntil(
      caches.open('offline-payments').then(cache => {
        return cache.put(event.data.url, new Response(JSON.stringify(event.data.payment)));
      })
    );
  }
});

// Periodic background sync for updates (if supported)
if ('periodicSync' in self.registration) {
  self.addEventListener('periodicsync', event => {
    if (event.tag === 'update-content') {
      event.wait
