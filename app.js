import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  addDoc,
  deleteDoc,
  collection,
  query,
  where,
  getDocs,
  orderBy,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js";

import { getAnalytics } from "firebase/analytics";

const firebaseConfig = {
  apiKey: "AIzaSyDHJiBGfofCzK9ZBKdyxxGRInIBgmFOUWI",
  authDomain: "net-dpp-site.firebaseapp.com",
  projectId: "net-dpp-site",
  storageBucket: "net-dpp-site.firebasestorage.app",
  messagingSenderId: "958182963912",
  appId: "1:958182963912:web:a8a1ac453a9b6cfa8c83fd",
  measurementId: "G-PMXLN80BFE"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

const state = {
  me: null,
  meDoc: null,
  activeQuiz: null,
  answers: [],
  timerId: null,
  startedAt: 0,
  remainingSec: 0,
};

const els = {
  authSection: byId("authSection"),
  studentSection: byId("studentSection"),
  adminSection: byId("adminSection"),
  quizSection: byId("quizSection"),
  sessionBadge: byId("sessionBadge"),
  logoutBtn: byId("logoutBtn"),

  loginForm: byId("loginForm"),
  registerForm: byId("registerForm"),

  studentProfile: byId("studentProfile"),
  quizList: byId("quizList"),
  attemptList: byId("attemptList"),

  createQuizForm: byId("createQuizForm"),
  uploadFileForm: byId("uploadFileForm"),
  studentManageList: byId("studentManageList"),
  adminManageList: byId("adminManageList"),
  quizManageList: byId("quizManageList"),
  attemptReviewList: byId("attemptReviewList"),

  quizTitle: byId("quizTitle"),
  timer: byId("timer"),
  quizBody: byId("quizBody"),

  toast: byId("toast"),
};

boot();

function boot() {
  bindAuthForms();
  bindAdminForms();

  els.logoutBtn.addEventListener("click", async () => {
    await signOut(auth);
    toast("Logged out");
  });

  onAuthStateChanged(auth, async (user) => {
    clearQuizTimer();
    state.activeQuiz = null;
    state.answers = [];
    state.me = user;

    if (!user) {
      setLoggedOutUi();
      return;
    }

    const meRef = doc(db, "users", user.uid);
    const snap = await getDoc(meRef);

    if (!snap.exists()) {
      await setDoc(meRef, {
        email: user.email,
        displayName: user.email?.split("@")[0] ?? "Student",
        role: "student",
        blocked: false,
        createdAt: serverTimestamp(),
        createdBy: "self",
      });
    }

    const meSnap = await getDoc(meRef);
    state.meDoc = meSnap.data();

    if (state.meDoc.blocked) {
      toast("Your account is blocked by admin");
      await signOut(auth);
      return;
    }

    await renderRoleDashboard();
  });
}

function bindAuthForms() {
  els.loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = byId("loginEmail").value.trim();
    const password = byId("loginPassword").value;

    try {
      await signInWithEmailAndPassword(auth, email, password);
      toast("Login successful");
    } catch (err) {
      toast(`Login failed: ${err.message}`);
    }
  });

  els.registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = byId("registerName").value.trim();
    const email = byId("registerEmail").value.trim();
    const password = byId("registerPassword").value;

    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await setDoc(doc(db, "users", cred.user.uid), {
        email,
        displayName: name,
        role: "student",
        blocked: false,
        createdAt: serverTimestamp(),
        createdBy: "self",
      });
      toast("Registration successful");
    } catch (err) {
      toast(`Register failed: ${err.message}`);
    }
  });
}

function bindAdminForms() {
  els.createQuizForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!isAdmin()) return;

    try {
      const title = byId("quizTitleInput").value.trim();
      const description = byId("quizDescInput").value.trim();
      const durationSec = Number(byId("quizDurationInput").value);
      const jsonText = byId("quizJsonInput").value.trim();
      const payload = JSON.parse(jsonText);
      const questions = Array.isArray(payload.questions) ? payload.questions : [];

      if (!questions.length) {
        toast("Quiz must contain at least one question");
        return;
      }

      await addDoc(collection(db, "quizzes"), {
        title,
        description,
        durationSec,
        status: "active",
        sourceType: "json",
        sourceUrl: null,
        createdBy: state.me.uid,
        createdAt: serverTimestamp(),
        questions,
      });

      els.createQuizForm.reset();
      byId("quizDurationInput").value = "1800";
      toast("Quiz created");
      await renderAdminDashboard();
    } catch (err) {
      toast(`Create quiz failed: ${err.message}`);
    }
  });

  els.uploadFileForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!isAdmin()) return;

    const file = byId("quizFileInput").files?.[0];
    if (!file) return;

    try {
      const path = `quiz_sources/${Date.now()}_${file.name}`;
      const fileRef = ref(storage, path);
      await uploadBytes(fileRef, file);
      const sourceUrl = await getDownloadURL(fileRef);

      if (file.name.toLowerCase().endsWith(".json")) {
        const text = await file.text();
        const payload = JSON.parse(text);
        const questions = Array.isArray(payload.questions) ? payload.questions : [];
        if (!questions.length) {
          toast("JSON uploaded but no questions found");
          return;
        }

        await addDoc(collection(db, "quizzes"), {
          title: payload.title || file.name,
          description: payload.description || "Imported from JSON file",
          durationSec: Number(payload.durationSec) || 1800,
          status: "active",
          sourceType: "json",
          sourceUrl,
          createdBy: state.me.uid,
          createdAt: serverTimestamp(),
          questions,
        });
        toast("JSON uploaded and quiz created");
      } else {
        await addDoc(collection(db, "quizzes"), {
          title: file.name,
          description: "PDF source uploaded; add parsed questions later",
          durationSec: 1800,
          status: "archived",
          sourceType: "pdf",
          sourceUrl,
          createdBy: state.me.uid,
          createdAt: serverTimestamp(),
          questions: [],
        });
        toast("PDF archived to Storage and quiz draft created");
      }

      els.uploadFileForm.reset();
      await renderAdminDashboard();
    } catch (err) {
      toast(`Upload failed: ${err.message}`);
    }
  });

  byId("createAdminForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!isSuperAdmin()) return;

    const email = byId("newAdminEmail").value.trim().toLowerCase();
    if (!email) return;

    const q = query(collection(db, "users"), where("email", "==", email));
    const snaps = await getDocs(q);
    if (snaps.empty) {
      toast("No user found with that email. Ask them to register first.");
      return;
    }

    const target = snaps.docs[0];
    await updateDoc(doc(db, "users", target.id), { role: "admin" });
    byId("createAdminForm").reset();
    toast("Admin role granted");
    await renderAdminDashboard();
  });
}

async function renderRoleDashboard() {
  const role = state.meDoc.role;
  els.sessionBadge.textContent = `${role}: ${state.me.email}`;
  els.logoutBtn.classList.remove("hidden");
  els.authSection.classList.add("hidden");

  if (isAdmin()) {
    await renderAdminDashboard();
  } else {
    await renderStudentDashboard();
  }
}

function setLoggedOutUi() {
  els.sessionBadge.textContent = "Logged out";
  els.logoutBtn.classList.add("hidden");

  els.authSection.classList.remove("hidden");
  els.studentSection.classList.add("hidden");
  els.adminSection.classList.add("hidden");
  els.quizSection.classList.add("hidden");
}

async function renderStudentDashboard() {
  els.studentSection.classList.remove("hidden");
  els.adminSection.classList.add("hidden");
  els.quizSection.classList.add("hidden");

  els.studentProfile.innerHTML = `
    <strong>${state.meDoc.displayName}</strong><br/>
    ${state.meDoc.email}<br/>
    Role: ${state.meDoc.role}
  `;

  const quizQ = query(collection(db, "quizzes"), where("status", "==", "active"));
  const quizSnap = await getDocs(quizQ);
  const quizzes = quizSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  els.quizList.innerHTML = quizzes.length
    ? ""
    : `<div class="item">No active quizzes yet.</div>`;

  quizzes.forEach((quiz) => {
    const item = document.createElement("div");
    item.className = "item";
    item.innerHTML = `
      <div class="title">${escapeHtml(quiz.title)}</div>
      <div class="meta">${escapeHtml(quiz.description || "No description")}</div>
      <div class="meta">Duration: ${quiz.durationSec || 1800} sec | Questions: ${(quiz.questions || []).length}</div>
      <div class="actions"><button class="btn primary">Start Quiz</button></div>
    `;

    item.querySelector("button").addEventListener("click", () => startQuiz(quiz));
    els.quizList.appendChild(item);
  });

  const attemptsQ = query(
    collection(db, "attempts"),
    where("studentUid", "==", state.me.uid),
    orderBy("submittedAt", "desc")
  );
  const attemptsSnap = await getDocs(attemptsQ);

  const attempts = attemptsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  els.attemptList.innerHTML = attempts.length
    ? ""
    : `<div class="item">No attempts yet.</div>`;

  attempts.forEach((att) => {
    const item = document.createElement("div");
    item.className = "item";
    item.innerHTML = `
      <div class="title">${escapeHtml(att.quizTitle)}</div>
      <div class="meta">Score: ${att.score}/${att.total} | Time: ${att.timeTakenSec}s</div>
      <div class="actions"><button class="btn">View Answers</button></div>
    `;

    item.querySelector("button").addEventListener("click", async () => {
      const quizSnap = await getDoc(doc(db, "quizzes", att.quizId));
      if (!quizSnap.exists()) return toast("Quiz not found");
      reviewAttempt(quizSnap.data(), att.answers, false);
    });

    els.attemptList.appendChild(item);
  });
}

async function renderAdminDashboard() {
  els.studentSection.classList.add("hidden");
  els.adminSection.classList.remove("hidden");
  els.quizSection.classList.add("hidden");

  await Promise.all([
    renderManageUsers(),
    renderManageAdmins(),
    renderManageQuizzes(),
    renderReviewAttempts(),
  ]);
}

async function renderManageUsers() {
  const qStudents = query(collection(db, "users"), where("role", "==", "student"));
  const snap = await getDocs(qStudents);

  const users = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  els.studentManageList.innerHTML = users.length
    ? ""
    : `<div class="item">No students found.</div>`;

  users.forEach((u) => {
    const item = document.createElement("div");
    item.className = "item";
    item.innerHTML = `
      <div class="title">${escapeHtml(u.displayName || "Student")}</div>
      <div class="meta">${escapeHtml(u.email)} | ${u.blocked ? "Blocked" : "Active"}</div>
      <div class="actions">
        <button class="btn ${u.blocked ? "success" : "danger"}">${u.blocked ? "Unblock" : "Block"}</button>
        <button class="btn danger">Delete</button>
      </div>
    `;

    const [blockBtn, deleteBtn] = item.querySelectorAll("button");
    blockBtn.addEventListener("click", async () => {
      await updateDoc(doc(db, "users", u.id), { blocked: !u.blocked });
      toast(u.blocked ? "Student unblocked" : "Student blocked");
      await renderManageUsers();
    });

    deleteBtn.addEventListener("click", async () => {
      await deleteDoc(doc(db, "users", u.id));
      toast("Student profile deleted from Firestore");
      await renderManageUsers();
    });

    els.studentManageList.appendChild(item);
  });
}

async function renderManageAdmins() {
  const qAdmins = query(collection(db, "users"), where("role", "in", ["admin", "super_admin"]));
  const snap = await getDocs(qAdmins);

  const admins = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  els.adminManageList.innerHTML = admins.length
    ? ""
    : `<div class="item">No admins found.</div>`;

  admins.forEach((a) => {
    const canDemote = isSuperAdmin() && a.role !== "super_admin";
    const item = document.createElement("div");
    item.className = "item";
    item.innerHTML = `
      <div class="title">${escapeHtml(a.displayName || "Admin")}</div>
      <div class="meta">${escapeHtml(a.email)} | ${a.role} | ${a.blocked ? "Blocked" : "Active"}</div>
      <div class="actions">
        <button class="btn ${a.blocked ? "success" : "danger"}">${a.blocked ? "Unblock" : "Block"}</button>
        ${canDemote ? '<button class="btn">Remove Admin Role</button>' : ""}
      </div>
    `;

    const buttons = item.querySelectorAll("button");
    buttons[0].addEventListener("click", async () => {
      if (!isSuperAdmin()) return toast("Only super admin can block/unblock admins");
      await updateDoc(doc(db, "users", a.id), { blocked: !a.blocked });
      toast(a.blocked ? "Admin unblocked" : "Admin blocked");
      await renderManageAdmins();
    });

    if (canDemote && buttons[1]) {
      buttons[1].addEventListener("click", async () => {
        await updateDoc(doc(db, "users", a.id), { role: "student" });
        toast("Admin role removed");
        await renderManageAdmins();
      });
    }

    els.adminManageList.appendChild(item);
  });
}

async function renderManageQuizzes() {
  const snap = await getDocs(query(collection(db, "quizzes"), orderBy("createdAt", "desc")));
  const quizzes = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  els.quizManageList.innerHTML = quizzes.length
    ? ""
    : `<div class="item">No quizzes created.</div>`;

  quizzes.forEach((quiz) => {
    const item = document.createElement("div");
    item.className = "item";
    item.innerHTML = `
      <div class="title">${escapeHtml(quiz.title)}</div>
      <div class="meta">${escapeHtml(quiz.description || "No description")}</div>
      <div class="meta">Status: ${quiz.status} | Type: ${quiz.sourceType} | Questions: ${(quiz.questions || []).length}</div>
      <div class="actions">
        <button class="btn">${quiz.status === "active" ? "Archive" : "Activate"}</button>
        <button class="btn danger">Delete</button>
      </div>
    `;

    const [statusBtn, deleteBtn] = item.querySelectorAll("button");
    statusBtn.addEventListener("click", async () => {
      const next = quiz.status === "active" ? "archived" : "active";
      await updateDoc(doc(db, "quizzes", quiz.id), { status: next });
      toast(`Quiz ${next}`);
      await renderManageQuizzes();
    });

    deleteBtn.addEventListener("click", async () => {
      await deleteDoc(doc(db, "quizzes", quiz.id));
      toast("Quiz deleted");
      await renderManageQuizzes();
    });

    els.quizManageList.appendChild(item);
  });
}

async function renderReviewAttempts() {
  const snap = await getDocs(query(collection(db, "attempts"), orderBy("submittedAt", "desc")));
  const attempts = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  els.attemptReviewList.innerHTML = attempts.length
    ? ""
    : `<div class="item">No attempts yet.</div>`;

  attempts.forEach((att) => {
    const item = document.createElement("div");
    item.className = "item";
    item.innerHTML = `
      <div class="title">${escapeHtml(att.quizTitle)}</div>
      <div class="meta">Student: ${escapeHtml(att.studentEmail)} | Score: ${att.score}/${att.total}</div>
      <div class="actions"><button class="btn">Review</button></div>
    `;

    item.querySelector("button").addEventListener("click", async () => {
      const quizSnap = await getDoc(doc(db, "quizzes", att.quizId));
      if (!quizSnap.exists()) return toast("Quiz not found");
      reviewAttempt(quizSnap.data(), att.answers, true, att.studentEmail);
    });

    els.attemptReviewList.appendChild(item);
  });
}

function startQuiz(quiz) {
  if (!Array.isArray(quiz.questions) || !quiz.questions.length) {
    toast("Quiz has no questions yet");
    return;
  }

  state.activeQuiz = quiz;
  state.answers = Array(quiz.questions.length).fill(null);
  state.startedAt = Date.now();
  state.remainingSec = Number(quiz.durationSec) || 1800;

  els.studentSection.classList.add("hidden");
  els.adminSection.classList.add("hidden");
  els.quizSection.classList.remove("hidden");
  els.quizTitle.textContent = quiz.title;

  renderQuizQuestions();
  renderTimer();
  clearQuizTimer();
  state.timerId = setInterval(() => {
    state.remainingSec -= 1;
    renderTimer();
    if (state.remainingSec <= 0) submitQuiz();
  }, 1000);
}

function renderQuizQuestions() {
  const quiz = state.activeQuiz;
  els.quizBody.innerHTML = "";

  quiz.questions.forEach((q, idx) => {
    const qWrap = document.createElement("div");
    qWrap.className = "question";

    const optionsHtml = (q.options || [])
      .map(
        (opt, optIdx) =>
          `<div class="option" data-q="${idx}" data-opt="${optIdx}">${String.fromCharCode(
            65 + optIdx
          )}. ${escapeHtml(opt)}</div>`
      )
      .join("");

    qWrap.innerHTML = `
      <div><strong>Q${idx + 1}.</strong> ${escapeHtml(q.question)}</div>
      <div class="options">${optionsHtml}</div>
    `;
    els.quizBody.appendChild(qWrap);
  });

  els.quizBody.querySelectorAll(".option").forEach((el) => {
    el.addEventListener("click", () => {
      const qIdx = Number(el.dataset.q);
      const optIdx = Number(el.dataset.opt);
      state.answers[qIdx] = optIdx;
      repaintSelections();
    });
  });

  const submitBtn = document.createElement("button");
  submitBtn.className = "btn primary";
  submitBtn.textContent = "Submit Quiz";
  submitBtn.addEventListener("click", submitQuiz);
  els.quizBody.appendChild(submitBtn);

  repaintSelections();
}

function repaintSelections() {
  els.quizBody.querySelectorAll(".option").forEach((el) => {
    const qIdx = Number(el.dataset.q);
    const optIdx = Number(el.dataset.opt);
    el.classList.toggle("active", state.answers[qIdx] === optIdx);
  });
}

async function submitQuiz() {
  if (!state.activeQuiz) return;

  clearQuizTimer();

  const quiz = state.activeQuiz;
  const total = quiz.questions.length;

  let score = 0;
  quiz.questions.forEach((q, idx) => {
    if (state.answers[idx] === q.correctIndex) score += 1;
  });

  const timeTakenSec = Math.max(0, Math.floor((Date.now() - state.startedAt) / 1000));

  try {
    await addDoc(collection(db, "attempts"), {
      quizId: quiz.id,
      quizTitle: quiz.title,
      studentUid: state.me.uid,
      studentEmail: state.me.email,
      answers: state.answers,
      score,
      total,
      submittedAt: serverTimestamp(),
      durationSec: quiz.durationSec || 1800,
      timeTakenSec,
    });

    toast(`Submitted. Score: ${score}/${total}`);
    reviewAttempt(quiz, state.answers, false);
  } catch (err) {
    toast(`Submit failed: ${err.message}`);
  }
}

function reviewAttempt(quiz, answers, isAdminView, studentEmail = "") {
  clearQuizTimer();
  els.quizSection.classList.remove("hidden");
  els.adminSection.classList.add("hidden");
  els.studentSection.classList.add("hidden");

  els.quizTitle.textContent = isAdminView
    ? `${quiz.title} - Review (${studentEmail})`
    : `${quiz.title} - Your Review`;
  els.timer.textContent = "Reviewed";

  els.quizBody.innerHTML = "";

  quiz.questions.forEach((q, idx) => {
    const wrap = document.createElement("div");
    wrap.className = "question";

    const optionsHtml = (q.options || [])
      .map((opt, optIdx) => {
        const cls = ["option"];
        if (optIdx === q.correctIndex) cls.push("correct");
        if (answers[idx] === optIdx && answers[idx] !== q.correctIndex) cls.push("wrong");
        return `<div class="${cls.join(" ")}">${String.fromCharCode(65 + optIdx)}. ${escapeHtml(opt)}</div>`;
      })
      .join("");

    const userAns = answers[idx] == null ? "Not answered" : String.fromCharCode(65 + answers[idx]);
    const rightAns = String.fromCharCode(65 + q.correctIndex);

    wrap.innerHTML = `
      <div><strong>Q${idx + 1}.</strong> ${escapeHtml(q.question)}</div>
      <div class="options">${optionsHtml}</div>
      <div class="meta">Your answer: ${userAns} | Right answer: ${rightAns}</div>
      ${q.explanation ? `<div class="meta">Explanation: ${escapeHtml(q.explanation)}</div>` : ""}
    `;
    els.quizBody.appendChild(wrap);
  });

  const backBtn = document.createElement("button");
  backBtn.className = "btn";
  backBtn.textContent = "Back to Dashboard";
  backBtn.addEventListener("click", async () => {
    if (isAdmin()) {
      await renderAdminDashboard();
    } else {
      await renderStudentDashboard();
    }
    els.quizSection.classList.add("hidden");
  });
  els.quizBody.appendChild(backBtn);
}

function renderTimer() {
  const s = Math.max(0, state.remainingSec);
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  els.timer.textContent = `${mm}:${ss}`;
}

function clearQuizTimer() {
  if (state.timerId) {
    clearInterval(state.timerId);
    state.timerId = null;
  }
}

function isAdmin() {
  return ["admin", "super_admin"].includes(state.meDoc?.role);
}

function isSuperAdmin() {
  return state.meDoc?.role === "super_admin";
}

function byId(id) {
  return document.getElementById(id);
}

function toast(msg) {
  els.toast.textContent = msg;
  els.toast.classList.remove("hidden");
  setTimeout(() => els.toast.classList.add("hidden"), 2600);
}

function escapeHtml(str = "") {
  return str
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
