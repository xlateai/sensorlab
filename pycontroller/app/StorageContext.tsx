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

  // Load all keys from AsyncStorage on mount
  useEffect(() => {
    (async () => {
      if (AsyncStorage) {
        try {
          const keys = await AsyncStorage.getAllKeys();
          const entries = keys.length > 0 ? await AsyncStorage.multiGet(keys) : [];
          const loaded: Record<string, string> = {};
          for (const [key, value] of entries) {
            if (key) loaded[key] = value ?? '';
          }
          // Also merge in-memory store in case there are unsaved keys
          setStore(s => ({ ...loaded, ...memoryStore }));
        } catch {
          setStore(s => ({ ...memoryStore }));
        }
      } else {
        setStore(s => ({ ...memoryStore }));
      }
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
