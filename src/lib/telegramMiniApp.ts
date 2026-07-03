import { signInWithCustomToken, updateProfile } from 'firebase/auth';
import { auth } from '../firebase';

type TelegramWebApp = {
  initData: string;
  ready: () => void;
  expand: () => void;
  downloadFile?: (
    params: {
      url: string;
      file_name: string;
    },
    callback?: (accepted: boolean) => void,
  ) => void;
  openLink?: (url: string) => void;
  openTelegramLink?: (url: string) => void;
};

declare global {
  interface Window {
    Telegram?: {
      WebApp?: TelegramWebApp;
    };
  }
}

type TelegramAuthResponse = {
  customToken: string;
  displayName: string;
  isOwner: boolean;
};

const BOT_USERNAME_PATTERN = /^[A-Za-z0-9_]{5,32}$/;

export const initializeTelegramMiniApp = () => {
  const webApp = window.Telegram?.WebApp;
  webApp?.ready();
  webApp?.expand();
  return webApp;
};

export const getTelegramInitData = () => (
  String(window.Telegram?.WebApp?.initData || '')
);

export const authenticateTelegramMiniApp = async () => {
  const initData = getTelegramInitData();
  if (!initData) {
    throw new Error('Open Taurus from the private Telegram bot.');
  }

  const response = await fetch('/api/telegram-auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ initData }),
    credentials: 'same-origin',
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || typeof payload.customToken !== 'string') {
    if (
      (
        payload.code === 'TELEGRAM_FAMILY_SETUP_REQUIRED'
        || payload.code === 'TELEGRAM_FAMILY_ACCESS_REQUIRED'
      )
      && /^[1-9][0-9]{0,15}$/.test(String(payload.telegramUserId || ''))
    ) {
      throw new Error(
        `Family setup required. Your Telegram ID is ${payload.telegramUserId}. Add it to TELEGRAM_ALLOWED_USER_IDS in Vercel Preview.`,
      );
    }
    throw new Error(payload.error || 'Telegram authentication failed.');
  }

  const telegramAuth = payload as TelegramAuthResponse;
  const credential = await signInWithCustomToken(auth, telegramAuth.customToken);
  if (
    telegramAuth.displayName
    && credential.user.displayName !== telegramAuth.displayName
  ) {
    await updateProfile(credential.user, {
      displayName: telegramAuth.displayName.slice(0, 80),
    });
  }
  return credential.user;
};

export const openTaurusTelegramMiniApp = () => {
  const username = String(
    import.meta.env.VITE_TELEGRAM_BOT_USERNAME || 'Taurus_Studio_Bot',
  ).trim();
  if (!BOT_USERNAME_PATTERN.test(username)) {
    throw new Error('Telegram bot is not configured yet.');
  }
  const url = `https://t.me/${username}?startapp=taurus`;
  const webApp = window.Telegram?.WebApp;
  if (webApp?.openTelegramLink) {
    webApp.openTelegramLink(url);
    return;
  }
  window.location.assign(url);
};

export const requestTelegramFileDownload = (
  url: string,
  fileName: string,
) => {
  const webApp = window.Telegram?.WebApp;
  if (!webApp?.downloadFile || !url.startsWith('https://')) {
    return false;
  }

  webApp.downloadFile({
    url,
    file_name: fileName,
  });
  return true;
};

export const openExternalDownload = (url: string) => {
  const webApp = window.Telegram?.WebApp;
  if (!webApp?.openLink || !url.startsWith('https://')) {
    return false;
  }

  webApp.openLink(url);
  return true;
};
