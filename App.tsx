import React, { useState, useMemo, useEffect } from 'react';
import { User, Article, UserRole, Comment, Theme, Section } from './types';
import { MOCK_USERS, SECTIONS, INITIAL_ARTICLES } from './constants';
import { Sidebar } from './components/Sidebar';
import { ArticleCard } from './components/ArticleCard';
import { RichTextEditor } from './components/RichTextEditor';
import { Menu, Search, Bell, LogOut, Plus, ChevronLeft, Send, Hash, User as UserIcon, MessageSquare, Sun, Moon, Crown, Settings, Trash2, Shield, UserPlus, ArrowLeft } from 'lucide-react';

type ViewMode = 'feed' | 'section' | 'article' | 'editor' | 'login' | 'admin';

export default function App() {
  // --- Global State ---
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [articles, setArticles] = useState<Article[]>(INITIAL_ARTICLES);
  const [users, setUsers] = useState<User[]>(MOCK_USERS);
  const [sections, setSections] = useState<Section[]>(SECTIONS);
  const [view, setView] = useState<ViewMode>('login');
  const [theme, setTheme] = useState<Theme>('light');
  
  // --- Navigation State ---
  const [activeSectionId, setActiveSectionId] = useState<string | undefined>(undefined);
  const [activeSubsectionId, setActiveSubsectionId] = useState<string | undefined>(undefined);
  const [activeArticleId, setActiveArticleId] = useState<string | undefined>(undefined);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // --- Admin State ---
  const [adminTab, setAdminTab] = useState<'users' | 'sections'>('users');
  const [newSectionTitle, setNewSectionTitle] = useState('');
  const [newSubsectionTitle, setNewSubsectionTitle] = useState('');
  const [selectedSectionForSub, setSelectedSectionForSub] = useState<string>('');

  // --- Registration State ---
  const [isRegistering, setIsRegistering] = useState(false);
  const [regName, setRegName] = useState('');

  // --- Editor State ---
  const [editorData, setEditorData] = useState<{
    id?: string;
    title: string;
    sectionId: string;
    subsectionId: string;
    content: string;
    excerpt: string;
    allowComments: boolean;
  }>({
    title: '',
    sectionId: 'euc',
    subsectionId: '',
    content: '<p>Start typing...</p>',
    excerpt: '',
    allowComments: true
  });

  // --- Theme Effect ---
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const cycleTheme = () => {
    if (theme === 'light') setTheme('dark');
    else if (theme === 'dark') setTheme('princess');
    else setTheme('light');
  };

  // --- Derived State ---
  const filteredArticles = useMemo(() => {
    let filtered = [...articles].sort((a, b) => b.timestamp - a.timestamp);
    if (activeSectionId) {
      filtered = filtered.filter(a => a.sectionId === activeSectionId);
    }
    if (activeSubsectionId) {
      filtered = filtered.filter(a => a.subsectionId === activeSubsectionId);
    }
    return filtered;
  }, [articles, activeSectionId, activeSubsectionId]);

  const currentArticle = useMemo(() => 
    articles.find(a => a.id === activeArticleId), 
  [articles, activeArticleId]);

  // --- Actions ---
  const handleLogin = (userId: string) => {
    const user = users.find(u => u.id === userId);
    if (user) {
      setCurrentUser(user);
      setView('feed');
    }
  };

  const handleRegister = () => {
    if (!regName.trim()) return;
    const newUser: User = {
      id: `u_${Date.now()}`,
      name: regName,
      role: UserRole.USER, // Default to User
      avatar: `https://picsum.photos/seed/${regName.replace(/\s/g, '')}/50/50`,
    };
    setUsers(prev => [...prev, newUser]);
    setCurrentUser(newUser);
    setView('feed');
    setRegName('');
    setIsRegistering(false);
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setView('login');
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
      });
    } else {
      setEditorData({
        title: '',
        sectionId: 'euc',
        subsectionId: '',
        content: '<p>Start writing your article...</p>',
        excerpt: '',
        allowComments: true
      });
    }
    setView('editor');
  };

  const saveArticle = () => {
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
      imageUrl: 'https://picsum.photos/800/400', 
    };

    if (editorData.id) {
      setArticles(prev => prev.map(a => a.id === editorData.id ? newArticle : a));
    } else {
      setArticles(prev => [newArticle, ...prev]);
    }
    
    navigateToSection(newArticle.sectionId, newArticle.subsectionId);
  };

  const postComment = (text: string) => {
    if (!currentUser || !currentArticle) return;
    const newComment: Comment = {
      id: `c_${Date.now()}`,
      authorId: currentUser.id,
      authorName: currentUser.name,
      authorAvatar: currentUser.avatar,
      content: text,
      timestamp: Date.now(),
    };

    const updatedArticle = {
      ...currentArticle,
      comments: [...currentArticle.comments, newComment],
    };

    setArticles(prev => prev.map(a => a.id === currentArticle.id ? updatedArticle : a));
  };

  // --- Admin Actions ---
  const handleRoleChange = (userId: string, newRole: UserRole) => {
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u));
  };

  const handleDeleteUser = (userId: string) => {
    if (currentUser?.id === userId) {
      alert("You cannot delete yourself.");
      return;
    }
    if (confirm("Are you sure you want to delete this user?")) {
      setUsers(prev => prev.filter(u => u.id !== userId));
    }
  };

  const addSection = () => {
    if (!newSectionTitle.trim()) return;
    const id = newSectionTitle.toLowerCase().replace(/\s+/g, '-');
    setSections(prev => [...prev, { id, title: newSectionTitle, subsections: [] }]);
    setNewSectionTitle('');
  };

  const deleteSection = (sectionId: string) => {
    if (confirm("Are you sure you want to delete this section? All articles in it will remain but may be hidden from navigation.")) {
      setSections(prev => prev.filter(s => s.id !== sectionId));
      if (activeSectionId === sectionId) {
        navigateToFeed();
      }
    }
  };

  const addSubsection = () => {
    if (!newSubsectionTitle.trim() || !selectedSectionForSub) return;
    const id = newSubsectionTitle.toLowerCase().replace(/\s+/g, '-');
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

  const canEdit = currentUser?.role === UserRole.ADMIN || currentUser?.role === UserRole.EDITOR;
  const canComment = currentUser?.role !== UserRole.GUEST;
  const isAdmin = currentUser?.role === UserRole.ADMIN;

  // --- Views ---

  if (view === 'login') {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div className="bg-card p-8 rounded-2xl shadow-xl max-w-md w-full">
          <div className="flex flex-col items-center mb-8">
            <div className="h-16 w-16 bg-ots-600 rounded-xl flex items-center justify-center mb-4 shadow-lg rotate-3">
              <span className="text-white font-bold text-2xl tracking-tighter">OTS</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900">OTS NEWS</h1>
            <p className="text-gray-500 text-sm mt-2 text-center">Internal Communication Platform</p>
          </div>
          
          {isRegistering ? (
            <div className="space-y-4">
               <div className="flex items-center mb-4">
                 <button onClick={() => setIsRegistering(false)} className="text-gray-500 hover:text-gray-700">
                   <ArrowLeft size={20} />
                 </button>
                 <span className="ml-2 font-bold text-gray-700">Create Account</span>
               </div>
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
               <button 
                 onClick={handleRegister}
                 disabled={!regName.trim()}
                 className="w-full bg-ots-600 text-white py-2 rounded-lg font-medium hover:bg-ots-700 transition-colors disabled:opacity-50"
               >
                 Join & Login
               </button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-gray-400 uppercase mb-2">Select a Role Demo</p>
              {users.map(user => (
                <button
                  key={user.id}
                  onClick={() => handleLogin(user.id)}
                  className="w-full flex items-center p-3 rounded-lg border border-gray-200 hover:border-ots-500 hover:bg-ots-50 transition-all group bg-card"
                >
                  <img src={user.avatar} alt={user.name} className="w-8 h-8 rounded-full mr-3" />
                  <div className="flex flex-col items-start">
                    <span className="text-sm font-semibold text-gray-700 group-hover:text-ots-700">{user.name}</span>
                    <span className="text-xs text-gray-400 capitalize">{user.role}</span>
                  </div>
                </button>
              ))}
              
              <button 
                onClick={() => setIsRegistering(true)}
                className="w-full flex items-center justify-center p-3 rounded-lg border border-dashed border-gray-300 text-gray-500 hover:bg-gray-50 hover:text-ots-600 transition-all mt-4"
              >
                <UserPlus size={18} className="mr-2" />
                <span className="text-sm font-medium">Register New User</span>
              </button>
            </div>
          )}
          
          <div className="mt-8 flex justify-center">
            <button 
              onClick={cycleTheme}
              className="p-2 text-gray-500 hover:bg-gray-100 rounded-full transition-colors flex items-center space-x-2 text-xs"
            >
              {theme === 'light' ? <Sun size={16} /> : theme === 'dark' ? <Moon size={16} /> : <Crown size={16} />}
              <span className="capitalize">{theme} Mode</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

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
              className="block w-full pl-10 pr-3 py-2 border border-gray-200 rounded-full leading-5 bg-gray-50 text-gray-900 placeholder-gray-400 focus:outline-none focus:bg-card focus:ring-1 focus:ring-ots-500 focus:border-ots-500 sm:text-sm transition-colors" 
            />
          </div>
        </div>

        <div className="flex items-center space-x-3">
          {canEdit && (
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

          <button className="p-2 text-gray-500 hover:bg-gray-100 rounded-full relative">
            <Bell size={20} />
            <span className="absolute top-1.5 right-1.5 block h-2 w-2 rounded-full ring-2 ring-white bg-red-500"></span>
          </button>
          <div className="h-8 w-px bg-gray-200 mx-2"></div>
          <div className="flex items-center space-x-2">
             <img src={currentUser?.avatar} alt="Profile" className="h-8 w-8 rounded-full border border-gray-200" />
             <div className="hidden lg:flex flex-col">
                <span className="text-xs font-semibold text-gray-700 leading-none">{currentUser?.name}</span>
                <span className="text-[10px] text-gray-500 capitalize leading-none mt-1">{currentUser?.role}</span>
             </div>
          </div>
          <button onClick={handleLogout} className="ml-2 p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors">
            <LogOut size={18} />
          </button>
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
                    {activeSectionId ? 'Latest updates from this section' : 'Curated news for you'}
                   </p>
                </div>
              </div>

              {filteredArticles.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 bg-card rounded-xl shadow-sm border border-gray-200">
                  <div className="p-4 bg-gray-50 rounded-full mb-4">
                    <Hash className="text-gray-400" size={32} />
                  </div>
                  <p className="text-gray-500 font-medium">No articles found in this section.</p>
                  {canEdit && (
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
                 {/* Metadata */}
                 <div className="flex items-center justify-between mb-8 pb-8 border-b border-gray-100">
                   <div className="flex items-center">
                     <img src={users.find(u => u.id === currentArticle.authorId)?.avatar} className="w-10 h-10 rounded-full mr-3" alt="" />
                     <div>
                       <div className="text-sm font-bold text-gray-900">{currentArticle.authorName}</div>
                       <div className="text-xs text-gray-500">{new Date(currentArticle.timestamp).toLocaleDateString()} • 5 min read</div>
                     </div>
                   </div>
                   {canEdit && (currentUser?.role === UserRole.ADMIN || currentUser?.id === currentArticle.authorId) && (
                     <button 
                       onClick={() => navigateToEditor(currentArticle)}
                       className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md text-sm font-medium hover:bg-gray-200 transition-colors"
                     >
                       Edit Article
                     </button>
                   )}
                 </div>

                 {/* Content */}
                 <div className="prose prose-blue max-w-none mb-12" dangerouslySetInnerHTML={{ __html: currentArticle.content }} />

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
                       {/* Comment List */}
                       <div className="space-y-6 mb-8">
                         {currentArticle.comments.length > 0 ? (
                           currentArticle.comments.map(comment => (
                             <div key={comment.id} className="flex gap-4">
                               <img src={comment.authorAvatar} alt="" className="w-8 h-8 rounded-full flex-shrink-0" />
                               <div className="flex-1 bg-card p-4 rounded-lg shadow-sm border border-gray-100">
                                 <div className="flex items-baseline justify-between mb-1">
                                   <span className="text-sm font-bold text-gray-900">{comment.authorName}</span>
                                   <span className="text-xs text-gray-400">{new Date(comment.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                                 </div>
                                 <p className="text-sm text-gray-700">{comment.content}</p>
                               </div>
                             </div>
                           ))
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
                               if(input.value.trim()) {
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
                         <div className="text-center bg-yellow-50 p-3 rounded text-yellow-700 text-sm">
                           Please log in with a User account to comment.
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
                    onChange={(e) => setEditorData(prev => ({...prev, title: e.target.value}))}
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
                      onChange={(e) => setEditorData(prev => ({...prev, sectionId: e.target.value, subsectionId: ''}))}
                      className="block w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-ots-500 focus:border-ots-500 bg-card text-gray-900"
                    >
                      {sections.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Subsection (Optional)</label>
                    <select 
                      value={editorData.subsectionId}
                      onChange={(e) => setEditorData(prev => ({...prev, subsectionId: e.target.value}))}
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
                    onChange={(e) => setEditorData(prev => ({...prev, excerpt: e.target.value}))}
                    rows={2}
                    className="block w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-ots-500 focus:border-ots-500 bg-card text-gray-900"
                    placeholder="A short summary for the card view..."
                  />
                </div>

                {/* Rich Editor */}
                <div>
                  <RichTextEditor 
                    value={editorData.content} 
                    onChange={(val) => setEditorData(prev => ({...prev, content: val}))} 
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Tip: Switch to "Code" view to fine-tune HTML structure.
                  </p>
                </div>

                {/* Settings */}
                <div className="flex items-center">
                   <input 
                    id="comments" 
                    type="checkbox" 
                    checked={editorData.allowComments}
                    onChange={(e) => setEditorData(prev => ({...prev, allowComments: e.target.checked}))}
                    className="h-4 w-4 text-ots-600 focus:ring-ots-500 border-gray-300 rounded"
                  />
                  <label htmlFor="comments" className="ml-2 block text-sm text-gray-900">
                    Allow comments on this article
                  </label>
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
                    {editorData.id ? 'Update Article' : 'Publish Article'}
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
                                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                    user.role === UserRole.ADMIN ? 'bg-purple-100 text-purple-800' :
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
                                      <button 
                                        onClick={() => deleteSection(s.id)}
                                        className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                        title="Delete Section"
                                      >
                                        <Trash2 size={14} />
                                      </button>
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
                </div>
              </div>
            </div>
          )}

        </main>
      </div>
    </div>
  );
}