import React, { createContext, useContext, useState } from 'react';

interface BufferSizeContextType {
  bufferSize: number;
  setBufferSize: (size: number) => void;
}

const BufferSizeContext = createContext<BufferSizeContextType>({
  bufferSize: 16,
  setBufferSize: () => {},
});

export function useBufferSize() {
  return useContext(BufferSizeContext);
}

export function BufferSizeProvider({ children }: { children: React.ReactNode }) {
  const [bufferSize, setBufferSize] = useState<number>(16);

  return (
    <BufferSizeContext.Provider value={{ bufferSize, setBufferSize }}>
      {children}
    </BufferSizeContext.Provider>
  );
}
