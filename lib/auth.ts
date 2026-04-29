import * as SecureStore from 'expo-secure-store';

const ADMIN_KEY = 'admin';
const DEFAULT_PASSCODE = '5846';

export async function verifyPasscode(input: string): Promise<boolean> {
  const stored = await SecureStore.getItemAsync(ADMIN_KEY);
  const passcode = stored ?? DEFAULT_PASSCODE;
  return input === passcode;
}

export async function changePasscode(newCode: string): Promise<void> {
  await SecureStore.setItemAsync(ADMIN_KEY, newCode);
}