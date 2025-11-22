import { SafeAreaView } from 'react-native-safe-area-context';
import TypeRacerScreen from '../subapps/renshu/typeracer';

export default function RenshuScreen() {
  return (
    <SafeAreaView style={{ flex: 1 }} edges={['top']}>
      <TypeRacerScreen></TypeRacerScreen>
    </SafeAreaView>
  );
}
