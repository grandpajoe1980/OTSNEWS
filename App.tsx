import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { User, Article, UserRole, Comment, Theme, Section, SectionEditor, Notification, DigestPreference, Attachment } from './types';
import * as api from './services/api';
import { Sidebar } from './components/Sidebar';
import { ArticleCard } from './components/ArticleCard';
import { RichTextEditor } from './components/RichTextEditor';
import { Menu, Search, Bell, LogOut, LogIn, Plus, ChevronLeft, Send, Hash, User as UserIcon, MessageSquare, Sun, Moon, Crown, Settings, Trash2, Shield, UserPlus, ArrowLeft, X, Reply, Paperclip, FileText, Download, Tag, Mail, Check, CheckCheck, KeyRound } from 'lucide-react';

type ViewMode = 'feed' | 'section' | 'article' | 'editor' | 'admin' | 'digest';

export default function App() {
  // --- Global State ---
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [articles, setArticles] = useState<Article[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [sectionEditors, setSectionEditors] = useState<SectionEditor[]>([]);
  const [view, setView] = useState<ViewMode>('feed');
  const [theme, setTheme] = useState<Theme>('light');
  const [loading, setLoading] = useState(true);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // --- Notification State ---
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);

  // --- Digest State ---
  const [digestPref, setDigestPref] = useState<DigestPreference>({ userId: '', enabled: false, frequency: 'weekly' });

  // --- Tag Filter State ---
  const [activeTag, setActiveTag] = useState<string | undefined>(undefined);
  const [allTags, setAllTags] = useState<string[]>([]);

  // --- Navigation State ---
  const [activeSectionId, setActiveSectionId] = useState<string | undefined>(undefined);
  const [activeSubsectionId, setActiveSubsectionId] = useState<string | undefined>(undefined);
  const [activeArticleId, setActiveArticleId] = useState<string | undefined>(undefined);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // --- Admin State ---
  const [adminTab, setAdminTab] = useState<'users' | 'sections' | 'editors'>('users');
  const [newSectionTitle, setNewSectionTitle] = useState('');
  const [newSubsectionTitle, setNewSubsectionTitle] = useState('');
  const [selectedSectionForSub, setSelectedSectionForSub] = useState<string>('');
  const [pendingDeleteSectionId, setPendingDeleteSectionId] = useState<string | null>(null);

  // --- Registration State ---
  const [isRegistering, setIsRegistering] = useState(false);
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');

  // --- Login State ---
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  // --- Editor State ---
  const [editorData, setEditorData] = useState<{
    id?: string;
    title: string;
    sectionId: string;
    subsectionId: string;
    content: string;
    excerpt: string;
    allowComments: boolean;
    imageUrl?: string;
    status: 'draft' | 'published';
    tags: string[];
    attachments: Attachment[];
  }>({
    title: '',
    sectionId: 'euc',
    subsectionId: '',
    content: '<p>Start typing...</p>',
    excerpt: '',
    allowComments: true,
    status: 'published',
    tags: [],
    attachments: [],
  });
  const [tagInput, setTagInput] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [resetPasswordUserId, setResetPasswordUserId] = useState<string | null>(null);
  const [resetPasswordValue, setResetPasswordValue] = useState('');

  // --- Theme Effect ---
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // --- Load Data from SQLite API ---
  const refreshData = useCallback(async () => {
    try {
      const [u, s, a, se] = await Promise.all([
        api.fetchUsers(),
        api.fetchSections(),
        api.fetchArticles(),
        api.fetchSectionEditors(),
      ]);
      setUsers(u);
      setSections(s);
      setArticles(a);
      setSectionEditors(se);
    } catch (err) {
      console.error('Failed to load data from API:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  const cycleTheme = () => {
    if (theme === 'light') setTheme('dark');
    else if (theme === 'dark') setTheme('princess');
    else setTheme('light');
  };

  // --- Derived State ---
  const filteredArticles = useMemo(() => {
    let filtered = [...articles].sort((a, b) => b.timestamp - a.timestamp);
    // Hide drafts from non-authors (unless admin)
    filtered = filtered.filter(a => {
      if (a.status === 'published') return true;
      if (!currentUser) return false;
      if (currentUser.role === UserRole.ADMIN) return true;
      return a.authorId === currentUser.id;
    });
    if (activeSectionId) {
      filtered = filtered.filter(a => a.sectionId === activeSectionId);
    }
    if (activeSubsectionId) {
      filtered = filtered.filter(a => a.subsectionId === activeSubsectionId);
    }
    if (activeTag) {
      filtered = filtered.filter(a => a.tags?.includes(activeTag));
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(a =>
        a.title.toLowerCase().includes(q) ||
        a.excerpt.toLowerCase().includes(q) ||
        a.content.toLowerCase().includes(q)
      );
    }
    return filtered;
  }, [articles, activeSectionId, activeSubsectionId, searchQuery, currentUser, activeTag]);

  const currentArticle = useMemo(() =>
    articles.find(a => a.id === activeArticleId),
    [articles, activeArticleId]);

  // --- Actions ---
  const handleLogin = async () => {
    if (!loginEmail.trim() || !loginPassword.trim()) return;
    setLoginError('');
    try {
      const user = await api.loginUser(loginEmail.trim(), loginPassword);
      setCurrentUser(user);
      setShowLoginModal(false);
      setLoginEmail('');
      setLoginPassword('');
      await refreshData();
    } catch (err: any) {
      setLoginError('Invalid email or password');
    }
  };

  const handleRegister = async () => {
    if (!regName.trim() || !regEmail.trim() || !regPassword.trim()) return;
    setLoginError('');
    try {
      const newUser: User & { password: string } = {
        id: `u_${Date.now()}`,
        name: regName,
        email: regEmail.trim().toLowerCase(),
        password: regPassword,
        role: UserRole.USER,
        avatar: `https://picsum.photos/seed/${regName.replace(/\s/g, '')}/50/50`,
      };
      const created = await api.createUser(newUser);
      setUsers(prev => [...prev, created]);
      setCurrentUser(created);
      setShowLoginModal(false);
      setRegName('');
      setRegEmail('');
      setRegPassword('');
      setIsRegistering(false);
      await refreshData();
    } catch (err: any) {
      setLoginError('Registration failed. Email may already be in use.');
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setView('feed');
    setActiveSectionId(undefined);
    setActiveSubsectionId(undefined);
  };

  const navigateToFeed = () => {
    setActiveSectionId(undefined);
    setActiveSubsectionId(undefined);
    setView('feed');
  };

  const navigateToSection = (sectionId?: string, subsectionId?: string) => {
    if (!sectionId) {
      navigateToFeed();
      return;
    }
    setActiveSectionId(sectionId);
    setActiveSubsectionId(subsectionId);
    setView('section');
  };

  const navigateToArticle = (articleId: string) => {
    setActiveArticleId(articleId);
    setView('article');
  };

  const navigateToEditor = (articleToEdit?: Article) => {
    if (articleToEdit) {
      setEditorData({
        id: articleToEdit.id,
        title: articleToEdit.title,
        sectionId: articleToEdit.sectionId,
        subsectionId: articleToEdit.subsectionId || '',
        content: articleToEdit.content,
        excerpt: articleToEdit.excerpt,
        allowComments: articleToEdit.allowComments,
        imageUrl: articleToEdit.imageUrl,
        status: articleToEdit.status || 'published',
        tags: articleToEdit.tags || [],
        attachments: articleToEdit.attachments || [],
      });
    } else {
      setEditorData({
        title: '',
        sectionId: 'euc',
        subsectionId: '',
        content: '<p>Start writing your article...</p>',
        excerpt: '',
        allowComments: true,
        status: 'published',
        tags: [],
        attachments: [],
      });
    }
    setTagInput('');
    setView('editor');
  };

  const saveArticle = async () => {
    if (!currentUser) return;

    const newArticle: Article = {
      id: editorData.id || `new_${Date.now()}`,
      title: editorData.title,
      content: editorData.content,
      excerpt: editorData.excerpt || 'No excerpt provided.',
      sectionId: editorData.sectionId,
      subsectionId: editorData.subsectionId || undefined,
      authorId: currentUser.id,
      authorName: currentUser.name,
      timestamp: Date.now(),
      allowComments: editorData.allowComments,
      comments: editorData.id ? (articles.find(a => a.id === editorData.id)?.comments || []) : [],
      imageUrl: editorData.imageUrl || 'https://picsum.photos/800/400',
      status: editorData.status,
      tags: editorData.tags,
      attachments: editorData.attachments,
    };

    if (editorData.id) {
      await api.updateArticle(newArticle);
    } else {
      await api.createArticle(newArticle);
    }
    await refreshData();
    navigateToFeed();
  };

  const handleDeleteArticle = async (articleId: string) => {
    await api.deleteArticle(articleId);
    setDeleteConfirmId(null);
    await refreshData();
    navigateToFeed();
  };

  const handleDeleteComment = async (commentId: string) => {
    await api.deleteComment(commentId);
    await refreshData();
  };

  const addTag = () => {
    const tag = tagInput.trim().toLowerCase().replace(/\s+/g, '-');
    if (tag && !editorData.tags.includes(tag)) {
      setEditorData(prev => ({ ...prev, tags: [...prev.tags, tag] }));
    }
    setTagInput('');
  };

  const removeTag = (tag: string) => {
    setEditorData(prev => ({ ...prev, tags: prev.tags.filter(t => t !== tag) }));
  };

  const handleAttachmentUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const att: Attachment = {
        id: `att_${Date.now()}`,
        filename: file.name,
        data: reader.result as string,
        mimeType: file.type,
      };
      setEditorData(prev => ({ ...prev, attachments: [...prev.attachments, att] }));
    };
    reader.readAsDataURL(file);
  };

  const removeAttachment = (attId: string) => {
    setEditorData(prev => ({ ...prev, attachments: prev.attachments.filter(a => a.id !== attId) }));
  };

  // --- Cover Image Handlers ---
  const handleCoverFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setEditorData(prev => ({ ...prev, imageUrl: reader.result as string }));
    };
    reader.readAsDataURL(file);
  };

  const handleImageUrlChange = (val: string) => {
    setEditorData(prev => ({ ...prev, imageUrl: val }));
  };

  const removeCoverImage = () => {
    setEditorData(prev => ({ ...prev, imageUrl: undefined }));
  };

  const postComment = async (text: string) => {
    if (!currentUser || !currentArticle) return;
    const newComment: Comment = {
      id: `c_${Date.now()}`,
      authorId: currentUser.id,
      authorName: currentUser.name,
      authorAvatar: currentUser.avatar,
      content: text,
      timestamp: Date.now(),
    };
    await api.postComment(currentArticle.id, newComment);
    await refreshData();
  };

  // --- Admin Actions ---
  const handleRoleChange = async (userId: string, newRole: UserRole) => {
    await api.updateUserRole(userId, newRole);
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u));
  };

  const handleDeleteUser = async (userId: string) => {
    if (currentUser?.id === userId) {
      alert("You cannot delete yourself.");
      return;
    }
    if (confirm("Are you sure you want to delete this user?")) {
      await api.deleteUser(userId);
      setUsers(prev => prev.filter(u => u.id !== userId));
    }
  };

  const addSection = async () => {
    if (!newSectionTitle.trim()) return;
    const id = newSectionTitle.toLowerCase().replace(/\s+/g, '-');
    await api.createSection(id, newSectionTitle);
    setSections(prev => [...prev, { id, title: newSectionTitle, subsections: [] }]);
    setNewSectionTitle('');
  };

  const deleteSection = async (sectionId: string) => {
    try {
      await api.deleteSection(sectionId);
      setSections(prev => prev.filter(s => s.id !== sectionId));
      if (activeSectionId === sectionId) {
        navigateToFeed();
      }
      setPendingDeleteSectionId(null);
      await refreshData();
    } catch (err) {
      console.error('Failed to delete section:', err);
      alert('Failed to delete section. Please try again.');
    }
  };

  const addSubsection = async () => {
    if (!newSubsectionTitle.trim() || !selectedSectionForSub) return;
    const id = newSubsectionTitle.toLowerCase().replace(/\s+/g, '-');
    await api.createSubsection(selectedSectionForSub, id, newSubsectionTitle);
    setSections(prev => prev.map(s => {
      if (s.id === selectedSectionForSub) {
        return {
          ...s,
          subsections: [...(s.subsections || []), { id, title: newSubsectionTitle }]
        };
      }
      return s;
    }));
    setNewSubsectionTitle('');
  };

  const isAdmin = currentUser?.role === UserRole.ADMIN;
  const isLoggedIn = currentUser !== null;
  const canComment = isLoggedIn; // any logged-in user can comment

  // Per-section edit permission check
  const canEditSection = useCallback((sectionId: string): boolean => {
    if (!currentUser) return false;
    if (currentUser.role === UserRole.ADMIN) return true;
    return sectionEditors.some(se => se.userId === currentUser.id && se.sectionId === sectionId);
  }, [currentUser, sectionEditors]);

  // Can the user edit anything at all? (used for "New Article" button visibility)
  const canEditAny = useMemo(() => {
    if (!currentUser) return false;
    if (currentUser.role === UserRole.ADMIN) return true;
    return sectionEditors.some(se => se.userId === currentUser.id);
  }, [currentUser, sectionEditors]);

  // Sections this user can edit (for the editor dropdown)
  const editableSections = useMemo(() => {
    if (!currentUser) return [];
    if (currentUser.role === UserRole.ADMIN) return sections;
    const editableIds = sectionEditors
      .filter(se => se.userId === currentUser.id)
      .map(se => se.sectionId);
    return sections.filter(s => editableIds.includes(s.id));
  }, [currentUser, sectionEditors, sections]);

  // --- Admin: Section Editor Actions ---
  const handleAddSectionEditor = async (userId: string, sectionId: string) => {
    try {
      await api.addSectionEditor(userId, sectionId);
      setSectionEditors(prev => [...prev, { userId, sectionId }]);
    } catch (err) {
      console.error('Failed to add section editor:', err);
    }
  };

  const handleRemoveSectionEditor = async (userId: string, sectionId: string) => {
    try {
      await api.removeSectionEditor(userId, sectionId);
      setSectionEditors(prev => prev.filter(se => !(se.userId === userId && se.sectionId === sectionId)));
    } catch (err) {
      console.error('Failed to remove section editor:', err);
    }
  };

  // --- Views ---

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="h-16 w-16 bg-ots-600 rounded-xl flex items-center justify-center mb-4 shadow-lg rotate-3 mx-auto animate-pulse">
            <span className="text-white font-bold text-2xl tracking-tighter">OTS</span>
          </div>
          <p className="text-gray-500 text-sm">Loading from database…</p>
        </div>
      </div>
    );
  }

  // Login Modal
  const loginModal = showLoginModal ? (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4" onClick={() => setShowLoginModal(false)}>
      <div className="bg-card p-8 rounded-2xl shadow-xl max-w-md w-full relative" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={() => { setShowLoginModal(false); setLoginError(''); setIsRegistering(false); }}
          className="absolute top-4 right-4 p-1 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100"
        >
          <X size={20} />
        </button>
        <div className="flex flex-col items-center mb-8">
          <div className="h-16 w-16 bg-ots-600 rounded-xl flex items-center justify-center mb-4 shadow-lg rotate-3">
            <span className="text-white font-bold text-2xl tracking-tighter">OTS</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Sign In</h1>
          <p className="text-gray-500 text-sm mt-2 text-center">Log in to comment, edit, and more</p>
        </div>

        {isRegistering ? (
          <div className="space-y-4">
            <div className="flex items-center mb-4">
              <button onClick={() => { setIsRegistering(false); setLoginError(''); }} className="text-gray-500 hover:text-gray-700">
                <ArrowLeft size={20} />
              </button>
              <span className="ml-2 font-bold text-gray-700">Create Account</span>
            </div>
            {loginError && (
              <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg px-4 py-2">{loginError}</div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
              <input
                type="text"
                value={regName}
                onChange={(e) => setRegName(e.target.value)}
                className="block w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-ots-500 focus:border-ots-500 bg-card text-gray-900"
                placeholder="e.g. Jane Doe"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={regEmail}
                onChange={(e) => setRegEmail(e.target.value)}
                className="block w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-ots-500 focus:border-ots-500 bg-card text-gray-900"
                placeholder="e.g. jane.doe@la.gov"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input
                type="password"
                value={regPassword}
                onChange={(e) => setRegPassword(e.target.value)}
                className="block w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-ots-500 focus:border-ots-500 bg-card text-gray-900"
                placeholder="Choose a password"
              />
            </div>
            <button
              onClick={handleRegister}
              disabled={!regName.trim() || !regEmail.trim() || !regPassword.trim()}
              className="w-full bg-ots-600 text-white py-2 rounded-lg font-medium hover:bg-ots-700 transition-colors disabled:opacity-50"
            >
              Register & Login
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {loginError && (
              <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg px-4 py-2">{loginError}</div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={loginEmail}
                onChange={(e) => { setLoginEmail(e.target.value); setLoginError(''); }}
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                className="block w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-ots-500 focus:border-ots-500 bg-card text-gray-900"
                placeholder="you@la.gov"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input
                type="password"
                value={loginPassword}
                onChange={(e) => { setLoginPassword(e.target.value); setLoginError(''); }}
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                className="block w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-ots-500 focus:border-ots-500 bg-card text-gray-900"
                placeholder="Enter your password"
              />
            </div>
            <button
              onClick={handleLogin}
              disabled={!loginEmail.trim() || !loginPassword.trim()}
              className="w-full bg-ots-600 text-white py-2.5 rounded-lg font-medium hover:bg-ots-700 transition-colors disabled:opacity-50"
            >
              Sign In
            </button>

            <button
              onClick={() => { setIsRegistering(true); setLoginError(''); }}
              className="w-full flex items-center justify-center p-3 rounded-lg border border-dashed border-gray-300 text-gray-500 hover:bg-gray-50 hover:text-ots-600 transition-all mt-2"
            >
              <UserPlus size={18} className="mr-2" />
              <span className="text-sm font-medium">Register New User</span>
            </button>
          </div>
        )}
      </div>
    </div>
  ) : null;

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col transition-colors duration-300">
      {/* Header */}
      <header className="bg-card h-16 border-b border-gray-200 sticky top-0 z-50 flex items-center px-4 justify-between shadow-sm transition-colors duration-300">
        <div className="flex items-center">
          <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 mr-2 text-gray-600 hover:bg-gray-100 rounded-md md:hidden">
            <Menu size={20} />
          </button>
          <div onClick={navigateToFeed} className="flex items-center cursor-pointer">
            <div className="h-8 w-8 bg-ots-600 rounded-lg flex items-center justify-center mr-2 shadow-sm transition-colors duration-300">
              <span className="text-white font-bold text-xs tracking-tighter">OTS</span>
            </div>
            <span className="text-lg font-bold text-gray-900 tracking-tight hidden sm:block ml-2">OTS NEWS</span>
          </div>
        </div>

        <div className="flex-1 max-w-xl mx-4 hidden md:block">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search size={16} className="text-gray-400" />
            </div>
            <input
              type="text"
              placeholder="Search news..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="block w-full pl-10 pr-3 py-2 border border-gray-200 rounded-full leading-5 bg-gray-50 text-gray-900 placeholder-gray-400 focus:outline-none focus:bg-card focus:ring-1 focus:ring-ots-500 focus:border-ots-500 sm:text-sm transition-colors"
            />
          </div>
        </div>

        <div className="flex items-center space-x-3">
          {canEditAny && (
            <button
              onClick={() => navigateToEditor()}
              className="hidden sm:flex items-center px-3 py-1.5 bg-ots-600 text-white rounded-md text-sm font-medium hover:bg-ots-700 transition-colors shadow-sm"
            >
              <Plus size={16} className="mr-1.5" />
              New Article
            </button>
          )}
          {isAdmin && (
            <button
              onClick={() => setView('admin')}
              className="p-2 text-gray-500 hover:bg-gray-100 rounded-full transition-colors"
              title="Admin Dashboard"
            >
              <Settings size={20} />
            </button>
          )}
          <button
            onClick={cycleTheme}
            className="p-2 text-gray-500 hover:bg-gray-100 rounded-full transition-colors"
            title={`Current: ${theme} mode`}
          >
            {theme === 'light' ? <Sun size={20} /> : theme === 'dark' ? <Moon size={20} /> : <Crown size={20} />}
          </button>

          {isLoggedIn && (
            <div className="relative">
              <button
                onClick={async () => {
                  if (!showNotifications && currentUser) {
                    const notifs = await api.fetchNotifications(currentUser.id);
                    setNotifications(notifs);
                  }
                  setShowNotifications(!showNotifications);
                }}
                className="p-2 text-gray-500 hover:bg-gray-100 rounded-full relative"
              >
                <Bell size={20} />
                {notifications.filter(n => !n.read).length > 0 && (
                  <span className="absolute top-1 right-1 flex items-center justify-center h-4 w-4 text-[10px] font-bold rounded-full ring-2 ring-white bg-red-500 text-white">
                    {notifications.filter(n => !n.read).length}
                  </span>
                )}
              </button>
              {showNotifications && (
                <div className="absolute right-0 mt-2 w-80 bg-card rounded-xl shadow-xl border border-gray-200 z-50 max-h-96 overflow-y-auto">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
                    <span className="font-bold text-sm text-gray-900">Notifications</span>
                    {notifications.some(n => !n.read) && (
                      <button
                        onClick={async () => {
                          if (currentUser) {
                            await api.markAllNotificationsRead(currentUser.id);
                            setNotifications(prev => prev.map(n => ({ ...n, read: true })));
                          }
                        }}
                        className="text-xs text-ots-600 hover:text-ots-700 font-medium flex items-center"
                      >
                        <CheckCheck size={14} className="mr-1" /> Mark all read
                      </button>
                    )}
                  </div>
                  {notifications.length === 0 ? (
                    <div className="p-6 text-center text-gray-400 text-sm">No notifications yet</div>
                  ) : (
                    notifications.slice(0, 20).map(n => (
                      <div
                        key={n.id}
                        onClick={async () => {
                          if (!n.read) {
                            await api.markNotificationRead(n.id);
                            setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x));
                          }
                          if (n.articleId) {
                            navigateToArticle(n.articleId);
                            setShowNotifications(false);
                          }
                        }}
                        className={`px-4 py-3 border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors ${!n.read ? 'bg-ots-50' : ''}`}
                      >
                        <p className={`text-sm ${!n.read ? 'font-semibold text-gray-900' : 'text-gray-600'}`}>{n.message}</p>
                        <p className="text-xs text-gray-400 mt-1">{new Date(n.timestamp).toLocaleString()}</p>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
          <div className="h-8 w-px bg-gray-200 mx-2"></div>
          {isLoggedIn ? (
            <>
              <div className="flex items-center space-x-2">
                <img src={currentUser?.avatar} alt="Profile" className="h-8 w-8 rounded-full border border-gray-200" />
                <div className="hidden lg:flex flex-col">
                  <span className="text-xs font-semibold text-gray-700 leading-none">{currentUser?.name}</span>
                  <span className="text-[10px] text-gray-500 capitalize leading-none mt-1">{currentUser?.role}</span>
                </div>
              </div>
              <button onClick={handleLogout} className="ml-2 p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors" title="Sign Out">
                <LogOut size={18} />
              </button>
              <button
                onClick={async () => {
                  if (currentUser) {
                    const pref = await api.fetchDigestPreference(currentUser.id);
                    setDigestPref(pref);
                  }
                  setView('digest');
                }}
                className="p-2 text-gray-400 hover:text-ots-600 hover:bg-ots-50 rounded-md transition-colors"
                title="Email Digest Settings"
              >
                <Mail size={18} />
              </button>
            </>
          ) : (
            <button
              onClick={() => setShowLoginModal(true)}
              className="flex items-center px-3 py-1.5 bg-ots-600 text-white rounded-md text-sm font-medium hover:bg-ots-700 transition-colors shadow-sm"
              title="Sign In"
            >
              <LogIn size={16} className="mr-1.5" />
              Sign In
            </button>
          )}
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <Sidebar
          sections={sections}
          isOpen={isSidebarOpen}
          currentSection={activeSectionId}
          currentSubsection={activeSubsectionId}
          onNavigate={navigateToSection}
        />

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-8">

          {/* View: Feed or Section */}
          {(view === 'feed' || view === 'section') && (
            <div className="max-w-7xl mx-auto">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">
                    {activeSubsectionId ? sections.find(s => s.id === activeSectionId)?.subsections?.find(sub => sub.id === activeSubsectionId)?.title :
                      activeSectionId ? sections.find(s => s.id === activeSectionId)?.title :
                        'Top Stories'}
                  </h1>
                  <p className="text-gray-500 text-sm mt-1">
                    {searchQuery.trim() ? `Showing results for "${searchQuery}"` :
                      activeTag ? `Filtered by tag: ${activeTag}` :
                        activeSectionId ? 'Latest updates from this section' : 'Curated news for you'}
                  </p>
                </div>
                {activeTag && (
                  <button
                    onClick={() => setActiveTag(undefined)}
                    className="flex items-center px-3 py-1.5 bg-ots-100 text-ots-700 rounded-full text-sm font-medium hover:bg-ots-200 transition-colors"
                  >
                    <Tag size={14} className="mr-1" />{activeTag}
                    <X size={14} className="ml-1.5" />
                  </button>
                )}
              </div>

              {filteredArticles.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 bg-card rounded-xl shadow-sm border border-gray-200">
                  <div className="p-4 bg-gray-50 rounded-full mb-4">
                    <Hash className="text-gray-400" size={32} />
                  </div>
                  <p className="text-gray-500 font-medium">No articles found in this section.</p>
                  {canEditAny && (
                    <button onClick={() => navigateToEditor()} className="mt-4 text-ots-600 hover:text-ots-700 font-medium text-sm">
                      Create the first article
                    </button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredArticles.map(article => (
                    <div key={article.id} className="h-full">
                      <ArticleCard article={article} onClick={navigateToArticle} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* View: Article Detail */}
          {view === 'article' && currentArticle && (
            <div className="max-w-4xl mx-auto bg-card rounded-xl shadow-sm border border-gray-200 overflow-hidden min-h-[50vh]">
              {currentArticle.imageUrl && (
                <div className="w-full h-64 md:h-80 bg-gray-200 overflow-hidden relative">
                  <img src={currentArticle.imageUrl} alt={currentArticle.title} className="w-full h-full object-cover" />
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-6 md:p-8">
                    <span className="inline-block px-2 py-1 bg-ots-600 text-white text-xs font-bold rounded mb-2 uppercase tracking-wide">
                      {currentArticle.sectionId}
                    </span>
                    <h1 className="text-2xl md:text-4xl font-bold text-white shadow-sm leading-tight">
                      {currentArticle.title}
                    </h1>
                  </div>
                </div>
              )}

              <div className="p-6 md:p-8">
                {/* Draft Badge */}
                {currentArticle.status === 'draft' && (
                  <div className="mb-4 inline-block px-3 py-1 bg-yellow-100 text-yellow-800 text-xs font-bold rounded-full uppercase">Draft</div>
                )}

                {/* Metadata */}
                <div className="flex items-center justify-between mb-8 pb-8 border-b border-gray-100">
                  <div className="flex items-center">
                    <img src={users.find(u => u.id === currentArticle.authorId)?.avatar} className="w-10 h-10 rounded-full mr-3" alt="" />
                    <div>
                      <div className="text-sm font-bold text-gray-900">{currentArticle.authorName}</div>
                      <div className="text-xs text-gray-500">{new Date(currentArticle.timestamp).toLocaleDateString()} • 5 min read</div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    {canEditSection(currentArticle.sectionId) && (
                      <button
                        onClick={() => navigateToEditor(currentArticle)}
                        className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md text-sm font-medium hover:bg-gray-200 transition-colors"
                      >
                        Edit Article
                      </button>
                    )}
                    {(isAdmin || canEditSection(currentArticle.sectionId)) && (
                      <button
                        onClick={() => setDeleteConfirmId(currentArticle.id)}
                        className="px-3 py-2 bg-red-50 text-red-600 rounded-md text-sm font-medium hover:bg-red-100 transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Tags */}
                {currentArticle.tags && currentArticle.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-6">
                    {currentArticle.tags.map(tag => (
                      <span
                        key={tag}
                        onClick={() => { setActiveTag(tag); navigateToFeed(); }}
                        className="inline-flex items-center px-2.5 py-1 bg-ots-50 text-ots-600 rounded-full text-xs font-medium cursor-pointer hover:bg-ots-100 transition-colors"
                      >
                        <Tag size={12} className="mr-1" />{tag}
                      </span>
                    ))}
                  </div>
                )}

                {/* Content */}
                <div className="prose prose-blue max-w-none mb-8" dangerouslySetInnerHTML={{ __html: currentArticle.content }} />

                {/* Attachments */}
                {currentArticle.attachments && currentArticle.attachments.length > 0 && (
                  <div className="mb-8 p-4 bg-gray-50 rounded-lg border border-gray-200">
                    <h4 className="text-sm font-bold text-gray-900 mb-3 flex items-center"><Paperclip size={16} className="mr-2" />Attachments</h4>
                    <div className="space-y-2">
                      {currentArticle.attachments.map(att => (
                        <a
                          key={att.id}
                          href={att.data}
                          download={att.filename}
                          className="flex items-center p-2 bg-card rounded border border-gray-100 hover:bg-gray-50 transition-colors"
                        >
                          <FileText size={16} className="text-ots-600 mr-2 flex-shrink-0" />
                          <span className="text-sm text-gray-700 flex-1 truncate">{att.filename}</span>
                          <Download size={14} className="text-gray-400 ml-2" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {/* Comments Section */}
                <div className="bg-gray-50 rounded-xl p-6 md:p-8">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-bold text-gray-900 flex items-center">
                      <MessageSquare size={20} className="mr-2" />
                      Comments ({currentArticle.comments.length})
                    </h3>
                    {!currentArticle.allowComments && (
                      <span className="text-xs font-semibold bg-gray-200 text-gray-500 px-2 py-1 rounded">Comments Locked</span>
                    )}
                  </div>

                  {currentArticle.allowComments ? (
                    <>
                      {/* Comment List — threaded */}
                      <div className="space-y-4 mb-8">
                        {currentArticle.comments.length > 0 ? (
                          (() => {
                            const topLevel = currentArticle.comments.filter(c => !c.parentId);
                            const replies = currentArticle.comments.filter(c => c.parentId);
                            const renderComment = (comment: Comment, indent = false) => (
                              <div key={comment.id} className={`flex gap-3 ${indent ? 'ml-10 mt-3' : ''}`}>
                                <img src={comment.authorAvatar} alt="" className="w-7 h-7 rounded-full flex-shrink-0 mt-1" />
                                <div className="flex-1 bg-card p-3 rounded-lg shadow-sm border border-gray-100">
                                  <div className="flex items-baseline justify-between mb-1">
                                    <span className="text-sm font-bold text-gray-900">{comment.authorName}</span>
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs text-gray-400">{new Date(comment.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                      {(isAdmin || canEditSection(currentArticle.sectionId)) && (
                                        <button onClick={() => handleDeleteComment(comment.id)} className="text-gray-300 hover:text-red-500" title="Delete comment">
                                          <Trash2 size={12} />
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                  <p className="text-sm text-gray-700">{comment.content}</p>
                                  {canComment && (
                                    <button
                                      onClick={() => {
                                        const text = prompt('Reply to this comment:');
                                        if (text && text.trim() && currentUser && currentArticle) {
                                          const newReply: Comment = {
                                            id: `c_${Date.now()}`,
                                            authorId: currentUser.id,
                                            authorName: currentUser.name,
                                            authorAvatar: currentUser.avatar,
                                            content: text.trim(),
                                            timestamp: Date.now(),
                                            parentId: comment.id,
                                          };
                                          api.postComment(currentArticle.id, newReply).then(() => refreshData());
                                        }
                                      }}
                                      className="mt-1 text-xs text-ots-600 hover:text-ots-700 flex items-center"
                                    >
                                      <Reply size={12} className="mr-1" />Reply
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                            return topLevel.map(c => (
                              <div key={c.id}>
                                {renderComment(c)}
                                {replies.filter(r => r.parentId === c.id).map(r => renderComment(r, true))}
                              </div>
                            ));
                          })()
                        ) : (
                          <p className="text-center text-gray-400 text-sm py-4">Be the first to share your thoughts.</p>
                        )}
                      </div>

                      {/* Comment Input */}
                      {canComment ? (
                        <div className="flex gap-4 items-start">
                          <img src={currentUser?.avatar} className="w-8 h-8 rounded-full hidden sm:block" alt="" />
                          <div className="flex-1">
                            <form onSubmit={(e) => {
                              e.preventDefault();
                              const input = (e.target as any).elements.comment;
                              if (input.value.trim()) {
                                postComment(input.value);
                                input.value = '';
                              }
                            }} className="relative">
                              <textarea
                                name="comment"
                                className="w-full border border-gray-300 rounded-lg p-3 pr-12 text-sm focus:ring-2 focus:ring-ots-500 focus:border-transparent outline-none resize-none bg-card text-gray-900"
                                rows={3}
                                placeholder="Write a respectful comment..."
                              ></textarea>
                              <button type="submit" className="absolute bottom-3 right-3 p-1.5 bg-ots-600 text-white rounded-md hover:bg-ots-700 transition-colors">
                                <Send size={16} />
                              </button>
                            </form>
                          </div>
                        </div>
                      ) : (
                        <div className="text-center bg-yellow-50 p-4 rounded-lg text-yellow-700 text-sm space-y-2">
                          <p>You must be logged in to comment.</p>
                          <button
                            onClick={() => setShowLoginModal(true)}
                            className="inline-flex items-center px-3 py-1.5 bg-ots-600 text-white rounded-md text-sm font-medium hover:bg-ots-700 transition-colors"
                          >
                            <LogIn size={14} className="mr-1.5" />
                            Sign In
                          </button>
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="text-gray-500 italic text-sm">Comments are turned off for this article.</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* View: Editor */}
          {view === 'editor' && (
            <div className="max-w-4xl mx-auto">
              <div className="mb-6 flex items-center justify-between">
                <button onClick={() => navigateToFeed()} className="flex items-center text-gray-500 hover:text-gray-900 transition-colors">
                  <ChevronLeft size={20} className="mr-1" />
                  Back to Articles
                </button>
                <h1 className="text-2xl font-bold text-gray-900">{editorData.id ? 'Edit Article' : 'New Article'}</h1>
              </div>

              <div className="bg-card rounded-xl shadow-sm border border-gray-200 p-6 space-y-6">

                {/* Title */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                  <input
                    type="text"
                    value={editorData.title}
                    onChange={(e) => setEditorData(prev => ({ ...prev, title: e.target.value }))}
                    className="block w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-ots-500 focus:border-ots-500 bg-card text-gray-900"
                    placeholder="Enter a catchy headline"
                  />
                </div>

                {/* Section & Subsection */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Section</label>
                    <select
                      value={editorData.sectionId}
                      onChange={(e) => setEditorData(prev => ({ ...prev, sectionId: e.target.value, subsectionId: '' }))}
                      className="block w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-ots-500 focus:border-ots-500 bg-card text-gray-900"
                    >
                      {editableSections.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Subsection (Optional)</label>
                    <select
                      value={editorData.subsectionId}
                      onChange={(e) => setEditorData(prev => ({ ...prev, subsectionId: e.target.value }))}
                      className="block w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-ots-500 focus:border-ots-500 bg-card text-gray-900"
                    >
                      <option value="">-- None --</option>
                      {sections.find(s => s.id === editorData.sectionId)?.subsections?.map(sub => (
                        <option key={sub.id} value={sub.id}>{sub.title}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Excerpt */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Excerpt</label>
                  <textarea
                    value={editorData.excerpt}
                    onChange={(e) => setEditorData(prev => ({ ...prev, excerpt: e.target.value }))}
                    rows={2}
                    className="block w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-ots-500 focus:border-ots-500 bg-card text-gray-900"
                    placeholder="A short summary for the card view..."
                  />
                </div>

                {/* Cover Image */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Cover Image (optional)</label>
                  {editorData.imageUrl ? (
                    <div className="mt-2">
                      <div className="w-full h-48 bg-gray-100 rounded-lg overflow-hidden mb-2">
                        <img src={editorData.imageUrl} alt="Cover preview" className="w-full h-full object-cover" />
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="inline-flex items-center px-3 py-2 bg-white border border-gray-300 rounded text-sm cursor-pointer hover:bg-gray-50">
                          Change Image
                          <input type="file" accept="image/*" onChange={handleCoverFileChange} className="hidden" />
                        </label>
                        <button onClick={removeCoverImage} className="px-3 py-2 bg-red-50 text-red-600 border border-red-100 rounded text-sm hover:bg-red-100">Remove</button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-2">
                      <div className="flex items-center gap-2">
                        <label className="inline-flex items-center px-3 py-2 bg-white border border-gray-300 rounded text-sm cursor-pointer hover:bg-gray-50">
                          Upload Image
                          <input type="file" accept="image/*" onChange={handleCoverFileChange} className="hidden" />
                        </label>
                        <span className="text-sm text-gray-400">or</span>
                        <input
                          type="text"
                          value={editorData.imageUrl || ''}
                          onChange={(e) => handleImageUrlChange(e.target.value)}
                          placeholder="Paste image URL"
                          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm bg-card text-gray-900"
                        />
                      </div>
                      <p className="text-xs text-gray-400 mt-2">Tip: Upload a file or paste an image URL.</p>
                    </div>
                  )}
                </div>

                {/* Rich Editor */}
                <div>
                  <RichTextEditor
                    value={editorData.content}
                    onChange={(val) => setEditorData(prev => ({ ...prev, content: val }))}
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Tip: Switch to "Code" view to fine-tune HTML structure.
                  </p>
                </div>

                {/* Tags */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tags</label>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {editorData.tags.map(tag => (
                      <span key={tag} className="inline-flex items-center px-2.5 py-1 bg-ots-50 text-ots-600 rounded-full text-xs font-medium">
                        <Tag size={12} className="mr-1" />{tag}
                        <button onClick={() => removeTag(tag)} className="ml-1.5 text-ots-400 hover:text-red-500">
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
                      className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm bg-card text-gray-900"
                      placeholder="Add a tag and press Enter"
                    />
                    <button onClick={addTag} className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200">Add</button>
                  </div>
                </div>

                {/* Attachments */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">File Attachments</label>
                  {editorData.attachments.length > 0 && (
                    <div className="space-y-2 mb-3">
                      {editorData.attachments.map(att => (
                        <div key={att.id} className="flex items-center p-2 bg-gray-50 rounded border border-gray-200">
                          <FileText size={16} className="text-ots-600 mr-2 flex-shrink-0" />
                          <span className="text-sm text-gray-700 flex-1 truncate">{att.filename}</span>
                          <button onClick={() => removeAttachment(att.id)} className="text-gray-400 hover:text-red-500 ml-2">
                            <X size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <label className="inline-flex items-center px-3 py-2 bg-white border border-gray-300 rounded text-sm cursor-pointer hover:bg-gray-50">
                    <Paperclip size={14} className="mr-1.5" />
                    Attach File
                    <input type="file" onChange={handleAttachmentUpload} className="hidden" />
                  </label>
                </div>

                {/* Settings */}
                <div className="flex items-center gap-6">
                  <div className="flex items-center">
                    <input
                      id="comments"
                      type="checkbox"
                      checked={editorData.allowComments}
                      onChange={(e) => setEditorData(prev => ({ ...prev, allowComments: e.target.checked }))}
                      className="h-4 w-4 text-ots-600 focus:ring-ots-500 border-gray-300 rounded"
                    />
                    <label htmlFor="comments" className="ml-2 block text-sm text-gray-900">
                      Allow comments
                    </label>
                  </div>
                  <div className="flex items-center">
                    <label className="block text-sm text-gray-700 mr-2">Status:</label>
                    <select
                      value={editorData.status}
                      onChange={(e) => setEditorData(prev => ({ ...prev, status: e.target.value as 'draft' | 'published' }))}
                      className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-card text-gray-900 focus:ring-ots-500 focus:border-ots-500"
                    >
                      <option value="published">Published</option>
                      <option value="draft">Draft</option>
                    </select>
                  </div>
                </div>

                <div className="pt-4 border-t border-gray-100 flex justify-end space-x-3">
                  <button
                    onClick={() => navigateToFeed()}
                    className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={saveArticle}
                    disabled={!editorData.title}
                    className="px-4 py-2 bg-ots-600 text-white rounded-lg hover:bg-ots-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {editorData.id ? 'Update Article' : (editorData.status === 'draft' ? 'Save Draft' : 'Publish Article')}
                  </button>
                </div>

              </div>
            </div>
          )}

          {/* View: Admin */}
          {view === 'admin' && isAdmin && (
            <div className="max-w-4xl mx-auto">
              <div className="mb-6 flex items-center justify-between">
                <button onClick={() => navigateToFeed()} className="flex items-center text-gray-500 hover:text-gray-900 transition-colors">
                  <ChevronLeft size={20} className="mr-1" />
                  Back to Articles
                </button>
                <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
              </div>

              <div className="bg-card rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="flex border-b border-gray-200">
                  <button
                    onClick={() => setAdminTab('users')}
                    className={`flex-1 py-4 text-sm font-medium text-center transition-colors ${adminTab === 'users' ? 'text-ots-600 border-b-2 border-ots-600 bg-ots-50' : 'text-gray-500 hover:text-gray-900'}`}
                  >
                    User Management
                  </button>
                  <button
                    onClick={() => setAdminTab('sections')}
                    className={`flex-1 py-4 text-sm font-medium text-center transition-colors ${adminTab === 'sections' ? 'text-ots-600 border-b-2 border-ots-600 bg-ots-50' : 'text-gray-500 hover:text-gray-900'}`}
                  >
                    Section Management
                  </button>
                  <button
                    onClick={() => setAdminTab('editors')}
                    className={`flex-1 py-4 text-sm font-medium text-center transition-colors ${adminTab === 'editors' ? 'text-ots-600 border-b-2 border-ots-600 bg-ots-50' : 'text-gray-500 hover:text-gray-900'}`}
                  >
                    Section Editors
                  </button>
                </div>

                <div className="p-6">
                  {/* Users Tab */}
                  {adminTab === 'users' && (
                    <div className="space-y-6">
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead>
                            <tr>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Current Role</th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200">
                            {users.map(user => (
                              <tr key={user.id}>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <div className="flex items-center">
                                    <img className="h-10 w-10 rounded-full mr-3" src={user.avatar} alt="" />
                                    <div>
                                      <div className="text-sm font-medium text-gray-900">{user.name}</div>
                                      <div className="text-sm text-gray-500">ID: {user.id}</div>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${user.role === UserRole.ADMIN ? 'bg-purple-100 text-purple-800' :
                                    user.role === UserRole.EDITOR ? 'bg-green-100 text-green-800' :
                                      user.role === UserRole.USER ? 'bg-blue-100 text-blue-800' :
                                        'bg-gray-100 text-gray-800'
                                    }`}>
                                    {user.role}
                                  </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                  <div className="flex items-center space-x-2">
                                    <select
                                      value={user.role}
                                      onChange={(e) => handleRoleChange(user.id, e.target.value as UserRole)}
                                      className="border border-gray-300 rounded p-1 text-sm bg-card text-gray-900"
                                    >
                                      <option value={UserRole.GUEST}>Guest</option>
                                      <option value={UserRole.USER}>User</option>
                                      <option value={UserRole.EDITOR}>Editor</option>
                                      <option value={UserRole.ADMIN}>Admin</option>
                                    </select>
                                    <button
                                      onClick={() => handleDeleteUser(user.id)}
                                      className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50"
                                      title="Delete User"
                                    >
                                      <Trash2 size={16} />
                                    </button>
                                    <button
                                      onClick={() => { setResetPasswordUserId(user.id); setResetPasswordValue(''); }}
                                      className="text-amber-500 hover:text-amber-700 p-1 rounded hover:bg-amber-50"
                                      title="Reset Password"
                                    >
                                      <KeyRound size={16} />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Sections Tab */}
                  {adminTab === 'sections' && (
                    <div className="space-y-8">
                      {/* Add New Section */}
                      <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                        <h3 className="text-sm font-bold text-gray-900 mb-3 uppercase tracking-wide">Add New Section</h3>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={newSectionTitle}
                            onChange={(e) => setNewSectionTitle(e.target.value)}
                            placeholder="Section Title (e.g. 'Finance')"
                            className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-ots-500 bg-card text-gray-900"
                          />
                          <button
                            onClick={addSection}
                            disabled={!newSectionTitle}
                            className="bg-ots-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-ots-700 disabled:opacity-50"
                          >
                            Add Section
                          </button>
                        </div>
                      </div>

                      {/* Manage Subsections */}
                      <div>
                        <h3 className="text-sm font-bold text-gray-900 mb-3 uppercase tracking-wide">Manage Subsections</h3>
                        <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                            <div>
                              <label className="block text-xs font-semibold text-gray-500 mb-1">Select Parent Section</label>
                              <select
                                value={selectedSectionForSub}
                                onChange={(e) => setSelectedSectionForSub(e.target.value)}
                                className="w-full border border-gray-300 rounded px-3 py-2 text-sm bg-card text-gray-900"
                              >
                                <option value="">-- Select Section --</option>
                                {sections.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-gray-500 mb-1">New Subsection Title</label>
                              <div className="flex gap-2">
                                <input
                                  type="text"
                                  value={newSubsectionTitle}
                                  onChange={(e) => setNewSubsectionTitle(e.target.value)}
                                  placeholder="Subsection (e.g. 'Payroll')"
                                  className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm bg-card text-gray-900"
                                />
                                <button
                                  onClick={addSubsection}
                                  disabled={!newSubsectionTitle || !selectedSectionForSub}
                                  className="bg-ots-600 text-white px-3 py-2 rounded text-sm font-medium hover:bg-ots-700 disabled:opacity-50 whitespace-nowrap"
                                >
                                  Add
                                </button>
                              </div>
                            </div>
                          </div>

                          {/* List of sections preview */}
                          <div className="mt-6 border-t border-gray-200 pt-4">
                            <h4 className="text-xs font-semibold text-gray-500 mb-2">Current Structure</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {sections.map(s => (
                                <div key={s.id} className="bg-card border border-gray-200 rounded p-3 text-sm relative group">
                                  <div className="font-bold text-gray-900 flex items-center justify-between mb-2">
                                    <div className="flex items-center">
                                      <Settings size={14} className="mr-2 text-ots-500" />
                                      {s.title}
                                      <span className="text-xs font-normal text-gray-400 ml-2">({s.id})</span>
                                    </div>
                                    {pendingDeleteSectionId === s.id ? (
                                      <div className="flex items-center space-x-2">
                                        <span className="text-xs text-red-600 font-medium">Delete?</span>
                                        <button
                                          onClick={() => deleteSection(s.id)}
                                          className="text-xs bg-red-500 text-white px-2 py-0.5 rounded hover:bg-red-600"
                                        >
                                          Yes
                                        </button>
                                        <button
                                          onClick={() => setPendingDeleteSectionId(null)}
                                          className="text-xs bg-gray-200 text-gray-700 px-2 py-0.5 rounded hover:bg-gray-300"
                                        >
                                          No
                                        </button>
                                      </div>
                                    ) : (
                                      <button
                                        onClick={() => setPendingDeleteSectionId(s.id)}
                                        className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                        title="Delete Section"
                                      >
                                        <Trash2 size={14} />
                                      </button>
                                    )}
                                  </div>
                                  <div className="ml-6 space-y-1">
                                    {s.subsections?.map(sub => (
                                      <div key={sub.id} className="text-gray-600 flex items-center">
                                        <div className="w-1.5 h-1.5 rounded-full bg-gray-300 mr-2"></div>
                                        {sub.title}
                                      </div>
                                    ))}
                                    {(!s.subsections || s.subsections.length === 0) && (
                                      <span className="text-gray-400 italic text-xs">No subsections</span>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Section Editors Tab */}
                  {adminTab === 'editors' && (
                    <div className="space-y-8">
                      {/* Assign New Editor */}
                      <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                        <h3 className="text-sm font-bold text-gray-900 mb-3 uppercase tracking-wide">Assign Editor to Section</h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          <div>
                            <label className="block text-xs font-semibold text-gray-500 mb-1">User</label>
                            <select
                              id="editor-user-select"
                              className="w-full border border-gray-300 rounded px-3 py-2 text-sm bg-card text-gray-900"
                              defaultValue=""
                            >
                              <option value="">-- Select User --</option>
                              {users.filter(u => u.role !== UserRole.ADMIN).map(u => (
                                <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-gray-500 mb-1">Section</label>
                            <select
                              id="editor-section-select"
                              className="w-full border border-gray-300 rounded px-3 py-2 text-sm bg-card text-gray-900"
                              defaultValue=""
                            >
                              <option value="">-- Select Section --</option>
                              {sections.map(s => (
                                <option key={s.id} value={s.id}>{s.title}</option>
                              ))}
                            </select>
                          </div>
                          <div className="flex items-end">
                            <button
                              onClick={() => {
                                const userSel = (document.getElementById('editor-user-select') as HTMLSelectElement);
                                const secSel = (document.getElementById('editor-section-select') as HTMLSelectElement);
                                if (userSel.value && secSel.value) {
                                  handleAddSectionEditor(userSel.value, secSel.value);
                                  userSel.value = '';
                                  secSel.value = '';
                                }
                              }}
                              className="bg-ots-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-ots-700 transition-colors w-full"
                            >
                              <UserPlus size={14} className="inline mr-1.5" />
                              Assign Editor
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Current Assignments */}
                      <div>
                        <h3 className="text-sm font-bold text-gray-900 mb-3 uppercase tracking-wide">Current Section Editors</h3>
                        {sections.map(section => {
                          const editors = sectionEditors.filter(se => se.sectionId === section.id);
                          return (
                            <div key={section.id} className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-3">
                              <div className="flex items-center mb-3">
                                <Shield size={16} className="text-ots-500 mr-2" />
                                <span className="font-bold text-gray-900 text-sm">{section.title}</span>
                                <span className="text-xs text-gray-400 ml-2">({editors.length} editor{editors.length !== 1 ? 's' : ''})</span>
                              </div>
                              {editors.length > 0 ? (
                                <div className="space-y-2 ml-6">
                                  {editors.map(se => {
                                    const user = users.find(u => u.id === se.userId);
                                    if (!user) return null;
                                    return (
                                      <div key={`${se.userId}-${se.sectionId}`} className="flex items-center justify-between bg-card p-2 rounded border border-gray-100">
                                        <div className="flex items-center">
                                          <img src={user.avatar} alt="" className="h-6 w-6 rounded-full mr-2" />
                                          <span className="text-sm text-gray-800">{user.name}</span>
                                          <span className="text-xs text-gray-400 ml-2 capitalize">({user.role})</span>
                                        </div>
                                        <button
                                          onClick={() => handleRemoveSectionEditor(se.userId, se.sectionId)}
                                          className="text-red-400 hover:text-red-600 p-1 rounded hover:bg-red-50 transition-colors"
                                          title="Remove Editor"
                                        >
                                          <Trash2 size={14} />
                                        </button>
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : (
                                <p className="text-xs text-gray-400 italic ml-6">No editors assigned</p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* View: Digest Settings */}
          {view === 'digest' && currentUser && (
            <div className="max-w-2xl mx-auto">
              <div className="mb-6 flex items-center justify-between">
                <button onClick={() => navigateToFeed()} className="flex items-center text-gray-500 hover:text-gray-900 transition-colors">
                  <ChevronLeft size={20} className="mr-1" />
                  Back
                </button>
                <h1 className="text-2xl font-bold text-gray-900">Email Digest Settings</h1>
              </div>

              <div className="bg-card rounded-xl shadow-sm border border-gray-200 p-6 space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-gray-900 flex items-center"><Mail size={20} className="mr-2" />Email Digest</h3>
                    <p className="text-sm text-gray-500 mt-1">Receive a summary of new articles delivered to your inbox.</p>
                  </div>
                  <button
                    onClick={async () => {
                      const newEnabled = !digestPref.enabled;
                      const updated = await api.updateDigestPreference(currentUser.id, { enabled: newEnabled, frequency: digestPref.frequency });
                      setDigestPref(updated);
                    }}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${digestPref.enabled ? 'bg-ots-600' : 'bg-gray-300'}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${digestPref.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>

                {digestPref.enabled && (
                  <div className="border-t border-gray-100 pt-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Frequency</label>
                    <div className="flex gap-3">
                      {(['daily', 'weekly'] as const).map(freq => (
                        <button
                          key={freq}
                          onClick={async () => {
                            const updated = await api.updateDigestPreference(currentUser.id, { enabled: true, frequency: freq });
                            setDigestPref(updated);
                          }}
                          className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${digestPref.frequency === freq
                            ? 'bg-ots-600 text-white border-ots-600'
                            : 'bg-card text-gray-700 border-gray-300 hover:bg-gray-50'
                            }`}
                        >
                          {freq.charAt(0).toUpperCase() + freq.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                  <p className="text-xs text-gray-500">
                    <strong>Note:</strong> This is a preview of the digest settings experience. In a production deployment, this would connect to an email delivery service (e.g. SendGrid, SES) to send actual digest emails.
                  </p>
                </div>
              </div>
            </div>
          )}

        </main>
      </div>
      {/* Reset Password Modal */}
      {resetPasswordUserId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setResetPasswordUserId(null)} />
          <div className="relative bg-card rounded-xl shadow-2xl border border-gray-200 p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-bold text-gray-900 mb-1 flex items-center">
              <KeyRound size={20} className="mr-2 text-amber-500" />
              Reset Password
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              Set a new password for <strong>{users.find(u => u.id === resetPasswordUserId)?.name || 'this user'}</strong>
            </p>
            <input
              type="text"
              value={resetPasswordValue}
              onChange={(e) => setResetPasswordValue(e.target.value)}
              placeholder="Enter new password (min 4 chars)"
              className="block w-full border border-gray-300 rounded-lg px-4 py-2 mb-4 text-sm bg-card text-gray-900 focus:ring-ots-500 focus:border-ots-500"
              autoFocus
            />
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setResetPasswordUserId(null)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium text-sm"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (resetPasswordValue.length < 4) return;
                  await api.resetUserPassword(resetPasswordUserId, resetPasswordValue);
                  setResetPasswordUserId(null);
                  setResetPasswordValue('');
                }}
                disabled={resetPasswordValue.length < 4}
                className="px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Set Password
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDeleteConfirmId(null)} />
          <div className="relative bg-card rounded-xl shadow-2xl border border-gray-200 p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Delete Article</h3>
            <p className="text-sm text-gray-600 mb-6">Are you sure you want to delete this article? This action cannot be undone.</p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium text-sm"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteArticle(deleteConfirmId)}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium text-sm"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
      {loginModal}
    </div>
  );
}