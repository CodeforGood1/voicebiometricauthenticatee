import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Alert } from 'react-native';
import { router } from 'expo-router';
import { verifyPasscode } from '../../lib/auth';

export default function AdminLogin() {
  const [code, setCode] = useState('');

  async function handleLogin() {
    const ok = await verifyPasscode(code);
    if (ok) {
      router.replace('/admin/dashboard');
    } else {
      Alert.alert('Access Denied', 'Incorrect passcode');
      setCode('');
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Admin Access</Text>
      <TextInput
        style={styles.input}
        value={code}
        onChangeText={setCode}
        secureTextEntry
        keyboardType="numeric"
        maxLength={8}
        placeholder="Enter passcode"
        placeholderTextColor="#555"
      />
      <Pressable style={styles.btn} onPress={handleLogin}>
        <Text style={styles.btnText}>Enter</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0f0f0f',
    gap: 20,
  },
  title: { fontSize: 24, color: '#fff', fontWeight: '600' },
  input: {
    width: 220,
    height: 52,
    borderRadius: 10,
    backgroundColor: '#1c1c1e',
    color: '#fff',
    fontSize: 24,
    textAlign: 'center',
    letterSpacing: 8,
  },
  btn: {
    backgroundColor: '#534AB7',
    paddingHorizontal: 40,
    paddingVertical: 14,
    borderRadius: 10,
  },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});