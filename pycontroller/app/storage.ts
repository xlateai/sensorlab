// storage.ts
// Safe storage helper for React Native/Expo

let memoryStore: Record<string, string> = {};

let AsyncStorage: any = null;
try {
  AsyncStorage = require('@react-native-async-storage/async-storage').default;
} catch (e) {
  AsyncStorage = null;
}

export async function getItem(key: string): Promise<string | null> {
  if (AsyncStorage) {
    try {
      return await AsyncStorage.getItem(key);
    } catch {
      return memoryStore[key] ?? null;
    }
  }
  return memoryStore[key] ?? null;
}

export async function setItem(key: string, value: string): Promise<void> {
  if (AsyncStorage) {
    try {
      await AsyncStorage.setItem(key, value);
      memoryStore[key] = value;
      return;
    } catch {
      memoryStore[key] = value;
      return;
    }
  }
  memoryStore[key] = value;
}
