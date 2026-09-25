import { beforeinstallprompt } from '../pwa/types';

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();

export const installState = {
  installed: window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true,
  canInstall: false,
};

function notify(): void {
  for (const fn of listeners) fn();
}

window.addEventListener(beforeinstallprompt, (event) => {
  event.preventDefault();
  deferred = event as InstallPromptEvent;
  installState.canInstall = true;
  notify();
});

window.addEventListener('appinstalled', () => {
  deferred = null;
  installState.canInstall = false;
  installState.installed = true;
  notify();
});

export function onInstallStateChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export async function promptInstall(): Promise<void> {
  if (!deferred) return;
  await deferred.prompt();
  const choice = await deferred.userChoice;
  deferred = null;
  installState.canInstall = false;
  notify();
  if (choice.outcome === 'accepted') installState.installed = true;
}

/** Safari en iOS no dispara beforeinstallprompt: hay que usar分享菜单. */
export function isIosSafari(): boolean {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
}

export function isStandalone(): boolean {
  return installState.installed;
}
