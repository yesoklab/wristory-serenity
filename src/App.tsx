/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, Modality } from "@google/genai";
import { 
  Sparkles, 
  Play, 
  Pause, 
  RefreshCw, 
  Volume2, 
  MessageSquare,
  ChevronRight,
  Loader2,
  Wind,
  History,
  Settings2,
  Music,
  User,
  X,
  Send
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// Initialize Gemini
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

interface Message {
  role: 'user' | 'model';
  text: string;
}

interface SavedSession {
  id: string;
  date: string;
  theme: string;
  imageUrl: string;
  audioUrl: string;
  script: string;
}

const VOICES = [
  { id: 'Kore', name: 'Soft Female (Kore)' },
  { id: 'Fenrir', name: 'Deep Male (Fenrir)' },
  { id: 'Puck', name: 'Gentle Male (Puck)' },
  { id: 'Zephyr', name: 'Airy Female (Zephyr)' },
];

const BGM_TRACKS = [
  { id: 'none', name: 'No Music', url: '' },
  { id: 'zen', name: 'Zen Garden', url: 'https://assets.mixkit.co/music/preview/mixkit-zen-garden-431.mp3' },
  { id: 'rain', name: 'Soft Rain', url: 'https://assets.mixkit.co/music/preview/mixkit-soft-rain-ambient-loop-2501.mp3' },
  { id: 'space', name: 'Deep Space', url: 'https://assets.mixkit.co/music/preview/mixkit-deep-space-ambient-592.mp3' },
];

export default function App() {
  const [step, setStep] = useState<'intro' | 'chat' | 'generating' | 'session' | 'history'>('intro');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  
  // Session Data
  const [sessionScript, setSessionScript] = useState("");
  const [sessionImage, setSessionImage] = useState<string | null>(null);
  const [sessionAudio, setSessionAudio] = useState<string | null>(null);
  const [imageSize, setImageSize] = useState<"1K" | "2K" | "4K">("1K");
  const [selectedVoice, setSelectedVoice] = useState('Kore');
  const [selectedBgm, setSelectedBgm] = useState('zen');
  const [isPlaying, setIsPlaying] = useState(false);
  
  const [history, setHistory] = useState<SavedSession[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [genStatus, setGenStatus] = useState("");

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const bgmRef = useRef<HTMLAudioElement | null>(null);

  // Load History
  useEffect(() => {
    const saved = localStorage.getItem('wristory_sessions');
    if (saved) setHistory(JSON.parse(saved));
  }, []);

  const saveToHistory = (session: SavedSession) => {
    setHistory(prev => {
      const newHistory = [session, ...prev].slice(0, 10);
      localStorage.setItem('wristory_sessions', JSON.stringify(newHistory));
      return newHistory;
    });
  };

  // 1. Generate Meditation Script
  const generateScript = async () => {
    setStep('generating');
    setGenStatus("Crafting your unique meditation script...");
    try {
      const userContext = messages.map(m => m.text).join(' ');
      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: `Create a 2-minute guided meditation script based on this context: ${userContext}. Focus on digital heritage, mindfulness, and inner peace. Be poetic and soothing. Keep it under 200 words.`,
        config: {
          systemInstruction: "You are a professional meditation guide with a soothing, poetic voice.",
        }
      });
      
      const script = response.text || "";
      setSessionScript(script);
      
      setGenStatus("Visualizing your inner sanctuary...");
      // Parallel: Generate Image and Audio
      const [img, aud] = await Promise.all([
        generateImage(script),
        generateVoice(script)
      ]);
      
      if (img && aud) {
        saveToHistory({
          id: Date.now().toString(),
          date: new Date().toLocaleDateString(),
          theme: script.split('\n')[0].replace(/[#*]/g, '').trim() || "Daily Meditation",
          imageUrl: img,
          audioUrl: aud,
          script
        });
      }
      
      setStep('session');
    } catch (error) {
      console.error("Generation failed:", error);
      setStep('chat');
    }
  };

  // 2. Generate High-Quality Image
  const generateImage = async (prompt: string) => {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-image-preview',
        contents: {
          parts: [{ text: `A hyper-realistic, cinematic, ethereal landscape for meditation, matching this mood: ${prompt.substring(0, 200)}. Minimalist, soft lighting, 8k resolution, digital heritage aesthetic.` }],
        },
        config: {
          imageConfig: {
            aspectRatio: "16:9",
            imageSize: imageSize
          }
        }
      });
      
      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          const url = `data:image/png;base64,${part.inlineData.data}`;
          setSessionImage(url);
          return url;
        }
      }
    } catch (error) {
      console.error("Image generation failed:", error);
    }
    return null;
  };

  // 3. Generate Voice (TTS)
  const generateVoice = async (text: string) => {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: `Read this meditation script very slowly and calmly: ${text}` }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: selectedVoice },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        const url = `data:audio/mp3;base64,${base64Audio}`;
        setSessionAudio(url);
        return url;
      }
    } catch (error) {
      console.error("TTS failed:", error);
    }
    return null;
  };

  const handleSendMessage = async () => {
    if (!input.trim()) return;
    
    const newMessages: Message[] = [...messages, { role: 'user', text: input }];
    setMessages(newMessages);
    setInput("");
    setIsTyping(true);

    try {
      const chat = ai.chats.create({
        model: "gemini-3-flash-preview",
        config: {
          systemInstruction: "You are Wristory Serenity AI, a premium meditation consultant by yesoklab. Help the user define their perfect meditation session (theme, duration, focus). Be poetic and calming. When they are ready, suggest we start the generation.",
        }
      });
      
      const response = await chat.sendMessage({ message: input });
      setMessages([...newMessages, { role: 'model', text: response.text || "" }]);
    } catch (error) {
      console.error("Chat failed:", error);
    } finally {
      setIsTyping(false);
    }
  };

  const togglePlayback = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
        bgmRef.current?.pause();
      } else {
        audioRef.current.play();
        if (selectedBgm !== 'none') bgmRef.current?.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white font-sans selection:bg-emerald-500/30">
      <AnimatePresence mode="wait">
        {/* Intro Step */}
        {step === 'intro' && (
          <motion.main 
            key="intro"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center justify-center min-h-screen p-6 text-center relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-b from-emerald-900/10 to-transparent pointer-events-none" />
            
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="mb-12 relative z-10"
            >
              <div className="w-24 h-24 mx-auto mb-8 rounded-full bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 shadow-[0_0_80px_-12px_rgba(16,185,129,0.3)]">
                <Sparkles className="w-12 h-12 text-emerald-400" />
              </div>
              <h1 className="text-6xl font-light tracking-tighter mb-4 bg-gradient-to-b from-white to-white/40 bg-clip-text text-transparent">
                Wristory Serenity
              </h1>
              <p className="text-emerald-400/60 font-mono text-xs uppercase tracking-[0.3em] mb-12">
                Digital Heritage by yesoklab
              </p>
              
              <div className="flex flex-col gap-4 items-center">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setStep('chat')}
                  className="px-10 py-4 bg-white text-black rounded-full font-medium flex items-center gap-3 hover:bg-emerald-50 transition-all shadow-xl"
                >
                  Begin Journey <ChevronRight className="w-4 h-4" />
                </motion.button>
                
                <button 
                  onClick={() => setStep('history')}
                  className="text-white/40 hover:text-white/80 transition-colors flex items-center gap-2 text-sm mt-4"
                >
                  <History className="w-4 h-4" /> View Past Sessions
                </button>
              </div>
            </motion.div>
          </motion.main>
        )}

        {/* Chat Step */}
        {step === 'chat' && (
          <motion.div 
            key="chat"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="max-w-2xl mx-auto min-h-screen flex flex-col p-6"
          >
            <header className="flex items-center justify-between mb-8 pt-4">
              <button onClick={() => setStep('intro')} className="p-2 hover:bg-white/5 rounded-full transition-colors">
                <ChevronRight className="w-5 h-5 rotate-180" />
              </button>
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-400" />
                <span className="font-medium text-sm tracking-tight">Session Designer</span>
              </div>
              <button 
                onClick={() => setShowSettings(!showSettings)}
                className={`p-2 rounded-full transition-colors ${showSettings ? 'bg-emerald-500/20 text-emerald-400' : 'hover:bg-white/5'}`}
              >
                <Settings2 className="w-5 h-5" />
              </button>
            </header>

            <AnimatePresence>
              {showSettings && (
                <motion.div 
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden mb-6 bg-white/5 border border-white/10 rounded-2xl p-4 space-y-4"
                >
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] uppercase tracking-widest text-white/40 flex items-center gap-2">
                        <User className="w-3 h-3" /> Guide Voice
                      </label>
                      <select 
                        value={selectedVoice} 
                        onChange={(e) => setSelectedVoice(e.target.value)}
                        className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs outline-none focus:border-emerald-500/50"
                      >
                        {VOICES.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] uppercase tracking-widest text-white/40 flex items-center gap-2">
                        <Music className="w-3 h-3" /> Background Music
                      </label>
                      <select 
                        value={selectedBgm} 
                        onChange={(e) => setSelectedBgm(e.target.value)}
                        className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs outline-none focus:border-emerald-500/50"
                      >
                        {BGM_TRACKS.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase tracking-widest text-white/40">Visual Quality</label>
                    <div className="flex gap-2">
                      {['1K', '2K', '4K'].map(size => (
                        <button
                          key={size}
                          onClick={() => setImageSize(size as any)}
                          className={`flex-1 py-2 rounded-lg text-xs border transition-all ${
                            imageSize === size 
                              ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400' 
                              : 'bg-black/40 border-white/10 text-white/40 hover:border-white/20'
                          }`}
                        >
                          {size}
                        </button>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="flex-1 overflow-y-auto space-y-6 mb-6 scrollbar-hide pr-2">
              {messages.length === 0 && (
                <div className="text-center py-20 opacity-20">
                  <MessageSquare className="w-12 h-12 mx-auto mb-4" />
                  <p className="text-sm">Tell me what kind of meditation you need today...</p>
                </div>
              )}
              {messages.map((msg, i) => (
                <motion.div 
                  key={i}
                  initial={{ opacity: 0, x: msg.role === 'user' ? 10 : -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`max-w-[85%] p-4 rounded-2xl ${
                    msg.role === 'user' 
                      ? 'bg-emerald-600 text-white rounded-tr-none' 
                      : 'bg-white/5 border border-white/10 text-white/90 rounded-tl-none'
                  }`}>
                    <p className="text-sm leading-relaxed">{msg.text}</p>
                  </div>
                </motion.div>
              ))}
              {isTyping && (
                <div className="flex justify-start">
                  <div className="bg-white/5 border border-white/10 p-4 rounded-2xl rounded-tl-none">
                    <Loader2 className="w-4 h-4 animate-spin opacity-50" />
                  </div>
                </div>
              )}
            </div>

            <div className="pb-8 space-y-4">
              <div className="relative">
                <input 
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                  placeholder="Focus on my breath and release stress..."
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 outline-none focus:border-emerald-500/50 transition-colors pr-14 text-sm"
                />
                <button 
                  onClick={handleSendMessage}
                  disabled={!input.trim() || isTyping}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-2 bg-emerald-500 rounded-xl disabled:opacity-50 disabled:bg-white/10 transition-all"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
              
              {messages.length >= 2 && (
                <motion.button
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  onClick={generateScript}
                  className="w-full py-4 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-2xl font-medium hover:bg-emerald-500/20 transition-all flex items-center justify-center gap-2"
                >
                  <Sparkles className="w-4 h-4" /> Generate Premium Session
                </motion.button>
              )}
            </div>
          </motion.div>
        )}

        {/* Generating Step */}
        {step === 'generating' && (
          <motion.div 
            key="generating"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center justify-center min-h-screen p-6 text-center"
          >
            <div className="relative mb-12">
              <motion.div 
                animate={{ 
                  scale: [1, 1.2, 1],
                  opacity: [0.3, 0.6, 0.3]
                }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                className="w-48 h-48 rounded-full bg-emerald-500/20 blur-3xl absolute -inset-4"
              />
              <Loader2 className="w-16 h-16 text-emerald-400 animate-spin relative z-10" />
            </div>
            <h2 className="text-2xl font-light mb-2 tracking-tight">Creating Your Sanctuary</h2>
            <p className="text-white/40 font-mono text-xs uppercase tracking-widest animate-pulse">
              {genStatus}
            </p>
          </motion.div>
        )}

        {/* Session Step */}
        {step === 'session' && (
          <motion.div 
            key="session"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden"
          >
            {/* Background Image */}
            <motion.img 
              initial={{ scale: 1.1 }}
              animate={{ scale: 1 }}
              transition={{ duration: 20, repeat: Infinity, repeatType: 'reverse' }}
              src={sessionImage || ""} 
              className="absolute inset-0 w-full h-full object-cover opacity-60"
              referrerPolicy="no-referrer"
            />
            <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />
            <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-black/40" />

            {/* Breathing Guide */}
            <div className="relative z-10 mb-20">
              <motion.div 
                animate={{ 
                  scale: isPlaying ? [1, 1.8, 1] : 1,
                  opacity: isPlaying ? [0.2, 0.5, 0.2] : 0.2
                }}
                transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
                className="w-40 h-40 rounded-full border-2 border-emerald-400/50 flex items-center justify-center"
              >
                <div className="w-4 h-4 rounded-full bg-emerald-400 shadow-[0_0_20px_rgba(52,211,153,0.8)]" />
              </motion.div>
              <div className="absolute -bottom-12 left-1/2 -translate-x-1/2 text-center w-full">
                <p className="text-[10px] uppercase tracking-[0.4em] text-emerald-400/80 font-mono">
                  {isPlaying ? 'Follow the Breath' : 'Ready to Begin'}
                </p>
              </div>
            </div>

            {/* Content */}
            <div className="relative z-10 text-center max-w-xl px-6">
              <h3 className="text-3xl font-light mb-12 leading-relaxed italic text-white/90">
                "{sessionScript.substring(0, 150)}..."
              </h3>
              
              <div className="flex items-center justify-center gap-8 mb-12">
                <button 
                  onClick={togglePlayback}
                  className="w-20 h-20 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 transition-transform shadow-2xl"
                >
                  {isPlaying ? <Pause className="w-8 h-8 fill-current" /> : <Play className="w-8 h-8 fill-current ml-1" />}
                </button>
              </div>

              <div className="flex flex-wrap justify-center gap-4">
                <button 
                  onClick={() => {
                    setIsPlaying(false);
                    setStep('chat');
                  }}
                  className="px-6 py-2 bg-white/10 hover:bg-white/20 rounded-full text-xs transition-colors flex items-center gap-2"
                >
                  <RefreshCw className="w-3 h-3" /> New Session
                </button>
                <button 
                  onClick={() => setStep('intro')}
                  className="px-6 py-2 bg-white/10 hover:bg-white/20 rounded-full text-xs transition-colors"
                >
                  Exit Sanctuary
                </button>
              </div>
            </div>

            {/* Audio Elements */}
            <audio 
              ref={audioRef} 
              src={sessionAudio || ""} 
              onEnded={() => setIsPlaying(false)}
            />
            {selectedBgm !== 'none' && (
              <audio 
                ref={bgmRef} 
                src={BGM_TRACKS.find(t => t.id === selectedBgm)?.url} 
                loop 
              />
            )}
          </motion.div>
        )}

        {/* History Step */}
        {step === 'history' && (
          <motion.div 
            key="history"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="max-w-4xl mx-auto min-h-screen p-6"
          >
            <header className="flex items-center justify-between mb-12 pt-4">
              <h2 className="text-2xl font-light tracking-tight flex items-center gap-3">
                <History className="w-6 h-6 text-emerald-400" /> Session History
              </h2>
              <button 
                onClick={() => setStep('intro')}
                className="p-2 hover:bg-white/5 rounded-full"
              >
                <X className="w-6 h-6" />
              </button>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {history.length === 0 ? (
                <div className="col-span-full text-center py-20 opacity-20">
                  <p>No saved sessions yet.</p>
                </div>
              ) : (
                history.map((session) => (
                  <motion.div 
                    key={session.id}
                    whileHover={{ y: -4 }}
                    className="bg-white/5 border border-white/10 rounded-3xl overflow-hidden group cursor-pointer"
                    onClick={() => {
                      setSessionScript(session.script);
                      setSessionImage(session.imageUrl);
                      setSessionAudio(session.audioUrl);
                      setStep('session');
                    }}
                  >
                    <div className="aspect-video relative">
                      <img src={session.imageUrl} className="w-full h-full object-cover opacity-60 group-hover:opacity-80 transition-opacity" referrerPolicy="no-referrer" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
                      <div className="absolute bottom-4 left-4">
                        <p className="text-[10px] text-emerald-400 font-mono uppercase tracking-widest mb-1">{session.date}</p>
                        <h3 className="font-medium">{session.theme}</h3>
                      </div>
                      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <Play className="w-5 h-5 fill-white" />
                      </div>
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
