import React, { createContext, useCallback, useContext, useRef } from 'react';

// Types for our recordings data structure
export interface RecordingSession {
  id: string;
  samples: number[];
  startTime: number;
  endTime?: number;
  uri?: string;
  duration: number;
  isComplete: boolean;
}

export interface RecordingsState {
  currentRecording: {
    sessions: RecordingSession[];
    activeSessionId: string | null;
    isRecording: boolean;
  };
  allRecordings: RecordingSession[];
}

export interface RecordingsActions {
  startNewRecordingSession: () => string;
  updateCurrentSessionSamples: (samples: number[]) => void;
  endCurrentRecordingSession: (uri?: string) => void;
  clearCurrentRecording: () => void;
  getCurrentRecordingSamples: () => number[];
  getCurrentRecordingWithDividers: () => number[];
  isCurrentlyRecording: () => boolean;
  getAllRecordings: () => RecordingSession[];
}

// Create contexts
const RecordingsStateContext = createContext<RecordingsState | null>(null);
const RecordingsActionsContext = createContext<RecordingsActions | null>(null);

// Provider component
interface RecordingsProviderProps {
  children: React.ReactNode;
}

export function RecordingsProvider({ children }: RecordingsProviderProps) {
  const [state, setState] = React.useState<RecordingsState>({
    currentRecording: {
      sessions: [],
      activeSessionId: null,
      isRecording: false,
    },
    allRecordings: [],
  });

  // Ref to track the current samples being accumulated during recording
  const currentSessionSamplesRef = useRef<number[]>([]);
  // Synchronous ref for the active session id to avoid race conditions
  const activeSessionIdRef = useRef<string | null>(null);

  const startNewRecordingSession = useCallback((): string => {
    // If there's already an active session, return it (idempotent)
    if (activeSessionIdRef.current) return activeSessionIdRef.current;

    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();

    const newSession: RecordingSession = {
      id: sessionId,
      samples: [],
      startTime,
      duration: 0,
      isComplete: false,
    };

    // Update the sync ref first
    activeSessionIdRef.current = sessionId;

    setState(prevState => ({
      ...prevState,
      currentRecording: {
        ...prevState.currentRecording,
        sessions: [...prevState.currentRecording.sessions, newSession],
        activeSessionId: sessionId,
        isRecording: true,
      },
    }));

    // Reset the current samples buffer
    currentSessionSamplesRef.current = [];

    return sessionId;
  }, []);

  const updateCurrentSessionSamples = useCallback((samples: number[]) => {
    const activeId = activeSessionIdRef.current;
    if (!activeId) return;

    // Store the current samples in our ref for immediate access
    currentSessionSamplesRef.current = [...samples];

    setState(prevState => {
      const sessions = prevState.currentRecording.sessions.map(session => {
        if (session.id === activeId) {
          return {
            ...session,
            samples: [...samples],
            duration: Date.now() - session.startTime,
          };
        }
        return session;
      });

      return {
        ...prevState,
        currentRecording: {
          ...prevState.currentRecording,
          sessions,
        },
      };
    });
  }, []);

  const endCurrentRecordingSession = useCallback((uri?: string) => {
    const activeId = activeSessionIdRef.current;
    if (!activeId) return;

    const endTime = Date.now();

    setState(prevState => {
      const sessions = prevState.currentRecording.sessions.map(session => {
        if (session.id === activeId) {
          const completedSession: RecordingSession = {
            ...session,
            endTime,
            uri,
            duration: endTime - session.startTime,
            isComplete: true,
          };
          return completedSession;
        }
        return session;
      });

      // Find the completed session
      const completedSession = sessions.find(s => s.id === activeId && s.isComplete);

      return {
        ...prevState,
        currentRecording: {
          ...prevState.currentRecording,
          sessions,
          activeSessionId: null,
          isRecording: false,
        },
        allRecordings: completedSession
          ? [...prevState.allRecordings, completedSession]
          : prevState.allRecordings,
      };
    });

    // Clear the current samples ref and the sync ref
    currentSessionSamplesRef.current = [];
    activeSessionIdRef.current = null;
  }, []);

  const clearCurrentRecording = useCallback(() => {
    setState(prevState => ({
      ...prevState,
      currentRecording: {
        sessions: [],
        activeSessionId: null,
        isRecording: false,
      },
    }));
    currentSessionSamplesRef.current = [];
  }, []);

  const getCurrentRecordingSamples = useCallback((): number[] => {
    // If currently recording, return the live samples from ref
    if (activeSessionIdRef.current && currentSessionSamplesRef.current.length > 0) {
      return currentSessionSamplesRef.current;
    }

    // Otherwise, return samples from all completed sessions
    const allSamples: number[] = [];
    state.currentRecording.sessions.forEach(session => {
      if (session.samples.length > 0) {
        allSamples.push(...session.samples);
      }
    });
    
    return allSamples;
  }, [state.currentRecording.sessions, state.currentRecording.isRecording]);

  const getCurrentRecordingWithDividers = useCallback((): number[] => {
    if (state.currentRecording.sessions.length === 0) {
      return [];
    }

    const allSamples: number[] = [];
    const dividerSamples = Array(50).fill(0); // 50 zero samples as divider

    state.currentRecording.sessions.forEach((session, index) => {
      if (session.samples.length > 0) {
        // Add divider before each session except the first
        if (index > 0) {
          allSamples.push(...dividerSamples);
        }
        allSamples.push(...session.samples);
      }
    });

    // If currently recording, add live samples from the active session
    if (state.currentRecording.isRecording && currentSessionSamplesRef.current.length > 0) {
      // Add divider if we have previous sessions
      if (state.currentRecording.sessions.length > 1) {
        allSamples.push(...dividerSamples);
      }
      allSamples.push(...currentSessionSamplesRef.current);
    }

    return allSamples;
  }, [state.currentRecording.sessions, state.currentRecording.isRecording]);

  const isCurrentlyRecording = useCallback((): boolean => {
    return state.currentRecording.isRecording;
  }, [state.currentRecording.isRecording]);

  const actions: RecordingsActions = {
    startNewRecordingSession,
    updateCurrentSessionSamples,
    endCurrentRecordingSession,
    clearCurrentRecording,
    getCurrentRecordingSamples,
    getCurrentRecordingWithDividers,
    isCurrentlyRecording,
    getAllRecordings: () => {
      return state.allRecordings;
    },
  };

  return (
    <RecordingsStateContext.Provider value={state}>
      <RecordingsActionsContext.Provider value={actions}>
        {children}
      </RecordingsActionsContext.Provider>
    </RecordingsStateContext.Provider>
  );
}

// Hooks for accessing the context
export function useRecordingsState(): RecordingsState {
  const context = useContext(RecordingsStateContext);
  if (!context) {
    throw new Error('useRecordingsState must be used within a RecordingsProvider');
  }
  return context;
}

export function useRecordingsActions(): RecordingsActions {
  const context = useContext(RecordingsActionsContext);
  if (!context) {
    throw new Error('useRecordingsActions must be used within a RecordingsProvider');
  }
  return context;
}

// Combined hook for convenience
export function useRecordings(): { state: RecordingsState; actions: RecordingsActions } {
  return {
    state: useRecordingsState(),
    actions: useRecordingsActions(),
  };
}