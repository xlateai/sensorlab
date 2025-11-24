import React, { createContext, useContext, useState } from 'react';

interface RGBRange {
  rMin: number;
  rMax: number;
  gMin: number;
  gMax: number;
  bMin: number;
  bMax: number;
}

interface RGBRangeContextType {
  range: RGBRange;
  setRange: (range: RGBRange) => void;
}

const RGBRangeContext = createContext<RGBRangeContextType>({
  range: { rMin: 0.25, rMax: 1, gMin: 0.25, gMax: 1, bMin: 0.25, bMax: 1 },
  setRange: () => {},
});

export function useRGBRange() {
  return useContext(RGBRangeContext);
}

export function RGBRangeProvider({ children }: { children: React.ReactNode }) {
  const [range, setRange] = useState<RGBRange>({
    rMin: 0.25,
    rMax: 1,
    gMin: 0.25,
    gMax: 1,
    bMin: 0.25,
    bMax: 1,
  });

  return (
    <RGBRangeContext.Provider value={{ range, setRange }}>
      {children}
    </RGBRangeContext.Provider>
  );
}
