import { StatusBar } from 'expo-status-bar';
import React, { useState, useRef, useEffect } from 'react';
import {
  StyleSheet, Text, View, TouchableOpacity, TextInput,
  PanResponder, Dimensions, ActivityIndicator, Alert, Platform,
  Keyboard, Animated, SafeAreaView
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import {
  startSpeechToText, stopSpeechToText, useSpeechRecognitionEvent,
  requestPermissionsAsync, getState
} from 'expo-speech-recognition';

const SCREEN = Dimensions.get('window');
const DEEPSEEK_KEY = 'sk-6fb9ffc6ebd747a0a14b5992adc5944e';

export default function App() {
  // 懸浮球
  const [ballPos, setBallPos] = useState({ x: SCREEN.width - 70, y: SCREEN.height / 2 });
  const ballRef = useRef(null);

  // 語音
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [partialText, setPartialText] = useState('');

  // 潤稿
  const [polished, setPolished] = useState('');
  const [polishing, setPolishing] = useState(false);

  // 頁面狀態: 'main' | 'speech' | 'result'
  const [page, setPage] = useState('main');

  // 權限
  const [hasPermission, setHasPermission] = useState(null);

  useEffect(() => {
    (async () => {
      const { granted } = await requestPermissionsAsync();
      setHasPermission(granted);
    })();
  }, []);

  // 語音事件
  useSpeechRecognitionEvent('result', (e) => {
    setTranscript(e.results[0]?.transcript || '');
    setPartialText(e.results[0]?.transcript || '');
  });

  useSpeechRecognitionEvent('error', (e) => {
    console.log('Speech error:', e.error, e.message);
    setListening(false);
  });

  useSpeechRecognitionEvent('end', () => {
    setListening(false);
  });

  // 懸浮球拖曳
  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => {},
    onPanResponderMove: (_, gesture) => {
      const newX = Math.max(0, Math.min(SCREEN.width - 60, ballPos.x + gesture.dx));
      const newY = Math.max(40, Math.min(SCREEN.height - 60, ballPos.y + gesture.dy));
      ballRef.current?.setNativeProps({ style: { transform: [{ translateX: gesture.dx }, { translateY: gesture.dy }] } });
    },
    onPanResponderRelease: (_, gesture) => {
      setBallPos(prev => ({
        x: Math.max(0, Math.min(SCREEN.width - 60, prev.x + gesture.dx)),
        y: Math.max(40, Math.min(SCREEN.height - 60, prev.y + gesture.dy)),
      }));
    }
  })).current;

  // 開始語音
  const startListening = async () => {
    try {
      setTranscript('');
      setPartialText('');
      setPolished('');
      setPage('speech');
      const { state } = await startSpeechToText({ lang: 'cmn-Hans-CN', interimResults: true });
      setListening(true);
    } catch (e) {
      Alert.alert('錯誤', '無法啟動語音辨識: ' + e.message);
    }
  };

  // 停止語音 → 潤稿
  const stopAndPolish = async () => {
    try {
      await stopSpeechToText();
    } catch (e) {}
    setListening(false);
    const text = transcript || partialText;
    if (!text.trim()) {
      setPage('main');
      return;
    }
    setPolishing(true);
    try {
      const result = await polishText(text);
      setPolished(result);
    } catch (e) {
      setPolished(text);
    }
    setPolishing(false);
    setPage('result');
  };

  // 潤稿 API
  const polishText = async (text) => {
    const resp = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_KEY}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: '你是一個專業的文字潤稿助手。請將使用者的語音辨識結果潤飾為通順、流暢、符合語意的文字。保留原意，修正口語贅詞、錯字、標點。只輸出潤稿後的文字，不要加任何說明。' },
          { role: 'user', content: text },
        ],
        temperature: 0.3,
        max_tokens: 1024,
      }),
    });
    const data = await resp.json();
    return data.choices?.[0]?.message?.content || text;
  };

  // 複製
  const copyToClipboard = async () => {
    await Clipboard.setStringAsync(polished);
    Alert.alert('已複製', '潤稿結果已複製到剪貼簿');
  };

  // 複製後回到主畫面
  const done = () => {
    setPage('main');
    setTranscript('');
    setPartialText('');
    setPolished('');
  };

  // 重試
  const retry = () => {
    setPage('main');
    setTranscript('');
    setPartialText('');
    setPolished('');
  };

  // 主畫面：懸浮球
  if (page === 'main') {
    return (
      <View style={styles.overlay}>
        <StatusBar hidden />
        <Animated.View
          ref={ballRef}
          style={[
            styles.floatingBall,
            { left: ballPos.x, top: ballPos.y }
          ]}
          {...panResponder.panHandlers}
        >
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={startListening}
            style={styles.ballTouch}
          >
            <Text style={styles.ballIcon}>🎤</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    );
  }

  // 語音聆聽頁面
  if (page === 'speech') {
    return (
      <SafeAreaView style={styles.speechContainer}>
        <StatusBar hidden />
        <View style={styles.speechContent}>
          <View style={styles.micCircle}>
            {listening ? (
              <View style={styles.listeningPulse}>
                <Text style={styles.micIcon}>🎤</Text>
              </View>
            ) : (
              <Text style={styles.micIcon}>🎤</Text>
            )}
          </View>
          <Text style={styles.listeningText}>
            {listening ? '聆聽中...' : '處理中...'}
          </Text>
          <View style={styles.transcriptBox}>
            <Text style={styles.transcriptText}>
              {transcript || partialText || '等待語音輸入...'}
            </Text>
          </View>
          <View style={styles.speechButtons}>
            <TouchableOpacity style={styles.cancelBtn} onPress={retry}>
              <Text style={styles.cancelBtnText}>取消</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.doneBtn, (!transcript && !partialText) && styles.disabledBtn]}
              onPress={stopAndPolish}
              disabled={!transcript && !partialText}
            >
              <Text style={styles.doneBtnText}>✓ 完成</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // 潤稿結果頁面
  if (page === 'result') {
    return (
      <SafeAreaView style={styles.resultContainer}>
        <StatusBar hidden />
        <View style={styles.resultContent}>
          <Text style={styles.resultTitle}>✨ 潤稿結果</Text>
          {polishing ? (
            <View style={styles.polishingBox}>
              <ActivityIndicator size="large" color="#6c5ce7" />
              <Text style={styles.polishingText}>AI 潤飾中...</Text>
            </View>
          ) : (
            <>
              <View style={styles.originalBox}>
                <Text style={styles.originalLabel}>原始語音</Text>
                <Text style={styles.originalText}>{transcript || partialText}</Text>
              </View>
              <View style={styles.polishedBox}>
                <Text style={styles.polishedLabel}>潤稿結果</Text>
                <Text style={styles.polishedText}>{polished}</Text>
              </View>
              <View style={styles.resultButtons}>
                <TouchableOpacity style={styles.copyBtn} onPress={copyToClipboard}>
                  <Text style={styles.copyBtnText}>📋 複製</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.retryBtn} onPress={retry}>
                  <Text style={styles.retryBtnText}>🔄 重錄</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.closeBtn} onPress={done}>
                  <Text style={styles.closeBtnText}>✓ 完成</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </SafeAreaView>
    );
  }

  return null;
}

// 禁止用戶退出的權限檢查
const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  floatingBall: {
    position: 'absolute',
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(108,92,231,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 10,
    shadowColor: '#6c5ce7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    zIndex: 9999,
  },
  ballTouch: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ballIcon: {
    fontSize: 28,
  },
  speechContainer: {
    flex: 1,
    backgroundColor: '#0a0a1a',
  },
  speechContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
  },
  micCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(108,92,231,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  listeningPulse: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(108,92,231,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  micIcon: {
    fontSize: 48,
  },
  listeningText: {
    color: '#6c5ce7',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 30,
  },
  transcriptBox: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    padding: 20,
    minHeight: 100,
    marginBottom: 30,
  },
  transcriptText: {
    color: '#e8e8ed',
    fontSize: 18,
    lineHeight: 28,
  },
  speechButtons: {
    flexDirection: 'row',
    gap: 16,
  },
  cancelBtn: {
    paddingVertical: 14,
    paddingHorizontal: 30,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  cancelBtnText: {
    color: '#888',
    fontSize: 16,
    fontWeight: '600',
  },
  doneBtn: {
    paddingVertical: 14,
    paddingHorizontal: 30,
    borderRadius: 12,
    backgroundColor: '#6c5ce7',
  },
  disabledBtn: {
    opacity: 0.4,
  },
  doneBtnText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '700',
  },
  resultContainer: {
    flex: 1,
    backgroundColor: '#0a0a1a',
  },
  resultContent: {
    flex: 1,
    padding: 20,
    paddingTop: 40,
  },
  resultTitle: {
    color: '#e8e8ed',
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 20,
    textAlign: 'center',
  },
  polishingBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  polishingText: {
    color: '#6c5ce7',
    fontSize: 16,
    marginTop: 16,
  },
  originalBox: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  originalLabel: {
    color: '#888',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
  },
  originalText: {
    color: '#aaa',
    fontSize: 15,
    lineHeight: 22,
  },
  polishedBox: {
    backgroundColor: 'rgba(108,92,231,0.1)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(108,92,231,0.3)',
    padding: 16,
    marginBottom: 24,
    flex: 1,
  },
  polishedLabel: {
    color: '#6c5ce7',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
  },
  polishedText: {
    color: '#e8e8ed',
    fontSize: 17,
    lineHeight: 26,
  },
  resultButtons: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
  },
  copyBtn: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    backgroundColor: '#6c5ce7',
  },
  copyBtnText: {
    color: 'white',
    fontSize: 15,
    fontWeight: '700',
  },
  retryBtn: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  retryBtnText: {
    color: '#e8e8ed',
    fontSize: 15,
    fontWeight: '600',
  },
  closeBtn: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(52,211,153,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(52,211,153,0.4)',
  },
  closeBtnText: {
    color: '#34d399',
    fontSize: 15,
    fontWeight: '700',
  },
});
