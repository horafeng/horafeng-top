# Horafeng Blog Diary Zone (Phase 1)

A mobile-first diary section baseline for a personal blog.

## Features

- Diary feed homepage (`index.html`)
- Diary detail page (`entry.html`)
- Tags and archive structure (`tags.html`)
- Responsive layout (single-column mobile, three-column desktop)
- Local content file data source (`content/diaries.json`)
- Only supports text, emoji and web links in diary content

## Run locally

Use any static file server. Example with Python:

```bash
python -m http.server 5173
```

Then open:

- http://localhost:5173/index.html

## Project structure

```text
assets/
  css/diary.css
  js/common.js
  js/index.js
  js/entry.js
  js/tags.js
content/
  diaries.json
index.html
entry.html
tags.html
.gitignore
```
