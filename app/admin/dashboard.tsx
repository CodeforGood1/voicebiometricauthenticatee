import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, Alert } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../../lib/supabase';

interface LogEntry {
  id: string;
  member_name: string;
  status: 'granted' | 'denied';
  confidence: number;
  timestamp: string;
}

interface Member {
  id: string;
  name: string;
  employee_id: string;
}

export default function Dashboard() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [tab, setTab] = useState<'logs' | 'members'>('logs');

  useEffect(() => {
    fetchLogs();
    fetchMembers();

    const channel = supabase
      .channel('access_logs')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'access_logs' },
        payload => {
          setLogs(prev => [payload.new as LogEntry, ...prev]);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  async function fetchLogs() {
    const { data } = await supabase
      .from('access_logs')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(50);
    if (data) setLogs(data);
  }

  async function fetchMembers() {
    const { data } = await supabase
      .from('members')
      .select('*')
      .eq('active', true);
    if (data) setMembers(data);
  }

  async function removeMember(id: string, name: string) {
    Alert.alert('Remove member?', `This will revoke ${name}'s access.`, [
      { text: 'Cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await supabase
            .from('members')
            .update({ active: false })
            .eq('id', id);
          fetchMembers();
        },
      },
    ]);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Admin Dashboard</Text>

      <View style={styles.tabs}>
        {(['logs', 'members'] as const).map(t => (
          <Pressable
            key={t}
            onPress={() => setTab(t)}
            style={[styles.tab, tab === t && styles.activeTab]}
          >
            <Text style={[styles.tabText, tab === t && styles.activeTabText]}>
              {t === 'logs' ? 'Access Logs' : 'Members'}
            </Text>
          </Pressable>
        ))}
      </View>

      {tab === 'logs' && (
        <FlatList
          data={logs}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <View style={styles.logRow}>
              <View style={[
                styles.dot,
                { backgroundColor: item.status === 'granted' ? '#1D9E75' : '#E24B4A' }
              ]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.logName}>{item.member_name}</Text>
                <Text style={styles.logMeta}>
                  {item.status.toUpperCase()} · {(item.confidence * 100).toFixed(1)}% confidence
                </Text>
                <Text style={styles.logTime}>
                  {new Date(item.timestamp).toLocaleString()}
                </Text>
              </View>
            </View>
          )}
        />
      )}

      {tab === 'members' && (
        <>
          <Pressable
            style={styles.addBtn}
            onPress={() => router.push('/admin/register')}
          >
            <Text style={styles.addBtnText}>+ Enroll New Member</Text>
          </Pressable>
          <FlatList
            data={members}
            keyExtractor={item => item.id}
            renderItem={({ item }) => (
              <View style={styles.memberRow}>
                <View>
                  <Text style={styles.logName}>{item.name}</Text>
                  <Text style={styles.logMeta}>ID: {item.employee_id}</Text>
                </View>
                <Pressable onPress={() => removeMember(item.id, item.name)}>
                  <Text style={styles.removeText}>Remove</Text>
                </Pressable>
              </View>
            )}
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f0f', padding: 16 },
  title: {
    fontSize: 22,
    color: '#fff',
    fontWeight: '700',
    marginTop: 48,
    marginBottom: 16,
  },
  tabs: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#1c1c1e',
    alignItems: 'center',
  },
  activeTab: { backgroundColor: '#534AB7' },
  tabText: { color: '#888', fontSize: 14 },
  activeTabText: { color: '#fff', fontWeight: '600' },
  logRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 12,
    backgroundColor: '#1c1c1e',
    borderRadius: 10,
    marginBottom: 8,
  },
  dot: { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
  logName: { color: '#fff', fontSize: 15, fontWeight: '600' },
  logMeta: { color: '#888', fontSize: 12, marginTop: 2 },
  logTime: { color: '#555', fontSize: 11, marginTop: 2 },
  memberRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    backgroundColor: '#1c1c1e',
    borderRadius: 10,
    marginBottom: 8,
  },
  removeText: { color: '#E24B4A', fontSize: 14, fontWeight: '600' },
  addBtn: {
    backgroundColor: '#1D9E75',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginBottom: 12,
  },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
