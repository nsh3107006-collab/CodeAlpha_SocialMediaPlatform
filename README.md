# Mini Social Media App
link: http://localhost:3001.

A small full-stack social media platform with user profiles, posts, comments, likes, follows, and JSON-file persistence.

## Features

- Authenticated user profiles
- Login and account registration
- Create posts
- Comment on posts
- Like and unlike posts
- Follow and unfollow users
- Persistent database in `data/db.json`

## Demo Login

- Email: `ava@example.com`
- Password: `demo123`

## Run

Use Node.js from your terminal:

```bash
node server.js
```

Then open:

```text
http://localhost:3001
```

This project is dependency-free so it can run without installing packages. The API is structured like an Express REST backend, but implemented with Node's built-in HTTP module to keep setup simple in this workspace.
