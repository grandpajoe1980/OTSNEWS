import React from 'react';
import { Article } from '../types';
import { MessageSquare, Clock } from 'lucide-react';

interface ArticleCardProps {
  article: Article;
  onClick: (id: string) => void;
}

export const ArticleCard: React.FC<ArticleCardProps> = ({ article, onClick }) => {
  return (
    <div 
      onClick={() => onClick(article.id)}
      className="bg-card rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow cursor-pointer flex flex-col h-full"
    >
      {article.imageUrl && (
        <div className="h-48 w-full bg-gray-200 relative overflow-hidden">
          <img 
            src={article.imageUrl} 
            alt={article.title} 
            className="w-full h-full object-cover"
          />
        </div>
      )}
      <div className="p-4 flex flex-col flex-grow">
        <div className="flex items-center text-xs text-gray-500 mb-2">
          <span className="font-semibold text-ots-600 uppercase tracking-wider">
            {article.subsectionId ? article.subsectionId.replace('-', ' ') : article.sectionId}
          </span>
          <span className="mx-2">•</span>
          <Clock size={12} className="mr-1" />
          {new Date(article.timestamp).toLocaleDateString()}
        </div>
        
        <h3 className="text-xl font-bold text-gray-900 mb-2 line-clamp-2 leading-tight">
          {article.title}
        </h3>
        
        <p className="text-gray-600 text-sm mb-4 line-clamp-3 flex-grow">
          {article.excerpt}
        </p>
        
        <div className="flex items-center justify-between pt-4 border-t border-gray-200 mt-auto">
          <div className="flex items-center">
            <span className="text-xs font-medium text-gray-700">By {article.authorName}</span>
          </div>
          {article.allowComments && (
            <div className="flex items-center text-gray-500 text-xs">
              <MessageSquare size={14} className="mr-1" />
              {article.comments.length}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};