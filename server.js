const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { URL } = require("url");

const PORT = process.env.PORT || 3001;
const PUBLIC_DIR = path.join(__dirname, "public");
const DATA_DIR = path.join(__dirname, "data");
const DB_PATH = path.join(DATA_DIR, "db.json");

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg"
};

const seedDb = {
  users: [
    {
      id: "u1",
      name: "Ava Patel",
      username: "ava",
      email: "ava@example.com",
      bio: "Frontend student building tiny useful things.",
      avatar: "AP",
      passwordHash: hashPassword("demo123")
    },
    {
      id: "u2",
      name: "Noah Kim",
      username: "noah",
      email: "noah@example.com",
      bio: "Backend learner, coffee-fueled bug hunter.",
      avatar: "NK",
      passwordHash: hashPassword("demo123")
    },
    {
      id: "u3",
      name: "Mia Santos",
      username: "mia",
      email: "mia@example.com",
      bio: "Design notes, project demos, and class updates.",
      avatar: "MS",
      passwordHash: hashPassword("demo123")
    }
  ],
  posts: [
    {
      id: "p1",
      userId: "u1",
      body: "Finished the profile card layout today. Tiny progress still counts.",
      createdAt: "2026-05-20T09:10:00.000Z",
      likes: ["u2", "u3"]
    },
    {
      id: "p2",
      userId: "u2",
      body: "Added database persistence for posts and comments. The app survives refreshes now.",
      createdAt: "2026-05-20T10:05:00.000Z",
      likes: ["u1"]
    }
  ],
  comments: [
    {
      id: "c1",
      postId: "p1",
      userId: "u3",
      body: "Looks clean. The spacing feels much better.",
      createdAt: "2026-05-20T09:30:00.000Z"
    },
    {
      id: "c2",
      postId: "p2",
      userId: "u1",
      body: "Nice, that makes testing way easier.",
      createdAt: "2026-05-20T10:20:00.000Z"
    }
  ],
  followers: [
    { followerId: "u1", followingId: "u2" },
    { followerId: "u2", followingId: "u1" },
    { followerId: "u3", followingId: "u1" }
  ],
  sessions: []
};

function hashPassword(password) {
  return crypto.createHash("sha256").update(String(password)).digest("hex");
}

function ensureDb() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify(seedDb, null, 2));
  }
}

function readDb() {
  ensureDb();
  return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
}

function writeDb(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function sendError(res, status, message) {
  sendJson(res, status, { error: message });
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("Request body is too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function createId(prefix) {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

function createToken() {
  return crypto.randomBytes(24).toString("hex");
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function publicUser(user) {
  if (!user) return null;
  const { passwordHash, ...safeUser } = user;
  return safeUser;
}

function getCurrentUser(req, reqUrl, db) {
  const auth = req.headers.authorization || "";
  const bearerToken = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const token = bearerToken || reqUrl.searchParams.get("token");
  if (!token || !Array.isArray(db.sessions)) return null;

  const session = db.sessions.find(candidate => candidate.token === token);
  if (!session) return null;

  return db.users.find(user => user.id === session.userId) || null;
}

function requireUser(req, res, reqUrl, db) {
  const user = getCurrentUser(req, reqUrl, db);
  if (!user) {
    sendError(res, 401, "Please log in first");
    return null;
  }
  return user;
}

function decoratePost(post, db, currentUserId) {
  const author = publicUser(db.users.find(user => user.id === post.userId));
  const comments = db.comments
    .filter(comment => comment.postId === post.id)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    .map(comment => ({
      ...comment,
      author: publicUser(db.users.find(user => user.id === comment.userId))
    }));

  return {
    ...post,
    author,
    comments,
    likeCount: post.likes.length,
    likedByCurrentUser: currentUserId ? post.likes.includes(currentUserId) : false
  };
}

function getStats(userId, db) {
  return {
    postCount: db.posts.filter(post => post.userId === userId).length,
    followerCount: db.followers.filter(row => row.followingId === userId).length,
    followingCount: db.followers.filter(row => row.followerId === userId).length
  };
}

function getProfile(userId, db, currentUserId) {
  const user = db.users.find(candidate => candidate.id === userId);
  if (!user) return null;

  return {
    ...publicUser(user),
    stats: getStats(userId, db),
    followedByCurrentUser: currentUserId ? db.followers.some(row => row.followerId === currentUserId && row.followingId === userId) : false
  };
}

function serveStatic(req, res, pathname) {
  const safePath = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.normalize(path.join(PUBLIC_DIR, safePath));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendError(res, 403, "Forbidden");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      sendError(res, 404, "Not found");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": mimeTypes[ext] || "application/octet-stream" });
    res.end(content);
  });
}

async function handleApi(req, res, reqUrl) {
  const db = readDb();
  db.sessions = db.sessions || [];
  const pathname = reqUrl.pathname;
  const currentUser = getCurrentUser(req, reqUrl, db);
  const currentUserId = currentUser ? currentUser.id : null;

  if (req.method === "GET" && pathname === "/api/session") {
    sendJson(res, 200, {
      currentUser: currentUser ? getProfile(currentUser.id, db, currentUser.id) : null,
      users: db.users.map(user => getProfile(user.id, db, currentUserId))
    });
    return;
  }

  if (req.method === "POST" && pathname === "/api/auth/login") {
    const body = await parseBody(req);
    const email = normalizeEmail(body.email);
    const password = String(body.password || "");
    const user = db.users.find(candidate => normalizeEmail(candidate.email) === email);

    if (!user || user.passwordHash !== hashPassword(password)) {
      sendError(res, 401, "Invalid email or password");
      return;
    }

    const token = createToken();
    db.sessions.push({ token, userId: user.id, createdAt: new Date().toISOString() });
    writeDb(db);
    sendJson(res, 200, { token, currentUser: getProfile(user.id, db, user.id) });
    return;
  }

  if (req.method === "POST" && pathname === "/api/auth/register") {
    const body = await parseBody(req);
    const name = String(body.name || "").trim();
    const username = String(body.username || "").trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
    const email = normalizeEmail(body.email);
    const password = String(body.password || "");

    if (name.length < 2 || username.length < 3 || email.length < 5 || password.length < 6) {
      sendError(res, 422, "Name, username, email, and a 6 character password are required");
      return;
    }

    if (db.users.some(user => normalizeEmail(user.email) === email)) {
      sendError(res, 409, "Email is already registered");
      return;
    }

    if (db.users.some(user => user.username === username)) {
      sendError(res, 409, "Username is already taken");
      return;
    }

    const user = {
      id: createId("u"),
      name,
      username,
      email,
      bio: "New here and ready to post updates.",
      avatar: name.split(/\s+/).map(part => part[0]).join("").slice(0, 2).toUpperCase(),
      passwordHash: hashPassword(password)
    };
    const token = createToken();

    db.users.push(user);
    db.sessions.push({ token, userId: user.id, createdAt: new Date().toISOString() });
    writeDb(db);
    sendJson(res, 201, { token, currentUser: getProfile(user.id, db, user.id) });
    return;
  }

  if (req.method === "POST" && pathname === "/api/auth/logout") {
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : reqUrl.searchParams.get("token");
    db.sessions = db.sessions.filter(session => session.token !== token);
    writeDb(db);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "GET" && pathname === "/api/posts") {
    const posts = db.posts
      .slice()
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .map(post => decoratePost(post, db, currentUserId));
    sendJson(res, 200, { posts });
    return;
  }

  if (req.method === "POST" && pathname === "/api/posts") {
    const user = requireUser(req, res, reqUrl, db);
    if (!user) return;

    const body = await parseBody(req);
    const text = String(body.body || "").trim();

    if (text.length < 1 || text.length > 280) {
      sendError(res, 422, "Post must be between 1 and 280 characters");
      return;
    }

    const post = {
      id: createId("p"),
      userId: user.id,
      body: text,
      createdAt: new Date().toISOString(),
      likes: []
    };

    db.posts.push(post);
    writeDb(db);
    sendJson(res, 201, { post: decoratePost(post, db, currentUserId) });
    return;
  }

  const likeMatch = pathname.match(/^\/api\/posts\/([^/]+)\/like$/);
  if (req.method === "POST" && likeMatch) {
    const user = requireUser(req, res, reqUrl, db);
    if (!user) return;

    const post = db.posts.find(candidate => candidate.id === likeMatch[1]);
    if (!post) {
      sendError(res, 404, "Post not found");
      return;
    }

    const index = post.likes.indexOf(user.id);
    if (index >= 0) {
      post.likes.splice(index, 1);
    } else {
      post.likes.push(user.id);
    }

    writeDb(db);
    sendJson(res, 200, { post: decoratePost(post, db, currentUserId) });
    return;
  }

  const commentMatch = pathname.match(/^\/api\/posts\/([^/]+)\/comments$/);
  if (req.method === "POST" && commentMatch) {
    const user = requireUser(req, res, reqUrl, db);
    if (!user) return;

    const post = db.posts.find(candidate => candidate.id === commentMatch[1]);
    if (!post) {
      sendError(res, 404, "Post not found");
      return;
    }

    const body = await parseBody(req);
    const text = String(body.body || "").trim();
    if (text.length < 1 || text.length > 180) {
      sendError(res, 422, "Comment must be between 1 and 180 characters");
      return;
    }

    const comment = {
      id: createId("c"),
      postId: post.id,
      userId: user.id,
      body: text,
      createdAt: new Date().toISOString()
    };

    db.comments.push(comment);
    writeDb(db);
    sendJson(res, 201, { post: decoratePost(post, db, currentUserId) });
    return;
  }

  const profileMatch = pathname.match(/^\/api\/users\/([^/]+)$/);
  if (req.method === "GET" && profileMatch) {
    const profile = getProfile(profileMatch[1], db, currentUserId);
    if (!profile) {
      sendError(res, 404, "User not found");
      return;
    }
    sendJson(res, 200, { profile });
    return;
  }

  const followMatch = pathname.match(/^\/api\/users\/([^/]+)\/follow$/);
  if (req.method === "POST" && followMatch) {
    const user = requireUser(req, res, reqUrl, db);
    if (!user) return;

    const followingId = followMatch[1];
    if (followingId === user.id) {
      sendError(res, 422, "You cannot follow yourself");
      return;
    }

    const target = db.users.find(user => user.id === followingId);
    if (!target) {
      sendError(res, 404, "User not found");
      return;
    }

    const index = db.followers.findIndex(row => row.followerId === user.id && row.followingId === followingId);
    if (index >= 0) {
      db.followers.splice(index, 1);
    } else {
      db.followers.push({ followerId: user.id, followingId });
    }

    writeDb(db);
    sendJson(res, 200, {
      currentUser: getProfile(user.id, db, user.id),
      targetUser: getProfile(followingId, db, user.id),
      users: db.users.map(candidate => getProfile(candidate.id, db, user.id))
    });
    return;
  }

  sendError(res, 404, "API route not found");
}

const server = http.createServer(async (req, res) => {
  const reqUrl = new URL(req.url, `http://${req.headers.host}`);

  try {
    if (reqUrl.pathname.startsWith("/api/")) {
      await handleApi(req, res, reqUrl);
      return;
    }

    serveStatic(req, res, reqUrl.pathname);
  } catch (error) {
    sendError(res, 500, error.message || "Server error");
  }
});

ensureDb();
server.listen(PORT, () => {
  console.log(`Mini social media app running at http://localhost:${PORT}`);
});
