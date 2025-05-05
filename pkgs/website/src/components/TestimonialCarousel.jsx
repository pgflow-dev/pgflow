import React, { useEffect, useRef } from 'react';
import { useSnapCarousel } from 'react-snap-carousel';

const testimonials = [
  {
    author: 'Revolutionary-Fact28',
    message:
      'This looks amazing! I built a system on edge functions but it was very complicated and took so much time. I will probably switch to this.',
  },
  {
    author: 'CjHuber',
    message:
      'Exactly what I was looking for without even knowing it. Thank you for saving me tons of time in my project.',
  },
  {
    author: 'bctreehugger',
    message:
      'Amazing work on taking the initiative to build this out. Watching closely and looking forward to using it once my project has a need for it.',
  },
  {
    author: 'bota01',
    message:
      "This is very needed and the product looks nice. Can't wait for it to be production ready.",
  },
  {
    author: 'Danish',
    message: 'Waiting for your amazing work to be production ready!',
  },
  {
    author: 'tomaspozo_',
    message: 'This sounds awesome! Looking forward to see it.',
  },
  {
    author: 'homj',
    message: "Sounds good, I'm looking forward to it!",
  },
];

export default function TestimonialCarousel() {
  const { scrollRef, next, activePageIndex, pages } = useSnapCarousel();
  const autoScrollTimerRef = useRef(null);

  useEffect(() => {
    // Auto-scroll every 7 seconds
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
    <div className="testimonial-carousel-wrapper">
      <ul
        ref={scrollRef}
        style={{
          display: 'flex',
          overflow: 'auto',
          scrollSnapType: 'x mandatory',
          padding: 0,
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
              textAlign: 'center',
              minHeight: '100px',
            }}
          >
            <blockquote
              style={{
                fontSize: '1.3rem',
                fontStyle: 'italic',
                margin: '0 0 1rem 0',
                lineHeight: 1.6,
              }}
            >
              "{testimonial.message}"
            </blockquote>
            <cite
              style={{
                fontSize: '1rem',
                opacity: 0.8,
                display: 'block',
              }}
            >
              — {testimonial.author}
            </cite>
          </li>
        ))}
      </ul>
    </div>
  );
}
