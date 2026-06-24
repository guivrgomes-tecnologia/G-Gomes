self.addEventListener('fetch', () => {})

self.addEventListener('push', event => {
  const data = event.data?.json() ?? {}
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'G Gomes', {
      body: data.body ?? '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: data.tag ?? 'default',
      renotify: true,
      data: { url: data.url ?? '/' }
    })
  )
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(event.notification.data.url)
          return client.focus()
        }
      }
      return clients.openWindow(event.notification.data.url)
    })
  )
})
