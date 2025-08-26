import React, { useState } from 'react';
import { ThumbsUp, ThumbsDown, Copy, Check } from 'lucide-react';

export const Feedback = ({ answerId, contentToCopy }: { answerId: string; contentToCopy: string; }) => {
  const [feedback, setFeedback] = useState<'like' | 'dislike' | null>(null);
  const [isCopied, setIsCopied] = useState(false);

  const handleFeedback = (type: 'like' | 'dislike') => {
    if (feedback === type) {
      setFeedback(null); // Deselect
    } else {
      setFeedback(type);
    }
  };

  const handleCopy = () => {
    if (isCopied || !contentToCopy) return;
    navigator.clipboard.writeText(contentToCopy).then(() => {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000); // Revert icon after 2 seconds
    }).catch(err => {
      console.error('Failed to copy reply:', err);
    });
  };

  return (
    <div className="flex items-center space-x-1 md:opacity-0 group-hover:opacity-100 transition-opacity duration-fast">
      <button
        onClick={handleCopy}
        disabled={isCopied}
        className={`p-1.5 rounded-full transition-all duration-fast transform hover:scale-110 disabled:scale-100 ${
          isCopied
            ? 'bg-green-500/20 text-green-600 dark:text-green-400 cursor-default'
            : 'text-muted-light dark:text-muted-dark hover:text-text-light dark:hover:text-text-dark hover:bg-hint-light dark:hover:bg-hint-dark'
        }`}
        aria-label={isCopied ? "Copied to clipboard" : "Copy reply"}
      >
        {isCopied ? <Check strokeWidth={1.5} className="w-3.5 h-3.5" /> : <Copy strokeWidth={1.5} className="w-3.5 h-3.5" />}
      </button>
      <button
        onClick={() => handleFeedback('like')}
        className={`p-1.5 rounded-full transition-all duration-fast transform hover:scale-110 ${
          feedback === 'like' 
            ? 'bg-green-500/20 text-green-600 dark:text-green-400' 
            : 'text-muted-light dark:text-muted-dark hover:text-green-500 hover:bg-green-500/10 dark:hover:text-green-400 dark:hover:bg-green-500/20'
        }`}
        aria-label="Good answer"
      >
        <ThumbsUp strokeWidth={1.5} className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={() => handleFeedback('dislike')}
        className={`p-1.5 rounded-full transition-all duration-fast transform hover:scale-110 ${
          feedback === 'dislike' 
            ? 'bg-red-500/20 text-red-600 dark:text-red-400' 
            : 'text-muted-light dark:text-muted-dark hover:text-red-500 hover:bg-red-500/10 dark:hover:text-red-400 dark:hover:bg-red-500/20'
        }`}
        aria-label="Bad answer"
      >
        <ThumbsDown strokeWidth={1.5} className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};