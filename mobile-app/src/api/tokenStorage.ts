import * as SecureStore from 'expo-secure-store';

// เก็บ token ใน secure storage ของเครื่อง (Keychain บน iOS, Keystore-backed บน Android)
// ปลอดภัยกว่า AsyncStorage ธรรมดาเพราะ token พวกนี้ใช้แทนรหัสผ่านได้ถ้าหลุด

const ACCESS_TOKEN_KEY = 'iot_access_token';
const REFRESH_TOKEN_KEY = 'iot_refresh_token';

export const tokenStorage = {
  async getAccessToken(): Promise<string | null> {
    return SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
  },
  async getRefreshToken(): Promise<string | null> {
    return SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
  },
  async setTokens(accessToken: string, refreshToken: string): Promise<void> {
    await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, accessToken);
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken);
  },
  async clear(): Promise<void> {
    await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
  },
};
