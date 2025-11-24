import React, { useState, useRef } from 'react';
import { View, Text, TextInput, StyleSheet, Pressable, Keyboard } from 'react-native';

export default function Notes() {
  const [text, setText] = useState('');
  const inputRef = useRef<TextInput>(null);

  const handleContainerPress = () => {
    Keyboard.dismiss();
    if (inputRef.current) {
      inputRef.current.blur();
    }
  };

  return (
    <Pressable style={styles.container} onPress={handleContainerPress}>
      <TextInput
        ref={inputRef}
        style={styles.textInput}
        value={text}
        onChangeText={setText}
        placeholder="Type your note here..."
        placeholderTextColor="#666"
        multiline
        textAlignVertical="top"
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 24,
  },
  textInput: {
    flex: 1,
    backgroundColor: '#111',
    borderRadius: 12,
    padding: 16,
    color: '#fff',
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#333',
  },
});
