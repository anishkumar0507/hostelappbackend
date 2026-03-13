import axios from 'axios';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/**
 * Send a push notification to a single Expo push token.
 * Errors are caught and logged — notification failures never break the main flow.
 *
 * @param {string|null} expoPushToken - Expo push token (ExponentPushToken[...])
 * @param {string} title - Notification title
 * @param {string} body  - Notification body text
 * @param {object} data  - Optional extra data payload
 */
export const sendPushNotification = async (expoPushToken, title, body, data = {}) => {
  if (!expoPushToken) return;

  try {
    await axios.post(
      EXPO_PUSH_URL,
      {
        to: expoPushToken,
        sound: 'default',
        title,
        body,
        data,
      },
      {
        headers: {
          Accept: 'application/json',
          'Accept-encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error) {
    console.error('[push] sendPushNotification error:', error?.response?.data || error.message);
  }
};

/**
 * Send the same push notification to multiple Expo push tokens in a single batch request.
 * Silently filters out null/undefined tokens.
 *
 * @param {(string|null)[]} expoPushTokens - Array of Expo push tokens
 * @param {string} title
 * @param {string} body
 * @param {object} data
 */
export const sendPushNotifications = async (expoPushTokens, title, body, data = {}) => {
  const validTokens = (expoPushTokens || []).filter(Boolean);
  if (!validTokens.length) return;

  try {
    const messages = validTokens.map((token) => ({
      to: token,
      sound: 'default',
      title,
      body,
      data,
    }));

    await axios.post(EXPO_PUSH_URL, messages, {
      headers: {
        Accept: 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    console.error('[push] sendPushNotifications batch error:', error?.response?.data || error.message);
  }
};
