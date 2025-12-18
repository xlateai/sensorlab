import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import EmbeddedPythonConsole from '@/components/embedded-python-console';
import { ThemedView } from '@/components/themed-view';
import pythonService from '@/services/python-execution';

export default function TerminalScreen() {
  // Handle Python code execution
  const handlePythonExecution = async (pythonCode: string): Promise<string> => {
    try {
      const result = await pythonService.executePython(pythonCode);
      return result;
    } catch (error) {
      return `Error: ${error}`;
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <ThemedView style={styles.container}>        
        {/* Python Console - Full Screen */}
        <EmbeddedPythonConsole onExecute={handlePythonExecution} fullScreen={true} />
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
});