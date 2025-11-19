

import QRCode from 'react-native-qrcode-svg';
import { Dimensions, View, Text } from 'react-native';

export default function HomeScreen() {
  const { width } = Dimensions.get('window');
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' }}>
      <Text style={{ color: '#fff', fontSize: 28, fontWeight: 'bold', marginBottom: 32, textAlign: 'center' }}>
        xlate developer lab
      </Text>
      <QRCode
        value="https://xlate.ai/qr"
        size={width * 0.5}
        backgroundColor="#fff"
      />
    </View>
  );
}

