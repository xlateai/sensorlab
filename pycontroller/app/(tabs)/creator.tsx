

import QRCode from 'react-native-qrcode-svg';
import { Dimensions, View, Text } from 'react-native';
import { useEffect, useState } from 'react';
import { NativeModules } from 'react-native';

export default function CreatorScreen() {
  const { width } = Dimensions.get('window');
  const [helloMsg, setHelloMsg] = useState('');

  useEffect(() => {
    if (NativeModules.HelloModule && NativeModules.HelloModule.getHelloWorld) {
      NativeModules.HelloModule.getHelloWorld((msg: string[]) => {
        setHelloMsg(msg[0]);
      });
    }
  }, []);

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' }}>
      <Text
        style={{
          color: '#fff',
          fontSize: 44,
          fontWeight: 'bold',
          marginBottom: 32,
          textAlign: 'center',
          fontFamily: 'Menlo',
        }}
      >
        <Text style={{ color: '#39ff14', fontWeight: 'bold', fontSize: 54, fontFamily: 'Menlo' }}>xlate</Text>
        <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 44, fontFamily: 'Menlo' }}> developer lab</Text>
      </Text>
      <QRCode
        value="https://xlate.ai/qr"
        size={width * 0.5}
        backgroundColor="#fff"
      />
      {helloMsg ? (
        <Text style={{ color: '#39ff14', fontSize: 12, marginTop: 24 }}>{helloMsg}</Text>
      ) : null}
    </View>
  );
}

