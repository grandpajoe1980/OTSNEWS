import React from 'react';
import { Section } from '../types';
import { ChevronDown, ChevronRight, LayoutGrid, FileText } from 'lucide-react';

interface SidebarProps {
  sections: Section[];
  currentSection: string | undefined;
  currentSubsection: string | undefined;
  onNavigate: (sectionId?: string, subsectionId?: string) => void;
  isOpen: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({ sections, currentSection, currentSubsection, onNavigate, isOpen }) => {
  const [expandedSections, setExpandedSections] = React.useState<Record<string, boolean>>({
    'euc': true,
  });

  const toggleSection = (e: React.MouseEvent, sectionId: string) => {
    e.stopPropagation();
    setExpandedSections(prev => ({ ...prev, [sectionId]: !prev[sectionId] }));
  };

  const isSectionActive = (sectionId: string) => currentSection === sectionId && !currentSubsection;
  const isSubsectionActive = (subId: string) => currentSubsection === subId;

  if (!isOpen) return null;

  return (
    <aside className="w-64 bg-card border-r border-gray-200 h-[calc(100vh-64px)] overflow-y-auto sticky top-16 hidden md:block">
      <div className="p-4">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Sections</h2>
        <nav className="space-y-1">
          <button
            onClick={() => onNavigate()}
            className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
              !currentSection ? 'bg-ots-50 text-ots-600' : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            <LayoutGrid size={18} className="mr-3" />
            Feed
          </button>

          {sections.map((section) => (
            <div key={section.id} className="pt-2">
              <div 
                className={`flex items-center justify-between w-full px-3 py-2 text-sm font-medium rounded-md cursor-pointer transition-colors ${
                  isSectionActive(section.id) ? 'bg-ots-50 text-ots-600' : 'text-gray-700 hover:bg-gray-100'
                }`}
                onClick={() => onNavigate(section.id)}
              >
                <div className="flex items-center">
                  <FileText size={18} className="mr-3" />
                  {section.title}
                </div>
                {section.subsections && section.subsections.length > 0 && (
                  <button 
                    onClick={(e) => toggleSection(e, section.id)}
                    className="p-1 rounded-full hover:bg-gray-200 text-gray-400"
                  >
                    {expandedSections[section.id] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>
                )}
              </div>
              
              {/* Subsections */}
              {section.subsections && expandedSections[section.id] && (
                <div className="ml-9 mt-1 space-y-1 border-l-2 border-gray-100 pl-2">
                  {section.subsections.map(sub => (
                    <button
                      key={sub.id}
                      onClick={() => onNavigate(section.id, sub.id)}
                      className={`block w-full text-left px-3 py-2 text-sm rounded-md transition-colors ${
                        isSubsectionActive(sub.id) 
                          ? 'text-ots-600 font-medium bg-ots-50' 
                          : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
                      }`}
                    >
                      {sub.title}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>
      </div>
    </aside>
  );
};