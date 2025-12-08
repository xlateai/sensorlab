import React, { useState, useRef, useEffect } from 'react';
import { View, TextInput, StyleSheet } from 'react-native';

export default function NumericalPrediction() {
  const [inputValue, setInputValue] = useState('');
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTextChange = (text: string) => {
    // Only allow single digit 0-9
    const lastChar = text.slice(-1);
    if (lastChar.match(/[0-9]/)) {
      setInputValue(lastChar);
      
      // Clear any existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      
      // Clear input after 1 second
      timeoutRef.current = setTimeout(() => {
        setInputValue('');
      }, 1000);
    } else if (text === '') {
      setInputValue('');
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    }
  };

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          value={inputValue}
          onChangeText={handleTextChange}
          keyboardType="number-pad"
          maxLength={1}
          placeholder="Enter a number (0-9)"
          placeholderTextColor="#666"
          autoFocus={false}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputContainer: {
    width: '100%',
    maxWidth: 300,
  },
  input: {
    backgroundColor: '#111',
    borderWidth: 2,
    borderColor: '#39ff14',
    borderRadius: 12,
    padding: 16,
    fontSize: 24,
    color: '#fff',
    textAlign: 'center',
    fontWeight: '600',
  },
});

