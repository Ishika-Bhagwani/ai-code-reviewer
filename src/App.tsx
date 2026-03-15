import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import Editor from 'react-simple-code-editor';
import Prism from 'prismjs';
import 'prismjs/themes/prism-tomorrow.css';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-java';
import 'prismjs/components/prism-go';
import 'prismjs/components/prism-rust';

import { 
  Beaker, 
  Play, 
  AlertCircle, 
  CheckCircle2, 
  ShieldAlert, 
  Zap, 
  Code2, 
  ChevronRight,
  Loader2,
  Terminal,
  FileCode,
  History,
  LogOut,
  LogIn,
  User as UserIcon,
  Trash2,
  Plus,
  Wand2,
  Search
} from 'lucide-react';
import { analyzeCode } from './services/geminiService';
import { ReviewReport, ReviewIssue } from './types';
import { 
  auth, 
  db, 
  signInWithGoogle, 
  logout, 
  handleFirestoreError, 
  OperationType 
} from './firebase';
import { 
  onAuthStateChanged, 
  User 
} from 'firebase/auth';
import { 
  collection, 
  query, 
  orderBy, 
  onSnapshot, 
  addDoc, 
  serverTimestamp, 
  doc, 
  setDoc,
  deleteDoc
} from 'firebase/firestore';

export default function App() {
  const [code, setCode] = useState<string>('');
  const [language, setLanguage] = useState<string>('typescript');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [report, setReport] = useState<ReviewReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [selectedIssueIdx, setSelectedIssueIdx] = useState<number | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthReady(true);
      
      if (currentUser) {
        const userRef = doc(db, 'users', currentUser.uid);
        setDoc(userRef, {
          uid: currentUser.uid,
          email: currentUser.email,
          displayName: currentUser.displayName,
          photoURL: currentUser.photoURL,
          lastLogin: serverTimestamp()
        }, { merge: true }).catch(err => handleFirestoreError(err, OperationType.WRITE, `users/${currentUser.uid}`));
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) {
      setHistory([]);
      return;
    }

    const q = query(
      collection(db, 'users', user.uid, 'reviews'),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setHistory(items);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, `users/${user.uid}/reviews`);
    });

    return () => unsubscribe();
  }, [user]);

  const handleAnalyze = async () => {
    if (!code.trim()) return;
    
    setIsAnalyzing(true);
    setError(null);
    setSelectedIssueIdx(null);
    try {
      const result = await analyzeCode(code, language);
      setReport(result);

      if (user) {
        await addDoc(collection(db, 'users', user.uid, 'reviews'), {
          uid: user.uid,
          code,
          language,
          report: result,
          createdAt: serverTimestamp()
        });
      }
    } catch (err) {
      console.error(err);
      setError('Failed to analyze code. Please check your connection and try again.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleApplyFix = (issue: ReviewIssue, idx: number) => {
    const lines = code.split('\n');
    // Try to find the original code in the lines around the reported line
    const targetLineIdx = issue.line - 1;
    
    // Simple replacement logic: if the original code matches exactly at that line
    if (lines[targetLineIdx]?.trim() === issue.originalCode.trim()) {
      lines[targetLineIdx] = issue.suggestion;
    } else {
      // Fallback: search for the original code snippet in the whole file
      const fullCode = code;
      const newCode = fullCode.replace(issue.originalCode, issue.suggestion);
      if (newCode !== fullCode) {
        setCode(newCode);
        // Remove the issue from current report view
        if (report) {
          const newIssues = [...report.issues];
          newIssues.splice(idx, 1);
          setReport({ ...report, issues: newIssues, totalIssues: report.totalIssues - 1 });
        }
        return;
      }
      // If still not found, just replace at the line (risky but requested)
      lines[targetLineIdx] = issue.suggestion;
    }

    const newCode = lines.join('\n');
    setCode(newCode);
    
    // Remove the issue from current report view
    if (report) {
      const newIssues = [...report.issues];
      newIssues.splice(idx, 1);
      setReport({ ...report, issues: newIssues, totalIssues: report.totalIssues - 1 });
    }
    setSelectedIssueIdx(null);
  };

  const handleDeleteReview = async (e: any, reviewId: string) => {
    e.stopPropagation();
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'reviews', reviewId));
      if (report && (report as any).id === reviewId) {
        setReport(null);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `users/${user.uid}/reviews/${reviewId}`);
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'High': return 'text-red-500 border-red-500/20 bg-red-500/10';
      case 'Medium': return 'text-amber-500 border-amber-500/20 bg-amber-500/10';
      case 'Low': return 'text-blue-500 border-blue-500/20 bg-blue-500/10';
      default: return 'text-zinc-500 border-zinc-500/20 bg-zinc-500/10';
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'Security': return <ShieldAlert className="w-3 h-3" />;
      case 'Performance': return <Zap className="w-3 h-3" />;
      case 'Logic': return <AlertCircle className="w-3 h-3" />;
      default: return <Code2 className="w-3 h-3" />;
    }
  };

  const highlightCode = (code: string) => {
    const langMap: Record<string, any> = {
      typescript: Prism.languages.typescript,
      javascript: Prism.languages.javascript,
      python: Prism.languages.python,
      java: Prism.languages.java,
      go: Prism.languages.go,
      rust: Prism.languages.rust,
    };
    
    const highlighted = Prism.highlight(code, langMap[language] || Prism.languages.javascript, language);
    
    if (report) {
      const lines = highlighted.split('\n');
      const issueLines = new Set(report.issues.map(i => i.line));
      const selectedLine = selectedIssueIdx !== null ? report.issues[selectedIssueIdx].line : null;

      return lines.map((line, i) => {
        const lineNum = i + 1;
        if (lineNum === selectedLine) {
          return `<span class="line-highlight">${line}</span>`;
        }
        if (issueLines.has(lineNum)) {
          return `<span class="issue-marker">${line}</span>`;
        }
        return line;
      }).join('\n');
    }
    
    return highlighted;
  };

  if (!isAuthReady) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-zinc-300 font-sans selection:bg-emerald-500/30">
      {/* Navigation */}
      <nav className="h-14 border-b border-zinc-800 flex items-center justify-between px-6 bg-[#0a0a0a]/80 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <Beaker className="text-black w-5 h-5" />
          </div>
          <span className="font-semibold text-white tracking-tight">AI Code Reviewer</span>
        </div>
        
        <div className="flex items-center gap-4">
          {user && (
            <button
              onClick={() => setShowHistory(!showHistory)}
              className={`p-2 rounded-md transition-all ${showHistory ? 'bg-emerald-500/10 text-emerald-500' : 'hover:bg-zinc-800 text-zinc-400'}`}
              title="History"
            >
              <History className="w-5 h-5" />
            </button>
          )}

          <select 
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="bg-zinc-900 border border-zinc-800 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all"
          >
            <option value="typescript">TypeScript</option>
            <option value="javascript">JavaScript</option>
            <option value="python">Python</option>
            <option value="java">Java</option>
            <option value="go">Go</option>
            <option value="rust">Rust</option>
          </select>
          
          <button
            onClick={handleAnalyze}
            disabled={isAnalyzing || !code.trim()}
            className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:hover:bg-emerald-500 text-black px-4 py-1.5 rounded-md font-medium transition-all shadow-lg shadow-emerald-500/10 active:scale-95"
          >
            {isAnalyzing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4 fill-current" />
            )}
            {isAnalyzing ? 'Analyzing...' : 'Analyze'}
          </button>

          <div className="h-6 w-[1px] bg-zinc-800 mx-2" />

          {user ? (
            <div className="flex items-center gap-3">
              <div className="flex flex-col items-end">
                <span className="text-xs font-medium text-white leading-none">{user.displayName}</span>
                <button 
                  onClick={logout}
                  className="text-[10px] text-zinc-500 hover:text-red-400 transition-colors"
                >
                  Sign Out
                </button>
              </div>
              {user.photoURL ? (
                <img src={user.photoURL} alt="" className="w-8 h-8 rounded-full border border-zinc-800" referrerPolicy="no-referrer" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center">
                  <UserIcon className="w-4 h-4 text-zinc-500" />
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={signInWithGoogle}
              className="flex items-center gap-2 text-sm font-medium text-zinc-400 hover:text-white transition-colors"
            >
              <LogIn className="w-4 h-4" />
              Sign In
            </button>
          )}
        </div>
      </nav>

      <main className="flex h-[calc(100vh-3.5rem)] overflow-hidden">
        {/* History Sidebar */}
        <AnimatePresence>
          {showHistory && user && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 320, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              className="border-r border-zinc-800 bg-zinc-900/50 flex flex-col overflow-hidden"
            >
              <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800 bg-zinc-900/50">
                <span className="text-xs font-mono text-zinc-400 uppercase tracking-widest">History</span>
                <button 
                  onClick={() => {
                    setReport(null);
                    setCode('');
                    setShowHistory(false);
                    setSelectedIssueIdx(null);
                  }}
                  className="p-1 hover:bg-zinc-800 rounded text-zinc-500 hover:text-emerald-500 transition-all"
                  title="New Analysis"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-2">
                {history.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-8 opacity-20">
                    <History className="w-8 h-8 mb-2" />
                    <p className="text-xs">No history yet</p>
                  </div>
                ) : (
                  history.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => {
                        setCode(item.code);
                        setLanguage(item.language);
                        setReport(item.report);
                        setSelectedIssueIdx(null);
                      }}
                      className={`w-full text-left p-3 rounded-lg border transition-all group relative ${
                        report && (report as any).id === item.id 
                          ? 'bg-emerald-500/5 border-emerald-500/20' 
                          : 'bg-zinc-900/30 border-zinc-800 hover:border-zinc-700'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-mono text-emerald-500 uppercase">{item.language}</span>
                        <span className="text-[10px] text-zinc-600">
                          {item.createdAt?.toDate ? item.createdAt.toDate().toLocaleDateString() : 'Just now'}
                        </span>
                      </div>
                      <div className="text-xs font-medium text-zinc-300 truncate pr-6">
                        {item.code.split('\n')[0] || 'Empty file'}
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <div className={`text-[10px] font-bold ${item.report.score >= 80 ? 'text-emerald-500' : 'text-amber-500'}`}>
                          Score: {item.report.score}
                        </div>
                      </div>
                      <button
                        onClick={(e) => handleDeleteReview(e, item.id)}
                        className="absolute top-2 right-2 p-1.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-600 hover:text-red-400 hover:border-red-400/30 opacity-0 group-hover:opacity-100 transition-all"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </button>
                  ))
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Editor Section */}
        <div className="flex-1 flex flex-col min-w-0 border-r border-zinc-800 bg-[#0a0a0a]">
          <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800 bg-zinc-900/50">
            <div className="flex items-center gap-2">
              <FileCode className="w-4 h-4 text-zinc-500" />
              <span className="text-xs font-mono text-zinc-400 uppercase tracking-widest">Editor</span>
            </div>
            {selectedIssueIdx !== null && (
              <div className="flex items-center gap-2 text-[10px] font-mono text-emerald-500 animate-pulse">
                <Search className="w-3 h-3" />
                <span>Focusing on Line {report?.issues[selectedIssueIdx].line}</span>
              </div>
            )}
          </div>
          <div className="flex-1 overflow-auto custom-scrollbar relative">
            <Editor
              value={code}
              onValueChange={code => setCode(code)}
              highlight={code => highlightCode(code)}
              padding={24}
              style={{
                fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                fontSize: 14,
                minHeight: '100%',
                backgroundColor: 'transparent',
              }}
              className="code-editor"
            />
          </div>
        </div>

        {/* Sidebar Section */}
        <aside className="w-96 flex flex-col bg-zinc-900/30 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2 border-b border-zinc-800 bg-zinc-900/50">
            <Terminal className="w-4 h-4 text-zinc-500" />
            <span className="text-xs font-mono text-zinc-400 uppercase tracking-widest">Analysis Report</span>
          </div>

          <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
            <AnimatePresence mode="wait">
              {!report && !isAnalyzing && !error && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="h-full flex flex-col items-center justify-center text-center p-8 opacity-40"
                >
                  <Beaker className="w-12 h-12 mb-4" />
                  <p className="text-sm">Ready to analyze. Paste your code and click the play button.</p>
                  {!user && (
                    <p className="text-[10px] mt-4 text-zinc-500">Sign in to save your analysis history.</p>
                  )}
                </motion.div>
              )}

              {isAnalyzing && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="h-full flex flex-col items-center justify-center text-center p-8"
                >
                  <Loader2 className="w-8 h-8 mb-4 animate-spin text-emerald-500" />
                  <p className="text-sm text-zinc-400">Consulting the AI experts...</p>
                </motion.div>
              )}

              {error && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex gap-3"
                >
                  <AlertCircle className="w-5 h-5 shrink-0" />
                  <p>{error}</p>
                </motion.div>
              )}

              {report && !isAnalyzing && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="space-y-6 pb-8"
                >
                  {/* Summary Card */}
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 shadow-xl">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold text-white">Overview</h3>
                      <div className={`text-2xl font-bold ${report.score >= 80 ? 'text-emerald-500' : report.score >= 50 ? 'text-amber-500' : 'text-red-500'}`}>
                        {report.score}<span className="text-sm text-zinc-500 font-normal">/100</span>
                      </div>
                    </div>
                    <p className="text-sm text-zinc-400 leading-relaxed italic">
                      "{report.summary}"
                    </p>
                    <div className="mt-4 flex items-center gap-2 text-xs text-zinc-500">
                      <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                      <span>{report.totalIssues} potential improvements found</span>
                    </div>

                    <div className="mt-4 pt-4 border-t border-zinc-800 grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Time Complexity</span>
                        <div className="text-sm font-mono text-emerald-500">{report.timeComplexity}</div>
                      </div>
                      <div className="space-y-1">
                        <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Space Complexity</span>
                        <div className="text-sm font-mono text-emerald-500">{report.spaceComplexity}</div>
                      </div>
                    </div>

                    <div className="mt-4 pt-4 border-t border-zinc-800">
                      <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest block mb-2">Optimization Strategy</span>
                      <p className="text-xs text-zinc-400 leading-relaxed">
                        {report.complexitySuggestions}
                      </p>
                    </div>
                  </div>

                  {/* Issues List */}
                  <div className="space-y-4">
                    <h4 className="text-xs font-mono text-zinc-500 uppercase tracking-widest px-1">Detailed Findings</h4>
                    {report.issues.map((issue, idx) => (
                      <motion.div
                        key={idx}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.05 }}
                        onMouseEnter={() => setSelectedIssueIdx(idx)}
                        onMouseLeave={() => setSelectedIssueIdx(null)}
                        className={`group bg-zinc-900/50 border rounded-lg overflow-hidden transition-all cursor-pointer ${
                          selectedIssueIdx === idx ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-zinc-800 hover:border-zinc-700'
                        }`}
                      >
                        <div className="p-4">
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div className="flex flex-wrap gap-2">
                              <span className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${getSeverityColor(issue.severity)}`}>
                                {issue.severity}
                              </span>
                              <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-zinc-800 text-zinc-400 border border-zinc-700">
                                {getCategoryIcon(issue.category)}
                                {issue.category}
                              </span>
                            </div>
                            <span className="text-[10px] font-mono text-zinc-600">L{issue.line}</span>
                          </div>
                          
                          <h5 className="text-sm font-semibold text-zinc-200 mb-1 group-hover:text-white transition-colors">
                            {issue.label}
                          </h5>
                          <p className="text-xs text-zinc-400 leading-relaxed mb-4">
                            {issue.explanation}
                          </p>

                          <div className="space-y-3">
                            <div>
                              <span className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest block mb-1">Issue Snippet</span>
                              <div className="bg-red-500/5 rounded p-2 font-mono text-[11px] text-red-400/80 border border-red-500/10">
                                {issue.originalCode}
                              </div>
                            </div>
                            
                            <div>
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest">Suggested Fix</span>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleApplyFix(issue, idx);
                                  }}
                                  className="flex items-center gap-1 text-[10px] font-bold text-emerald-500 hover:text-emerald-400 transition-colors bg-emerald-500/10 px-2 py-0.5 rounded"
                                >
                                  <Wand2 className="w-3 h-3" />
                                  Apply Fix
                                </button>
                              </div>
                              <div className="bg-black/50 rounded p-3 font-mono text-[11px] text-emerald-400/90 overflow-x-auto border border-emerald-500/5">
                                <pre><code>{issue.suggestion}</code></pre>
                              </div>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </aside>
      </main>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #27272a;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #3f3f46;
        }
        
        .code-editor textarea {
          outline: none !important;
        }
        
        .line-highlight {
          display: block;
          background-color: rgba(16, 185, 129, 0.15);
          border-left: 2px solid #10b981;
          margin-left: -24px;
          padding-left: 22px;
          width: calc(100% + 48px);
        }

        .issue-marker {
          display: block;
          background-color: rgba(239, 68, 68, 0.05);
          border-left: 2px solid rgba(239, 68, 68, 0.3);
          margin-left: -24px;
          padding-left: 22px;
          width: calc(100% + 48px);
        }
      `}</style>
    </div>
  );
}
