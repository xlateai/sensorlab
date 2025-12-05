import React, { useState } from 'react';
import { View, Text, Pressable, TextInput, ScrollView, Dimensions } from 'react-native';
import SensorlibModule from 'sensorlib';

const screenHeight = Dimensions.get('window').height;

export default function RustCoreShowcase() {
  const [rustcoreResult, setRustcoreResult] = useState<string>('');
  const [mlTrainingOutput, setMlTrainingOutput] = useState<string>('');
  const [isTraining, setIsTraining] = useState<boolean>(false);

  return (
    <View style={{ gap: 16 }}>
      {/* Hello World Section */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable
          onPress={() => {
            try {
              const result = SensorlibModule.rustcoreHello();
              setRustcoreResult(result);
            } catch (error) {
              setRustcoreResult(`Error: ${error}`);
            }
          }}
          style={{
            backgroundColor: '#39ff14',
            paddingHorizontal: 24,
            paddingVertical: 12,
            borderRadius: 8,
            minWidth: 120,
          }}
        >
          <Text style={{ color: '#000', fontWeight: '600', fontSize: 16, textAlign: 'center' }}>
            Call Rust
          </Text>
        </Pressable>
        <TextInput
          value={rustcoreResult}
          editable={false}
          placeholder="Rust function result will appear here..."
          placeholderTextColor="#666"
          style={{
            flex: 1,
            backgroundColor: '#222',
            color: '#fff',
            padding: 12,
            borderRadius: 8,
            fontSize: 14,
            borderWidth: 2,
            borderColor: '#39ff14',
            minHeight: 50,
            textAlignVertical: 'top',
          }}
          multiline
        />
      </View>

      {/* ML Training Section */}
      <View style={{ gap: 8 }}>
        <Pressable
          onPress={() => {
            if (isTraining) return;
            setIsTraining(true);
            setMlTrainingOutput('Starting ML training...\n');
            
            // Run training in a timeout to allow UI to update
            setTimeout(() => {
              try {
                const output = SensorlibModule.rustcoreMLTraining();
                setMlTrainingOutput(output);
              } catch (error) {
                setMlTrainingOutput(`Error: ${error}`);
              } finally {
                setIsTraining(false);
              }
            }, 100);
          }}
          disabled={isTraining}
          style={{
            backgroundColor: isTraining ? '#666' : '#39ff14',
            paddingHorizontal: 24,
            paddingVertical: 12,
            borderRadius: 8,
            alignSelf: 'flex-start',
            opacity: isTraining ? 0.6 : 1,
          }}
        >
          <Text style={{ color: '#000', fontWeight: '600', fontSize: 16, textAlign: 'center' }}>
            {isTraining ? 'Training...' : 'Test ML Training'}
          </Text>
        </Pressable>
        <View
          style={{
            backgroundColor: '#111',
            borderWidth: 2,
            borderColor: '#39ff14',
            borderRadius: 8,
            height: screenHeight * 0.4,
            maxHeight: 400,
          }}
        >
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 12 }}
            showsVerticalScrollIndicator={true}
          >
            <TextInput
              value={mlTrainingOutput || 'ML training output will appear here...'}
              editable={false}
              placeholder="ML training output will appear here..."
              placeholderTextColor="#666"
              style={{
                flex: 1,
                backgroundColor: 'transparent',
                color: '#fff',
                fontSize: 12,
                fontFamily: 'monospace',
                textAlignVertical: 'top',
              }}
              multiline
            />
          </ScrollView>
        </View>
      </View>
    </View>
  );
}
