import React, { useRef } from 'react';
import { Sun, Moon } from 'lucide-react';
import { flushSync } from 'react-dom';

export function AnimatedThemeToggler({ variant = 'circle', duration = 500, fromCenter = false, theme, toggleTheme }) {
  const buttonRef = useRef(null);

  const handleToggle = (e) => {
    if (!document.startViewTransition || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      toggleTheme();
      return;
    }

    const button = buttonRef.current;
    let x, y;
    if (fromCenter) {
      x = window.innerWidth / 2;
      y = window.innerHeight / 2;
    } else if (button) {
      const rect = button.getBoundingClientRect();
      x = rect.left + rect.width / 2;
      y = rect.top + rect.height / 2;
    } else {
      x = e.clientX;
      y = e.clientY;
    }

    // Set custom properties on the document root
    document.documentElement.style.setProperty('--transition-x', `${x}px`);
    document.documentElement.style.setProperty('--transition-y', `${y}px`);
    document.documentElement.style.setProperty('--transition-duration', `${duration}ms`);

    const transition = document.startViewTransition(() => {
      flushSync(() => {
        toggleTheme();
      });
    });
  };

  // Define CSS selectors for the View Transitions API dynamically based on the variant
  let clipPathStart = `circle(0px at var(--transition-x) var(--transition-y))`;
  let clipPathEnd = `circle(150% at var(--transition-x) var(--transition-y))`;

  if (variant === 'rectangle') {
    // Reveal as an expanding polygon rectangle from the button coordinates
    clipPathStart = `polygon(
      var(--transition-x) var(--transition-y), 
      var(--transition-x) var(--transition-y), 
      var(--transition-x) var(--transition-y), 
      var(--transition-x) var(--transition-y)
    )`;
    // Full screen polygon coordinates
    clipPathEnd = `polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)`;
  } else if (variant === 'square') {
    clipPathStart = `inset(50% 50% 50% 50%)`;
    clipPathEnd = `inset(0% 0% 0% 0%)`;
  } else if (variant === 'triangle') {
    clipPathStart = `polygon(var(--transition-x) var(--transition-y), var(--transition-x) var(--transition-y), var(--transition-x) var(--transition-y))`;
    clipPathEnd = `polygon(50% -50%, 150% 150%, -50% 150%)`;
  } else if (variant === 'diamond') {
    clipPathStart = `polygon(var(--transition-x) var(--transition-y), var(--transition-x) var(--transition-y), var(--transition-x) var(--transition-y), var(--transition-x) var(--transition-y))`;
    clipPathEnd = `polygon(50% -100%, 200% 50%, 50% 200%, -100% 50%)`;
  }

  return (
    <>
      <style>{`
        /* Disable standard cross-fade so we use the custom shape clip-path */
        ::view-transition-old(root),
        ::view-transition-new(root) {
          animation: none;
          mix-blend-mode: normal;
        }

        ::view-transition-old(root) {
          z-index: 1;
        }

        ::view-transition-new(root) {
          z-index: 9999;
          animation: view-reveal var(--transition-duration) cubic-bezier(0.4, 0, 0.2, 1) both;
        }

        @keyframes view-reveal {
          from {
            clip-path: ${clipPathStart};
          }
          to {
            clip-path: ${clipPathEnd};
          }
        }
      `}</style>
      <button
        ref={buttonRef}
        onClick={handleToggle}
        className="theme-toggle-btn"
        aria-label="Toggle theme"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          borderRadius: '50%',
          width: '32px',
          height: '32px',
          border: '1px solid var(--border-color)',
          backgroundColor: 'var(--bg-tertiary)',
          color: 'var(--text-primary)',
          transition: 'var(--transition-fast)'
        }}
      >
        {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
      </button>
    </>
  );
}
