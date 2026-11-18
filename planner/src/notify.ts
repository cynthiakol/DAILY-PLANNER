// Sends a notification: native Windows toast in the installed app, browser Notification otherwise.
const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
export async function notify(title: string, body: string): Promise<boolean> {
  try {
    if (isTauri) {
      const n = await import('@tauri-apps/plugin-notification');
      let ok = await n.isPermissionGranted();
      if (!ok) ok = (await n.requestPermission()) === 'granted';
      if (ok) n.sendNotification({ title, body });
      return ok;
    }
    if (typeof Notification !== 'undefined') {
      let p = Notification.permission;
      if (p === 'default') p = await Notification.requestPermission();
      if (p === 'granted') { new Notification(title, { body, icon: './icon-192.png' }); return true; }
    }
  } catch { /* fall through */ }
  return false;
}
