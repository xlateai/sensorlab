import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
let memoryStore: Record<string, string> = {};
let AsyncStorage: any = null;
try {
  AsyncStorage = require('@react-native-async-storage/async-storage').default;
} catch (e) {
  AsyncStorage = null;
}

interface StorageContextType {
  get: (key: string) => string | undefined;
  set: (key: string, value: string) => void;
  store: Record<string, string>;
}

const StorageContext = createContext<StorageContextType>({
  get: () => undefined,
  set: () => {},
  store: {},
});

export function useStorage() {
  return useContext(StorageContext);
}

export function StorageProvider({ children }: { children: React.ReactNode }) {
  const [store, setStore] = useState<Record<string, string>>({});

  // Load all keys you care about on mount
  useEffect(() => {
    (async () => {
      let selectedMode: string | null = null;
      if (AsyncStorage) {
        try {
          selectedMode = await AsyncStorage.getItem('selectedMode');
        } catch {
          selectedMode = memoryStore['selectedMode'] ?? null;
        }
      } else {
        selectedMode = memoryStore['selectedMode'] ?? null;
      }
      setStore(s => ({ ...s, selectedMode: selectedMode ?? '0' }));
    })();
  }, []);

  const set = useCallback((key: string, value: string) => {
    setStore(s => ({ ...s, [key]: value }));
    memoryStore[key] = value;
    if (AsyncStorage) {
      AsyncStorage.setItem(key, value).catch(() => {});
    }
  }, []);

  const get = useCallback((key: string) => store[key], [store]);

  return (
    <StorageContext.Provider value={{ get, set, store }}>
      {children}
    </StorageContext.Provider>
  );
}
