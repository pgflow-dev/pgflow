Hey there! Let me tell you about PGFlow 👋

Quick heads up: I'm keeping the code under wraps for now – not because I'm being secretive, but because I want to make sure everything's properly documented and polished before sharing it with the world. Having ADHD means I need to be extra thoughtful about how I structure projects like this. But don't worry! I've been absolutely laser-focused on pgflow for the past 7 weeks, and I can't wait to share what I've built.

A bit about me and how this started

I'm Wojtek (you can call me jumski), and I kicked off 2024 with a pretty big life change – I took a sabbatical. After grinding away in tech for years, I needed to step back, catch my breath, and figure out what really excites me.

During my time off, I fell head over heels for Supabase. I kept building different projects with it, and the more I used it, the more I loved how it made Postgres feel so accessible. But there was this one thing that kept bugging me – I couldn't find a workflow engine that felt like it truly belonged in the Supabase ecosystem. I looked everywhere, but nothing quite hit the mark. What I really wanted was something that would:

Let me kick off workflows straight from SQL and REST API (via RPC calls)

Show me what's happening in real-time through the Realtime API

Work with my existing setup instead of making me rebuild everything

Give me a simple, type-safe way to connect all the pieces

The funny thing is, none of the solutions out there were actually keeping workflows in the database itself. They all needed extra stuff that just complicated everything and broke away from that nice "it's just Postgres with goodies" feeling that makes Supabase so great.

As my sabbatical was winding down, I wanted to create something meaningful – partly to quiet that little voice of self-doubt that shows up during career changes, but mostly to give something back to this amazing community that's changed how I think about building software. After spending 13 years in Ruby on Rails, finding the Supabase ecosystem felt like discovering a new home, and I wanted to contribute something special. That's how PGFlow was born – it's my way of saying thanks while building something I genuinely needed myself.

So what exactly is PGFlow?

Think of PGFlow as your friendly neighborhood workflow engine that lives right inside Postgres and plays perfectly with Supabase. It uses Postgres for all the important stuff – storing workflow definitions, keeping track of what's running, figuring out what needs to happen next, and making sure everything runs smoothly.

Right now, it runs tasks through Edge Functions, but I'm planning to add support for other options too. I'm even thinking about fun features like "Human Approval via Slack message" (which would be super easy to add since everything revolves around Postgres and Supabase).

I've put my heart into making this tool actually fun to use. You get:

A TypeScript DSL that won't let you mess up your types

A CLI tool that gets you up and running in literally one minute

A straightforward JS SDK for running and watching your flows

A flexible SQL core that's ready for whatever creative ideas you throw at it

[Insert screenshot of flow visualization or UI with caption, e.g., "PGFlow in action - pretty cool, right?"]

[Optional: Insert code snippet showcasing the DSL with caption, e.g., "Here's how easy it is to set up workflows with PGFlow"]

Where things stand now

I've spent the last 7 weeks turning this idea into reality. Solid 7 weeks of ADHD hyper focus and working on weekends because I enjoy it.

After a few different attempts and prototypes, I've landed on an architecture that really works (and yes, it's all tested with pgTAP!).

So far, I've got:

A solid SQL core that handles all the behind-the-scenes magic

A nice TypeScript DSL that makes defining workflows a breeze

Edge function workers that actually work (though I'm working on making them even better)

The basic pieces are all there – now I just need to polish up the frontend JS SDK, which is where I'd love some help from the community.

Want to help shape PGFlow?

If you've ever felt frustrated with existing workflow tools, I'd love to have you try out PGFlow. I'm looking for people who want to help make this tool even better.

I've got everything you need to get started:

📚 Clear documentation that won't make your head spin  
🚀 A CLI tool that just works  
💻 A type-safe DSL that's actually pleasant to use  
💬 A friendly Discord server where we can chat and help each other out

Let's keep in touch!

Thanks for reading all this! If you're intrigued, I'd love to hear from you. Check out pgflow.dev or drop me a line at hello@pgflow.dev.

If you're interested in being part of the beta testing crew, just let me know – I'd be thrilled to have you join us! 🌟
