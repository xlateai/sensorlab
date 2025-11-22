import { Animated as RNAnimated } from 'react-native';
import React, { useState, useRef, useEffect } from 'react';
import { BlurView } from 'expo-blur';
import { Animated } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { RainbowProgressBar } from './rainbow-progress-bar';
import { TypeRacerControlMenu } from './typeracer-control-menu';
import { TypeStatsBar } from './type-stats-bar';
import { Transliterator } from './romaji-transliterator';
import { View, Text, TextInput, StyleSheet, Platform, TouchableOpacity, ScrollView } from 'react-native';
import { FuriganaViewer } from './furigana-viewer';
import textExamplesJSONData from './assets/data/japanese_text_examples.json';
import { InputAccessoryView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { playSimpleHaptic } from '@/app/haptics';


function BlinkingCursor({ style, buffer }: { style?: any, buffer: string }) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const interval = setInterval(() => {
      setVisible(v => !v);
    }, 530);
    return () => clearInterval(interval);
  }, []);

  // Always keep cursor at the right end, even when buffer changes rapidly
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <Text style={style}>{buffer}</Text>
      <RNAnimated.View style={{
        opacity: visible ? 1 : 0,
        marginLeft: 2,
        width: 2,
        height: style?.fontSize || 26,
        backgroundColor: '#e0e0e0',
        borderRadius: 1,
        transitionProperty: 'margin-left',
        transitionDuration: '120ms',
      }} />
    </View>
  );
}

// Load the first example from japanese_text_examples.json
const FIRST_EXAMPLE = Array.isArray(textExamplesJSONData) ? textExamplesJSONData[0] : null;
const JAPANESE_OBJECTS = FIRST_EXAMPLE ? FIRST_EXAMPLE.tokens : [];

// Helper to count total English characters
function getTotalEnglishChars(objs: { english: string }[]) {
  return objs.reduce((acc, obj) => acc + (obj.english?.length || 0), 0);
}

function getSentenceString(objs: { string: string }[]) {
  return objs.map(o => o.string).join('');
}



const TOTAL_ENGLISH_CHARS = getTotalEnglishChars(JAPANESE_OBJECTS);
const JAPANESE_SENTENCE = getSentenceString(JAPANESE_OBJECTS);

export default function TypeRacerScreen() {
  // Navigation history: back/forward stacks
  const [history, setHistory] = useState([0]); // visited indices
  const [historyPos, setHistoryPos] = useState(0); // current position in history
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  // Modal for selecting example
  const [showListModal, setShowListModal] = useState(false);
  // Display metadata from japanese_text_examples.json
  // Shuffle mode state
  const [shuffleMode, setShuffleMode] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [example, setExample] = useState(Array.isArray(textExamplesJSONData) ? textExamplesJSONData[0] : null);
  const [copied, setCopied] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  // Stats
  const [incorrectCount, setIncorrectCount] = useState(0);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [endTime, setEndTime] = useState<number | null>(null);
  const [cps, setCps] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const inputAccessoryViewID = 'bufferAccessoryView';
  const [inputFocused, setInputFocused] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const inputRef = React.useRef<TextInput>(null);
  const [input, setInput] = useState('');
  const [status, setStatus] = useState<'typing' | 'success'>('typing');
  const [showFurigana, setShowFurigana] = useState(true);
  const [transliterator, setTransliterator] = useState(() => new Transliterator(JAPANESE_OBJECTS));
  const [resetKey, setResetKey] = useState(0);
  const [completedString, setCompletedString] = useState('');
  // Always use current example's tokens for display and transliterator
  const currentObjects = example ? example.tokens : [];
  const completedCount = transliterator['completedObjects']?.length ?? 0;
  const [keyboardDisabled, setKeyboardDisabled] = useState(false);
  const [showCompletionSection, setShowCompletionSection] = useState(false);
  // Count correct English character strokes
  // Count all correct strokes: completed objects + current buffer (if it matches upcoming object's english)
  let correctEnglishChars = 0;
  if (transliterator['completedObjects']?.length) {
    correctEnglishChars += transliterator['completedObjects'].reduce((acc, obj) => acc + (obj.english?.length || 0), 0);
  }
  // Only count buffer if it matches the start of the upcoming object's english
  const nextObj = transliterator['upcomingObjects'][0];
  if (nextObj && nextObj.english.startsWith(transliterator['buffer'])) {
    correctEnglishChars += transliterator['buffer'].length;
  }
  const progress = TOTAL_ENGLISH_CHARS > 0 ? correctEnglishChars / TOTAL_ENGLISH_CHARS : 0;
  const [lastIncorrect, setLastIncorrect] = useState('');
  const [showCompletedChunk, setShowCompletedChunk] = useState('');

  // Helper to get objects for current example
  const getObjectsForIndex = (idx: number) => {
    if (!Array.isArray(textExamplesJSONData)) return [];
    const ex = textExamplesJSONData[idx];
    return ex ? ex.tokens : [];
  };

  // Update example and transliterator when currentIndex changes
  useEffect(() => {
    if (Array.isArray(textExamplesJSONData)) {
      const ex = textExamplesJSONData[currentIndex];
      setExample(ex);
      setTransliterator(new Transliterator(getObjectsForIndex(currentIndex)));
    }
    // Reset input and related states
    setInput('');
    setStatus('typing');
    setKeyboardDisabled(false);
    setShowCompletionSection(false);
    setCompletedString('');
    setShowCompletedChunk('');
    setLastIncorrect('');
    setInputFocused(false);
    setResetKey(prev => prev + 1);
    setIncorrectCount(0);
    setStartTime(null);
    setEndTime(null);
    setCps(0);
    setElapsed(0);
    if (inputRef.current) {
      inputRef.current.blur();
    }
  }, [currentIndex]);
  // Live timer for elapsed time and CPS
  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    if (status === 'typing' && startTime !== null) {
      timer = setInterval(() => {
        const now = Date.now();
        const elapsedSec = (now - startTime) / 1000;
        setElapsed(elapsedSec);
        // Estimate CPS as we go
        const charsTyped = input.length;
        setCps(elapsedSec > 0 ? charsTyped / elapsedSec : 0);
      }, 1000);
    } else if (status === 'success' && startTime !== null && endTime !== null) {
      setElapsed((endTime - startTime) / 1000);
      // Final CPS
      setCps((getTotalEnglishChars(getObjectsForIndex(currentIndex))) / ((endTime - startTime) / 1000));
    } else {
      setElapsed(0);
      setCps(0);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [status, startTime, endTime, input, currentIndex]);

  const handleChange = (text: string) => {
    // Start timer on first keystroke
    if (startTime === null && text.length > 0) {
      setStartTime(Date.now());
    }
    let foundIncorrect = false;
    let incorrectPlayed = false;
    let chunkCompletedOnLastChar = false;
    let completedChunk = '';
    let currentIncorrect = '';
    let validInput = '';
    transliterator.reset();
    for (let i = 0; i < text.length; i++) {
      const nextObj = transliterator['upcomingObjects'][0];
      const beforeCompleted = transliterator['completedObjects'].length;
      const currentBuffer = transliterator['buffer'] + text[i];
      if (nextObj && nextObj.english.startsWith(currentBuffer)) {
        transliterator.update(text[i]);
        validInput += text[i];
        currentIncorrect = '';
        const afterCompleted = transliterator['completedObjects'].length;
        if (afterCompleted > beforeCompleted && i === text.length - 1) {
          chunkCompletedOnLastChar = true;
          completedChunk = nextObj.string;
        }
      } else {
        currentIncorrect += text[i];
        if (!foundIncorrect && i === text.length - 1) {
          playSimpleHaptic(0.6, 0.3, 0.1);
          setIncorrectCount(prev => prev + 1);
          incorrectPlayed = true;
          foundIncorrect = true;
        }
      }
    }
    setLastIncorrect(currentIncorrect); // Show only the most recent incorrect sequence
    if (chunkCompletedOnLastChar) {
      playSimpleHaptic(0.6, 0.8, 0.1);
      setShowCompletedChunk(completedChunk);
    } else {
      setShowCompletedChunk('');
    }
    setInput(validInput);
    const result = transliterator.getCompletedString();
    setCompletedString(result);
    if (result === getSentenceString(getObjectsForIndex(currentIndex))) {
      setEndTime(Date.now());
      if (startTime !== null) {
        const duration = (Date.now() - startTime) / 1000;
        setCps(duration > 0 ? (getTotalEnglishChars(getObjectsForIndex(currentIndex)) / duration) : 0);
      }
      setStatus('success');
      setKeyboardDisabled(true);
      setShowCompletionSection(true);
      if (inputRef.current) {
        inputRef.current.blur();
      }
    } else {
      setStatus('typing');
      setShowCompletionSection(false);
    }
    setCompletedString(result);
    if (result === getSentenceString(getObjectsForIndex(currentIndex))) {
      setEndTime(Date.now());
      if (startTime !== null) {
        const duration = (Date.now() - startTime) / 1000;
        setCps(duration > 0 ? (getTotalEnglishChars(getObjectsForIndex(currentIndex)) / duration) : 0);
      }
      setStatus('success');
      setKeyboardDisabled(true);
      setShowCompletionSection(true);
      if (inputRef.current) {
        inputRef.current.blur();
      }
    } else {
      setStatus('typing');
      setShowCompletionSection(false);
    }
  };
    // ...existing code...

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={{flex: 1}}>
        {/* Overlay to close keyboard when clicking outside flash displays */}
        {inputFocused && (
          <TouchableOpacity
            style={styles.overlayTouchable}
            activeOpacity={1}
            onPress={() => {
              if (inputRef.current) inputRef.current.blur();
            }}
          />
        )}
        {/* Modal for selecting example */}
  {showListModal && (
          <View style={{position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 1000, justifyContent: 'center', alignItems: 'center'}}>
            <View style={{maxHeight: '80%', width: 340, backgroundColor: '#181818', borderRadius: 18, padding: 18, borderWidth: 1, borderColor: '#333'}}>
              <Text style={{color: '#39FF14', fontSize: 20, fontWeight: 'bold', marginBottom: 12, textAlign: 'center'}}>Select Example</Text>
              <ScrollView style={{maxHeight: 400}}>
                {Array.isArray(textExamplesJSONData) && textExamplesJSONData.map((ex, idx) => (
                  <TouchableOpacity
                    key={idx}
                    style={{paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#222', backgroundColor: idx === currentIndex ? '#222' : 'transparent', borderRadius: 8}}
                    onPress={() => {
                      setCurrentIndex(idx);
                      setHistory([idx]);
                      setHistoryPos(0);
                      setShowListModal(false);
                    }}
                  >
                    <Text style={{color: idx === currentIndex ? '#39FF14' : '#fff', fontSize: 17}}>
                      {ex.level ? `Level: ${ex.level}` : ''} {ex.casual ? `| ${ex.casual}` : ''}
                    </Text>
                    <Text style={{color: '#b0b0b0', fontSize: 15}} numberOfLines={1}>
                      {Array.isArray(ex.tokens) ? ex.tokens.map(t => t.string).join('') : ''}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <TouchableOpacity
                style={{marginTop: 18, backgroundColor: '#222', borderRadius: 12, padding: 10, alignItems: 'center'}}
                onPress={() => setShowListModal(false)}
              >
                <Text style={{color: '#fff', fontSize: 16}}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

  {showHistoryModal && (
          <View style={{position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 1000, justifyContent: 'center', alignItems: 'center'}}>
            <View style={{maxHeight: '80%', width: 340, backgroundColor: '#181818', borderRadius: 18, padding: 18, borderWidth: 1, borderColor: '#333'}}>
              <Text style={{color: '#39FF14', fontSize: 20, fontWeight: 'bold', marginBottom: 12, textAlign: 'center'}}>History</Text>
              <ScrollView style={{maxHeight: 400}}>
                  {history.map((idx, i) => (
                    <TouchableOpacity
                      key={i}
                      style={{paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#222', backgroundColor: i === historyPos ? '#222' : 'transparent', borderRadius: 8}}
                      onPress={() => {
                        setCurrentIndex(idx);
                        setHistoryPos(i);
                        setShowHistoryModal(false);
                      }}
                    >
                      <Text style={{color: i === historyPos ? '#39FF14' : '#fff', fontSize: 17}}>
                        {textExamplesJSONData[idx]?.level ? `Level: ${textExamplesJSONData[idx].level}` : ''} {textExamplesJSONData[idx]?.casual ? `| ${textExamplesJSONData[idx].casual}` : ''}
                      </Text>
                      <Text style={{color: '#b0b0b0', fontSize: 15}} numberOfLines={1}>
                        {Array.isArray(textExamplesJSONData[idx]?.tokens) ? textExamplesJSONData[idx].tokens.map(t => t.string).join('') : ''}
                      </Text>
                    </TouchableOpacity>
                  ))}
              </ScrollView>
              <TouchableOpacity
                style={{marginTop: 18, backgroundColor: '#222', borderRadius: 12, padding: 10, alignItems: 'center'}}
                onPress={() => setShowHistoryModal(false)}
              >
                <Text style={{color: '#fff', fontSize: 16}}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
  <ScrollView contentContainerStyle={[styles.scrollContainer, {paddingBottom: 192}] /* align scroll bottom with media area top */}>
          {/* Info bar at top of main area */}
          <TypeStatsBar
            level={example?.level}
            casual={example?.casual}
            index={currentIndex + 1}
            total={Array.isArray(textExamplesJSONData) ? textExamplesJSONData.length : 1}
            incorrectCount={incorrectCount}
            timeSpent={elapsed}
            cps={cps}
          />
          {/* Show buttons */}
          <View style={{flexDirection: 'row', width: '100%', alignItems: 'center', justifyContent: 'flex-start', marginBottom: 8, marginTop: 0}}>
            <View style={{flexDirection: 'row', alignItems: 'center', width: '100%', justifyContent: 'space-between'}}>
              <View style={{flexDirection: 'row'}}>
                <TouchableOpacity
                  style={styles.furiganaButton}
                  onPress={() => setShowFurigana(f => !f)}
                >
                  <Text style={styles.furiganaButtonText}>
                    {showFurigana ? 'Hide Furigana' : 'Show Furigana'}
                  </Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                style={{marginRight: 0, marginLeft: 8, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 16, backgroundColor: '#222', alignItems: 'center', justifyContent: 'center', height: 32}}
                onPress={async () => {
                  // Copy the current example's tokens, not the initial ones
                  if (example && Array.isArray(example.tokens)) {
                    await Clipboard.setStringAsync(example.tokens.map(o => o.string).join(''));
                  } else {
                    await Clipboard.setStringAsync('');
                  }
                  setCopied(true);
                  Animated.timing(fadeAnim, {
                    toValue: 1,
                    duration: 300,
                    useNativeDriver: true,
                  }).start();
                  setTimeout(() => {
                    Animated.timing(fadeAnim, {
                      toValue: 0,
                      duration: 300,
                      useNativeDriver: true,
                    }).start(() => setCopied(false));
                  }, 1000);
                }}
                accessibilityLabel={copied ? "Copied!" : "Copy sentence"}
              >
                {copied ? (
                  <Animated.View style={{opacity: fadeAnim}}>
                    <MaterialIcons name="check" size={18} color="#fff" />
                  </Animated.View>
                ) : (
                  <MaterialIcons name="content-copy" size={18} color="#fff" />
                )}
              </TouchableOpacity>
            </View>
          </View>
          {/* Top flash box: only show completion message when completed, and only above the sentence display */}
          {status === 'success' && !showCompletionSection && (
            <View style={styles.flashBoxSmall}>
              <Text style={styles.flashTextSmall}>Well done! 🎉</Text>
            </View>
          )}
          {/* Sentence display below flash box */}
          <FuriganaViewer
            objects={currentObjects}
            completedCount={completedCount}
            showFurigana={showFurigana}
          />
          {/* Completion section below info table, inside scroll area */}
          {showCompletionSection && (
            <View style={{marginTop: 24, width: '100%', alignItems: 'center'}}>
              <Text style={{fontSize: 32, fontWeight: '800', color: '#fff', marginBottom: 18}}>100% Complete!</Text>
              <View style={{marginBottom: 24, alignItems: 'center', width: 320, backgroundColor: '#181818', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#333'}}>
                <View style={{flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginBottom: 8}}>
                  <Text style={{fontSize: 16, color: '#b0b0b0'}}>Incorrect Keystrokes</Text>
                  <Text style={{fontSize: 16, color: '#fff', fontWeight: 'bold'}}>{incorrectCount}</Text>
                </View>
                <View style={{flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginBottom: 8}}>
                  <Text style={{fontSize: 16, color: '#b0b0b0'}}>Time Spent</Text>
                  <Text style={{fontSize: 16, color: '#fff', fontWeight: 'bold'}}>{endTime && startTime ? ((endTime - startTime) / 1000).toFixed(2) : '0.00'}s</Text>
                </View>
                <View style={{flexDirection: 'row', justifyContent: 'space-between', width: '100%'}}>
                  <Text style={{fontSize: 16, color: '#b0b0b0'}}>Characters/sec</Text>
                  <Text style={{fontSize: 16, color: '#fff', fontWeight: 'bold'}}>{cps.toFixed(2)}</Text>
                </View>
              </View>
              <View style={{flexDirection: 'row', justifyContent: 'center'}}>
                <TouchableOpacity
                  style={{backgroundColor: '#222', borderRadius: 24, padding: 14, marginRight: 12, alignItems: 'center', justifyContent: 'center'}}
                  onPress={() => {
                    // Reset everything for replay
                    setInput('');
                    setStatus('typing');
                    setKeyboardDisabled(false);
                    setShowCompletionSection(false);
                    setCompletedString('');
                    setShowCompletedChunk('');
                    setLastIncorrect('');
                    setTransliterator(new Transliterator(JAPANESE_OBJECTS));
                    setInputFocused(false);
                    setResetKey(prev => prev + 1);
                    setIncorrectCount(0);
                    setStartTime(null);
                    setEndTime(null);
                    setCps(0);
                    if (inputRef.current) {
                      inputRef.current.blur();
                    }
                  }}
                >
                  {/* Replay icon using MaterialIcons */}
                  <MaterialIcons name="replay" size={32} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={{backgroundColor: '#222', borderRadius: 24, padding: 14, alignItems: 'center', justifyContent: 'center'}}
                  onPress={() => {
                    // Advance to next example index
                    if (historyPos < history.length - 1) {
                      setHistoryPos(historyPos + 1);
                      setCurrentIndex(history[historyPos + 1]);
                    } else if (Array.isArray(textExamplesJSONData) && textExamplesJSONData.length > 0) {
                      let nextIdx = currentIndex;
                      if (shuffleMode && textExamplesJSONData.length > 1) {
                        while (nextIdx === currentIndex) {
                          nextIdx = Math.floor(Math.random() * textExamplesJSONData.length);
                        }
                      } else {
                        nextIdx = (currentIndex + 1) % textExamplesJSONData.length;
                      }
                      setHistory([...history, nextIdx]);
                      setHistoryPos(history.length);
                      setCurrentIndex(nextIdx);
                    }
                  }}
                >
                  {/* Next icon using MaterialIcons */}
                  <MaterialIcons name="double-arrow" size={32} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>
          )}
          </ScrollView>
      </View>
      {/* Media area fixed at bottom */}
      {/* Media area removed as requested */}
      {/* Media controls at the bottom of the main area, scrolls with content */}
      <TypeRacerControlMenu
        onRetryPress={() => {
          // Reset the current example from the beginning
          setInput('');
          setStatus('typing');
          setKeyboardDisabled(false);
          setShowCompletionSection(false);
          setCompletedString('');
          setShowCompletedChunk('');
          setLastIncorrect('');
          setTransliterator(new Transliterator(getObjectsForIndex(currentIndex)));
          setInputFocused(false);
          setResetKey(prev => prev + 1);
          setIncorrectCount(0);
          setStartTime(null);
          setEndTime(null);
          setCps(0);
          setElapsed(0);
          if (inputRef.current) {
            inputRef.current.blur();
          }
        }}
        onPlayPress={() => {
          // If sentence is complete, go to next sample and focus keyboard
          const isComplete = status === 'success' || completedString === getSentenceString(getObjectsForIndex(currentIndex));
          if (isComplete) {
            let nextIdx = currentIndex;
            if (shuffleMode && Array.isArray(textExamplesJSONData) && textExamplesJSONData.length > 1) {
              while (nextIdx === currentIndex) {
                nextIdx = Math.floor(Math.random() * textExamplesJSONData.length);
              }
            } else {
              nextIdx = (currentIndex + 1) % textExamplesJSONData.length;
            }
            setHistory([...history, nextIdx]);
            setHistoryPos(history.length);
            setCurrentIndex(nextIdx);
            setTimeout(() => {
              if (inputRef.current) {
                inputRef.current.focus();
              }
            }, 300);
          } else {
            if (inputRef.current) {
              inputRef.current.focus();
            }
          }
        }}
        onListPress={() => setShowListModal(true)}
        onPrevPress={() => {
          if (historyPos > 0) {
            setHistoryPos(historyPos - 1);
            setCurrentIndex(history[historyPos - 1]);
          }
        }}
        onShufflePress={() => setShuffleMode(s => !s)}
        onSkipPress={() => {
          if (historyPos < history.length - 1) {
            setHistoryPos(historyPos + 1);
            setCurrentIndex(history[historyPos + 1]);
          } else if (Array.isArray(textExamplesJSONData) && textExamplesJSONData.length > 0) {
            let nextIdx = currentIndex;
            if (shuffleMode && textExamplesJSONData.length > 1) {
              while (nextIdx === currentIndex) {
                nextIdx = Math.floor(Math.random() * textExamplesJSONData.length);
              }
            } else {
              nextIdx = (currentIndex + 1) % textExamplesJSONData.length;
            }
            setHistory([...history, nextIdx]);
            setHistoryPos(history.length);
            setCurrentIndex(nextIdx);
          }
        }}
        shuffleMode={shuffleMode}
        historyPos={historyPos}
        history={history}
        currentIndex={currentIndex}
        textExamplesJSONData={Array.isArray(textExamplesJSONData) ? textExamplesJSONData : []}
      />
        {/* ...existing code... */}
  // Shuffle mode state
  const [shuffleMode, setShuffleMode] = useState(true);
          <TextInput
            key={resetKey}
            ref={inputRef}
            style={{height: 0, opacity: 0, position: 'absolute'}}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType={Platform.OS === 'ios' ? 'default' : 'default'}
            onChangeText={handleChange}
            blurOnSubmit={false}
            autoComplete="off"
            spellCheck={false}
            enablesReturnKeyAutomatically={false}
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)}
            {...(Platform.OS === 'ios' ? {inputAccessoryViewID} : {})}
          />
          {/* Buffer display: desktop always, Android only when typing, iOS uses InputAccessoryView */}
          {/* Buffer display: always visible, liquid glass style, ovular and larger */}
          {Platform.OS === 'android' && inputFocused && (
            <View style={{width: '100%', alignItems: 'center', marginBottom: 8}}>
              <TouchableOpacity
                style={styles.flashBox}
                activeOpacity={0.7}
                onPress={() => {
                  const word = transliterator['buffer'] || '';
                  if (word) Clipboard.setStringAsync(word);
                }}
              >
                <BlinkingCursor style={styles.flashText} buffer={transliterator['buffer']} />
              </TouchableOpacity>
              {/* Progress bar below buffer display for Android */}
              <View style={styles.progressBarContainer}>
                <RainbowProgressBar progress={progress} />
              </View>
            </View>
          )}
          {Platform.OS !== 'ios' && Platform.OS !== 'android' && (
            <View style={{width: '100%', alignItems: 'center', marginBottom: 8}}>
              <TouchableOpacity
                style={styles.flashBox}
                activeOpacity={0.7}
                onPress={() => {
                  const word = transliterator['buffer'] || '';
                  if (word) Clipboard.setStringAsync(word);
                }}
              >
                <BlinkingCursor style={styles.flashText} buffer={transliterator['buffer']} />
              </TouchableOpacity>
              {/* Progress bar below buffer display for desktop/web */}
              <View style={styles.progressBarContainer}>
                <RainbowProgressBar progress={progress} />
              </View>
            </View>
          )}
          {Platform.OS === 'ios' && (
            <InputAccessoryView nativeID={inputAccessoryViewID}>
              <View style={{width: '100%', alignItems: 'center', flexDirection: 'column', justifyContent: 'flex-end', paddingBottom: 0, paddingTop: 0}}>
                {/* Target flash display: shows next obj.string to type */}
                {status !== 'success' && (
                  <TouchableOpacity
                    style={styles.flashBoxReference}
                    activeOpacity={0.7}
                    onPress={() => {
                      if (nextObj && nextObj.string) Clipboard.setStringAsync(nextObj.string);
                    }}
                  >
                    {nextObj ? (
                      <>
                        {/* Furigana display if enabled and available */}
                        {showFurigana && nextObj && nextObj.reading && nextObj.reading !== nextObj.string ? (
                          <Text style={styles.flashTextReferenceFurigana}>{nextObj.reading}</Text>
                        ) : null}
                        <Text style={styles.flashTextReference}>{nextObj.string}</Text>
                      </>
                    ) : null}
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={styles.flashBox}
                  activeOpacity={0.7}
                  onPress={() => {
                    const word = transliterator['buffer'] || '';
                    if (word) Clipboard.setStringAsync(word);
                  }}
                >
                  <BlinkingCursor style={styles.flashText} buffer={transliterator['buffer']} />
                </TouchableOpacity>
                {/* Progress bar hugs bottom of accessory view */}
                <View style={[styles.progressBarContainer, {marginBottom: 0, marginTop: 0, alignSelf: 'center', width: '80%'}]}>
                  <RainbowProgressBar progress={progress} />
                </View>
              </View>
            </InputAccessoryView>
          )}
          {/*
          Debug menu below typing bar
          {showDebug && (
            <View style={{marginTop: 12, padding: 0, width: '100%'}}>
              <View style={{backgroundColor: '#111', borderRadius: 8, padding: 12, borderWidth: 2, borderColor: '#39FF14'}}>
                <Text style={{fontWeight: 'bold', marginBottom: 4, color: '#fff'}}>DEBUG</Text>
                <Text style={{color: '#fff'}}>Completed: {completedString}</Text>
                <Text style={{color: '#fff'}}>Upcoming: {transliterator['upcomingObjects'].map(o => o.english).join(', ')}</Text>
                <Text style={{color: '#fff'}}>Buffer: {transliterator['buffer']}</Text>
              </View>
            </View>
          )}
          */}
          {/* Notification bubble for 'Correct!' will be shown here */}
          {/* Notification bubble for 'Correct!' will be shown here */}
      </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  overlayTouchable: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 999,
  },
  flashBox: {
  minWidth: 120,
  minHeight: 48,
  paddingVertical: 16,
  paddingHorizontal: 32,
    borderRadius: 28,
    backgroundColor: 'rgba(40,40,40,1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    shadowColor: '#fff',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: {width: 0, height: 2},
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginTop: 4,
    flexDirection: 'row',
  },
  flashText: {
    fontSize: 25.8, // 15% smaller than 30.4
    color: '#e0e0e0',
    fontWeight: '600',
    letterSpacing: 2,
  },
  flashTextIncorrect: {
    fontSize: 30.4,
    color: 'rgba(255,0,0,0.8)',
    fontWeight: '600',
    textDecorationLine: 'line-through',
    marginLeft: 8,
  },
  flashBoxReference: {
    minWidth: 100,
    minHeight: 40,
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 28,
    backgroundColor: '#282828',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    shadowColor: '#fff',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: {width: 0, height: 2},
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginTop: 0,
    marginBottom: 6,
    flexDirection: 'column',
  },
  flashTextReference: {
    fontSize: 30.4,
    color: '#e0e0e0',
    fontWeight: '600',
    letterSpacing: 2,
    textAlign: 'center',
  },
  flashTextReferenceFurigana: {
    fontSize: 17.1, // 5% smaller than 18
    color: '#e0e0e0',
    marginBottom: 0,
    textAlign: 'center',
  },
  flashBoxSmall: {
    minWidth: 100,
    minHeight: 40,
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 28,
    backgroundColor: 'rgba(40,40,40,1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    shadowColor: '#fff',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: {width: 0, height: 2},
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginTop: 0,
    marginBottom: 8,
    flexDirection: 'column',
  },
  flashTextSmall: {
    fontSize: 26.6, // 5% smaller than 28
    color: '#fff',
    fontWeight: '700',
    textAlign: 'center',
  },
  progressBarContainer: {
    width: 320,
    maxWidth: '100%',
    alignSelf: 'center',
    marginBottom: 8,
    marginTop: 0,
    backgroundColor: 'transparent',
    zIndex: 10,
  },
  startTypingBox: {
    width: 320,
    maxWidth: '100%',
    alignSelf: 'center',
    marginTop: 24,
    marginBottom: 24,
    borderWidth: 2,
    borderColor: '#39ff1466', // softer neon green
    borderRadius: 20,
    backgroundColor: 'rgba(24,24,24,0.7)', // more transparent
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    paddingHorizontal: 12,
    shadowColor: '#39FF14',
    shadowOpacity: 0.07,
    shadowRadius: 8,
    shadowOffset: {width: 0, height: 1},
  },
  startTypingText: {
    fontSize: 20,
    color: '#39ff1499', // softer neon green
    fontWeight: '600',
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  safeArea: {
    flex: 1,
    backgroundColor: '#000',
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingTop: 24,
    paddingHorizontal: 16,
  },
  topContainer: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 32,
  },
  sentenceContainer: {
    width: '100%',
    paddingLeft: 4,
    paddingRight: 4,
    marginBottom: 8,
  },
  sentenceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    width: '100%',
  },
  wordBlock: {
    flexDirection: 'column',
    alignItems: 'center',
    marginHorizontal: 1,
    marginBottom: 0,
    paddingHorizontal: 0,
    paddingVertical: 0,
    minWidth: 18,
    flexShrink: 0,
  },
  furigana: {
     fontSize: 14,
     color: '#e0e0e0',
     marginBottom: 0,
     textAlign: 'left',
     userSelect: 'none', // Prevent furigana from being highlighted/selected
  },
  japanese: {
    fontSize: 39.6, // 10% increase from 36
    fontWeight: 'bold',
    textAlign: 'left',
    color: '#fff',
  },
  furiganaButton: {
    marginTop: 8,
    paddingVertical: 6,
    paddingHorizontal: 16,
    backgroundColor: '#222',
    borderRadius: 16,
  },
  furiganaButtonText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '500',
  },
  inputContainer: {
    width: '100%',
    alignItems: 'center',
    marginTop: 16,
  },
  input: {
    width: '100%',
    fontSize: 24,
    borderWidth: 1,
    borderColor: '#222',
    borderRadius: 8,
    padding: 12,
    marginBottom: 24,
    backgroundColor: '#111',
    color: '#fff',
  },
  success: {
    fontSize: 24,
    color: '#39FF14',
    fontWeight: 'bold',
    marginTop: 16,
  },
});