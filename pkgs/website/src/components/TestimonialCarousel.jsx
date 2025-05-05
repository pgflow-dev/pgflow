import React, { useEffect, useRef } from 'react';
import { useSnapCarousel } from 'react-snap-carousel';

const testimonials = [
  {
    author: 'Revolutionary-Fact28',
    source: 'Reddit',
    message:
      'This looks amazing! I built a system on edge functions but it was very complicated and took so much time. I will probably switch to this.',
  },
  {
    author: 'CjHuber',
    source: 'Hacker News',
    message:
      'Exactly what I was looking for without even knowing it. Thank you for saving me tons of time in my project.',
  },
  {
    author: 'bctreehugger',
    source: 'Reddit',
    message:
      'Amazing work on taking the initiative to build this out. Watching closely and looking forward to using it once my project has a need for it.',
  },
  {
    author: 'bota01',
    source: 'Reddit',
    message:
      "This is very needed and the product looks nice. Can't wait for it to be production ready.",
  },
  {
    author: 'Danish',
    source: 'Discord',
    message: 'Waiting for your amazing work to be production ready!',
  },
  {
    author: 'tomaspozo_',
    source: 'Discord',
    message: 'This sounds awesome! Looking forward to see it.',
  },
  {
    author: 'homj',
    source: 'Discord',
    message: "Sounds good, I'm looking forward to it!",
  },
];

export default function TestimonialCarousel() {
  const { scrollRef, next, prev, activePageIndex, pages, goTo } = useSnapCarousel();
  const autoScrollTimerRef = useRef(null);

  useEffect(() => {
    // Auto-scroll every 10 seconds
    autoScrollTimerRef.current = setInterval(() => {
      next();
    }, 10000);

    // Cleanup on unmount
    return () => {
      if (autoScrollTimerRef.current) {
        clearInterval(autoScrollTimerRef.current);
      }
    };
  }, [next]);

  return (
    <div className="testimonial-carousel-wrapper" style={{ position: 'relative' }}>
      {/* Previous button */}
      <button
        onClick={() => {
          if (autoScrollTimerRef.current) {
            clearInterval(autoScrollTimerRef.current);
            
            // Restart auto-scroll after manual navigation
            autoScrollTimerRef.current = setInterval(() => {
              next();
            }, 10000);
          }
          
          // If at the first slide, go to the last slide
          if (activePageIndex === 0) {
            goTo(pages.length - 1); // Go to the last slide
          } else {
            prev();
          }
        }}
        aria-label="Previous testimonial"
        style={{
          position: 'absolute',
          left: '-50px',
          top: '30%',
          zIndex: 10,
          border: 'none',
          background: 'none',
          color: 'var(--sl-color-accent)',
          cursor: 'pointer',
          fontSize: '2.5rem',
          fontWeight: '900',
          padding: 0,
          transition: 'color 0.2s',
        }}
        onMouseOver={(e) => e.currentTarget.style.color = 'var(--sl-color-accent-high)'}
        onMouseOut={(e) => e.currentTarget.style.color = 'var(--sl-color-accent)'}
      >
        ←
      </button>
      
      <ul
        ref={scrollRef}
        style={{
          display: 'flex',
          overflow: 'auto',
          scrollSnapType: 'x mandatory',
          padding: '1rem 0',
          margin: 0,
          listStyle: 'none',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
        }}
      >
        {testimonials.map((testimonial, i) => (
          <li
            key={i}
            style={{
              width: '100%',
              flexShrink: 0,
              scrollSnapAlign: 'start',
              padding: '1rem',
              textAlign: 'left',
              minHeight: '100px',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                marginBottom: '0.5rem',
              }}
            >
              <div style={{ fontWeight: 'bold' }}>@{testimonial.author}</div>
              <div
                style={{
                  fontSize: '0.9rem',
                  color: 'var(--color-text-secondary, #6b7280)',
                  marginLeft: '0.5rem',
                }}
              >
                ({testimonial.source})
              </div>
            </div>
            <blockquote
              style={{
                fontSize: '1.35rem',
                fontStyle: 'italic',
                margin: '0 0 1rem 0',
                lineHeight: 1.6,
              }}
            >
              {testimonial.message}
            </blockquote>
          </li>
        ))}
      </ul>
      
      {/* Next button */}
      <button
        onClick={() => {
          if (autoScrollTimerRef.current) {
            clearInterval(autoScrollTimerRef.current);
            
            // Restart auto-scroll after manual navigation
            autoScrollTimerRef.current = setInterval(() => {
              next();
            }, 10000);
          }
          
          // If at the last slide, go to the first slide
          if (activePageIndex === pages.length - 1) {
            goTo(0); // Go to the first slide (index 0)
          } else {
            next();
          }
        }}
        aria-label="Next testimonial"
        style={{
          position: 'absolute',
          right: '-50px',
          top: '30%',
          zIndex: 10,
          border: 'none',
          background: 'none',
          color: 'var(--sl-color-accent)',
          cursor: 'pointer',
          fontSize: '2.5rem',
          fontWeight: '900',
          padding: 0,
          transition: 'color 0.2s',
        }}
        onMouseOver={(e) => e.currentTarget.style.color = 'var(--sl-color-accent-high)'}
        onMouseOut={(e) => e.currentTarget.style.color = 'var(--sl-color-accent)'}
      >
        →
      </button>
      
    </div>
  );
}
