import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { useStabilizedMagnetometer } from '@/app/utils/sensors';

export default function NumericalPrediction() {
  const [inputValue, setInputValue] = useState('');
  const [prediction, setPrediction] = useState<number | null>(null);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [totalGames, setTotalGames] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Get stabilized magnetometer reading
  const { stabilized } = useStabilizedMagnetometer(24, 128);

  const handleTextChange = (text: string) => {
    // Only allow single digit 0-9
    const lastChar = text.slice(-1);
    if (lastChar.match(/[0-9]/)) {
      const actualNumber = parseInt(lastChar, 10);
      
      // Generate random prediction (0-9)
      const randomPrediction = Math.floor(Math.random() * 10);
      setPrediction(randomPrediction);
      
      // Check if prediction is correct
      const correct = randomPrediction === actualNumber;
      setIsCorrect(correct);
      
      // Update stats
      setTotalGames(prev => prev + 1);
      if (correct) {
        setCorrectCount(prev => prev + 1);
      }
      
      setInputValue(lastChar);
      
      // Clear any existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      
      // Clear input after 1 second
      timeoutRef.current = setTimeout(() => {
        setInputValue('');
        setPrediction(null);
        setIsCorrect(null);
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

  const accuracy = totalGames > 0 ? (correctCount / totalGames) * 100 : 0;

  return (
    <View style={styles.container}>
      {/* Stats Bar */}
      <View style={styles.statsBar}>
        <View style={styles.statsRow}>
          <View style={styles.statCell}>
            <Text style={styles.statLabel}>Accuracy</Text>
            <Text style={styles.statValue}>{accuracy.toFixed(1)}%</Text>
          </View>
          <View style={styles.statCell}>
            <Text style={styles.statLabel}>Plays</Text>
            <Text style={styles.statValue}>{totalGames}</Text>
          </View>
          <View style={styles.statCell}>
            <Text style={styles.statLabel}>µT</Text>
            <Text style={styles.statValue}>{stabilized.x.toFixed(1)}</Text>
          </View>
        </View>
      </View>

      {/* Prediction Display */}
      <View style={styles.predictionContainer}>
        <Text style={styles.predictionLabel}>Prediction:</Text>
        <Text style={[
          styles.predictionValue,
          isCorrect !== null && (isCorrect ? styles.predictionCorrect : styles.predictionIncorrect)
        ]}>
          {prediction !== null ? prediction : '-'}
        </Text>
        {isCorrect !== null ? (
          <Text style={[
            styles.predictionResult,
            isCorrect ? styles.predictionCorrect : styles.predictionIncorrect
          ]}>
            {isCorrect ? '✓ Correct' : '✗ Wrong'}
          </Text>
        ) : (
          <Text style={styles.predictionPlaceholder}>Select a Digit</Text>
        )}
      </View>

      {/* Number input */}
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
    gap: 24,
  },
  statsBar: {
    backgroundColor: '#181818',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#333',
    paddingVertical: 10,
    paddingHorizontal: 18,
    minWidth: 270,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    gap: 16,
  },
  statCell: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#b0b0b0',
    marginBottom: 1,
  },
  statValue: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  predictionContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 120,
  },
  predictionLabel: {
    fontSize: 16,
    color: '#888',
    marginBottom: 8,
  },
  predictionValue: {
    fontSize: 72,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#888',
  },
  predictionPlaceholder: {
    fontSize: 18,
    color: '#666',
  },
  predictionCorrect: {
    color: '#39ff14',
  },
  predictionIncorrect: {
    color: '#ff4444',
  },
  predictionResult: {
    fontSize: 18,
    fontWeight: '600',
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

