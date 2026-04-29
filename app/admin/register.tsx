import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Alert } from 'react-native';
import { supabase } from '../../lib/supabase';
import { getEmbedding } from '../../lib/voiceProcessor'; // ✅ FIXED

export default function RegisterMember() {
  const [name, setName] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [samples, setSamples] = useState<number[][]>([]);
  const [recording, setRecording] = useState(false);

  async function recordSample() {
    if (!name || !employeeId) {
      Alert.alert('Fill in name and employee ID first');
      return;
    }

    setRecording(true);

    const embedding = await getEmbedding(); // ✅ FIXED

    setRecording(false);

    if (!embedding) {
      Alert.alert('Recording failed');
      return;
    }

    setSamples(prev => [...prev, embedding]); // ✅ FIXED

    Alert.alert(`Sample ${samples.length + 1}/5 recorded`);
  }

  async function saveMember() {
    if (samples.length < 5) {
      Alert.alert('Record 5 samples before saving');
      return;
    }

    // 🔍 Check if employee ID already exists
    const { data: existing } = await supabase
      .from('members')
      .select('id')
      .eq('employee_id', employeeId)
      .maybeSingle();

    if (existing) {
      Alert.alert('Error', 'Employee ID already exists. Use a different ID.');
      return;
    }

    // 💾 Save member
    const { error } = await supabase.from('members').insert({
      name,
      employee_id: employeeId,
      embeddings: samples,
      active: true,
      enrolled_at: new Date().toISOString(),
    });

    if (error) {
      Alert.alert('Error', error.message);
    } else {
      Alert.alert('Success', 'Member enrolled successfully');
      setName('');
      setEmployeeId('');
      setSamples([]);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Enroll Member</Text>

      <TextInput
        style={styles.input}
        placeholder="Full name"
        placeholderTextColor="#555"
        value={name}
        onChangeText={setName}
      />

      <TextInput
        style={styles.input}
        placeholder="Employee ID"
        placeholderTextColor="#555"
        value={employeeId}
        onChangeText={setEmployeeId}
      />

      <Text style={styles.sampleCount}>
        Voice samples: {samples.length}/5
      </Text>

      <Pressable
        style={[styles.btn, { backgroundColor: recording ? '#EF9F27' : '#3B8BD4' }]}
        onPress={recordSample}
        disabled={recording || samples.length >= 5}
      >
        <Text style={styles.btnText}>
          {recording ? 'Recording 5s...' : `Record sample ${samples.length + 1}`}
        </Text>
      </Pressable>

      {samples.length >= 5 && (
        <Pressable
          style={[styles.btn, { backgroundColor: '#1D9E75' }]}
          onPress={saveMember}
        >
          <Text style={styles.btnText}>Save Member</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0f0f0f',
    gap: 16,
  },
  title: { fontSize: 22, color: '#fff', fontWeight: '600' },
  input: {
    width: 280,
    height: 48,
    backgroundColor: '#1c1c1e',
    color: '#fff',
    borderRadius: 8,
    paddingHorizontal: 16,
    fontSize: 15,
  },
  sampleCount: { color: '#aaa', fontSize: 14 },
  btn: {
    width: 280,
    height: 48,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});