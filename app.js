const state = {
  token: localStorage.getItem("sessionToken") || "",
  currentUser: null,
  users: [],
  posts: [],
  authMode: "login"
};

const currentProfile = document.querySelector("#currentProfile");
const profileList = document.querySelector("#profileList");
const postsContainer = document.querySelector("#posts");
const postForm = document.querySelector("#postForm");
const postInput = document.querySelector("#postInput");
const postCount = document.querySelector("#postCount");
const refreshButton = document.querySelector("#refreshButton");
const profileTemplate = document.querySelector("#profileTemplate");
const postTemplate = document.querySelector("#postTemplate");
const authForm = document.querySelector("#authForm");
const authTitle = document.querySelector("#authTitle");
const authModeButton = document.querySelector("#authModeButton");
const authSubmit = document.querySelector("#authSubmit");
const authName = document.querySelector("#authName");
const authUsername = document.querySelector("#authUsername");
const authMessage = document.querySelector("#authMessage");

function api(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (state.token) {
    headers.Authorization = `Bearer ${state.token}`;
  }

  return fetch(path, { ...options, headers }).then(async response => {
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Request failed");
    }
    return data;
  });
}

function initialsAvatar(user) {
  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.textContent = user.avatar || user.name.slice(0, 2).toUpperCase();
  return avatar;
}

function profileSummary(user, includeBio = true) {
  const wrapper = document.createElement("div");
  wrapper.className = "profile-summary";
  wrapper.append(initialsAvatar(user));

  const text = document.createElement("div");
  text.className = "profile-text";
  text.innerHTML = `
    <strong>${escapeHtml(user.name)}</strong>
    <p>@${escapeHtml(user.username)}${includeBio ? ` - ${escapeHtml(user.bio)}` : ""}</p>
  `;
  wrapper.append(text);
  return wrapper;
}

function renderCurrentProfile() {
  currentProfile.replaceChildren();

  if (!state.currentUser) {
    const empty = document.createElement("div");
    empty.className = "signed-out";
    empty.innerHTML = `
      <strong>Not logged in</strong>
      <p>Log in or create an account to post, comment, like, and follow.</p>
    `;
    currentProfile.append(empty);
    postForm.classList.add("disabled");
    postInput.disabled = true;
    postInput.placeholder = "Log in to create a post";
    return;
  }

  postForm.classList.remove("disabled");
  postInput.disabled = false;
  postInput.placeholder = "Share a project update...";
  currentProfile.append(profileSummary(state.currentUser, false));

  const stats = document.createElement("div");
  stats.className = "stats";
  stats.innerHTML = `
    <div class="stat"><strong>${state.currentUser.stats.postCount}</strong><span>Posts</span></div>
    <div class="stat"><strong>${state.currentUser.stats.followerCount}</strong><span>Followers</span></div>
    <div class="stat"><strong>${state.currentUser.stats.followingCount}</strong><span>Following</span></div>
  `;
  currentProfile.append(stats);

  const logoutButton = document.createElement("button");
  logoutButton.className = "logout-button";
  logoutButton.type = "button";
  logoutButton.textContent = "Log out";
  logoutButton.addEventListener("click", logout);
  currentProfile.append(logoutButton);
}

function renderAuthForm() {
  const isRegister = state.authMode === "register";
  authTitle.textContent = isRegister ? "Create account" : "Log in";
  authModeButton.textContent = isRegister ? "Use login" : "Create account";
  authSubmit.textContent = isRegister ? "Create account" : "Log in";
  authName.hidden = !isRegister;
  authUsername.hidden = !isRegister;
  authName.required = isRegister;
  authUsername.required = isRegister;
}

function renderProfiles() {
  profileList.replaceChildren();

  state.users.forEach(user => {
    const node = profileTemplate.content.cloneNode(true);
    const card = node.querySelector(".profile-card");
    const summary = node.querySelector(".profile-switch");
    const followButton = node.querySelector(".follow-button");

    summary.append(profileSummary(user));

    if (!state.currentUser) {
      followButton.textContent = "Log in";
      followButton.disabled = true;
    } else if (user.id === state.currentUser.id) {
      card.classList.add("active");
      followButton.textContent = "You";
      followButton.disabled = true;
    } else {
      followButton.textContent = user.followedByCurrentUser ? "Following" : "Follow";
      followButton.classList.toggle("following", user.followedByCurrentUser);
      followButton.addEventListener("click", () => toggleFollow(user.id));
    }

    profileList.append(node);
  });
}

function renderPosts() {
  postsContainer.replaceChildren();

  if (!state.posts.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No posts yet. Start the feed with a project update.";
    postsContainer.append(empty);
    return;
  }

  state.posts.forEach(post => {
    const node = postTemplate.content.cloneNode(true);
    const card = node.querySelector(".post-card");
    const author = node.querySelector(".post-author");
    const body = node.querySelector(".post-body");
    const likeButton = node.querySelector(".like-button");
    const commentTotal = node.querySelector(".comment-total");
    const comments = node.querySelector(".comments");
    const commentForm = node.querySelector(".comment-form");
    const commentInput = commentForm.elements.body;

    author.append(profileSummary(post.author, false));
    author.querySelector(".profile-text p").textContent = `@${post.author.username} - ${formatDate(post.createdAt)}`;

    body.textContent = post.body;

    likeButton.textContent = `${post.likedByCurrentUser ? "Liked" : "Like"} - ${post.likeCount}`;
    likeButton.classList.toggle("liked", post.likedByCurrentUser);
    likeButton.disabled = !state.currentUser;
    likeButton.title = state.currentUser ? "" : "Log in to like posts";
    likeButton.addEventListener("click", () => toggleLike(post.id));

    commentTotal.textContent = `${post.comments.length} ${post.comments.length === 1 ? "comment" : "comments"}`;

    post.comments.forEach(comment => {
      comments.append(renderComment(comment));
    });

    commentInput.disabled = !state.currentUser;
    commentInput.placeholder = state.currentUser ? "Write a comment..." : "Log in to comment";
    commentForm.querySelector("button").disabled = !state.currentUser;
    commentForm.addEventListener("submit", event => submitComment(event, post.id));
    postsContainer.append(card);
  });
}

function renderComment(comment) {
  const wrapper = document.createElement("div");
  wrapper.className = "comment";
  wrapper.append(initialsAvatar(comment.author));

  const content = document.createElement("div");
  content.innerHTML = `
    <strong>${escapeHtml(comment.author.name)} <span class="meta">@${escapeHtml(comment.author.username)} - ${formatDate(comment.createdAt)}</span></strong>
    <p>${escapeHtml(comment.body)}</p>
  `;
  wrapper.append(content);
  return wrapper;
}

function renderAll() {
  renderCurrentProfile();
  renderAuthForm();
  renderProfiles();
  renderPosts();
}

async function loadApp() {
  const [sessionData, postData] = await Promise.all([
    api("/api/session"),
    api("/api/posts")
  ]);

  state.currentUser = sessionData.currentUser;
  state.users = sessionData.users;
  state.posts = postData.posts;
  renderAll();
}

async function submitAuth(event) {
  event.preventDefault();
  authMessage.textContent = "";

  const formData = new FormData(authForm);
  const payload = Object.fromEntries(formData.entries());
  const endpoint = state.authMode === "register" ? "/api/auth/register" : "/api/auth/login";

  try {
    const data = await api(endpoint, {
      method: "POST",
      body: JSON.stringify(payload)
    });
    state.token = data.token;
    localStorage.setItem("sessionToken", data.token);
    authForm.reset();
    authMessage.textContent = state.authMode === "register" ? "Account created." : "Logged in.";
    state.authMode = "login";
    await loadApp();
  } catch (error) {
    authMessage.textContent = error.message;
  }
}

async function logout() {
  try {
    await api("/api/auth/logout", { method: "POST" });
  } finally {
    state.token = "";
    state.currentUser = null;
    localStorage.removeItem("sessionToken");
    await loadApp();
  }
}

async function submitPost(event) {
  event.preventDefault();
  const body = postInput.value.trim();
  if (!body || !state.currentUser) return;

  await api("/api/posts", {
    method: "POST",
    body: JSON.stringify({ body })
  });
  postInput.value = "";
  updatePostCount();
  await loadApp();
}

async function submitComment(event, postId) {
  event.preventDefault();
  const input = event.currentTarget.elements.body;
  const body = input.value.trim();
  if (!body || !state.currentUser) return;

  await api(`/api/posts/${postId}/comments`, {
    method: "POST",
    body: JSON.stringify({ body })
  });
  input.value = "";
  await loadApp();
}

async function toggleLike(postId) {
  if (!state.currentUser) return;
  await api(`/api/posts/${postId}/like`, { method: "POST" });
  await loadApp();
}

async function toggleFollow(userId) {
  if (!state.currentUser) return;
  await api(`/api/users/${userId}/follow`, { method: "POST" });
  await loadApp();
}

function updatePostCount() {
  postCount.textContent = `${postInput.value.length}/280`;
}

function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

postForm.addEventListener("submit", submitPost);
postInput.addEventListener("input", updatePostCount);
refreshButton.addEventListener("click", loadApp);
authForm.addEventListener("submit", submitAuth);
authModeButton.addEventListener("click", () => {
  state.authMode = state.authMode === "login" ? "register" : "login";
  authMessage.textContent = "";
  renderAuthForm();
});

updatePostCount();
loadApp().catch(error => {
  postsContainer.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
});
