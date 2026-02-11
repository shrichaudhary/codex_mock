# CSIR NET Mock Test Platform (Firebase)

This repository contains a Firebase-first web app scaffold for a **Testbook-style mock test portal** with:

- Admin login + student login/signup
- Role-based dashboards
- User management (add/list/block/unblock/delete)
- Admin management (add/list/block/delete)
- Quiz management (create from JSON, archive/unarchive, delete, review attempts)
- Student profile + attempted quiz history
- Timed quiz attempt flow with answer review (student answer vs right answer)

> ⚠️ Firebase Authentication does **not** allow admins to read plain-text user passwords. This is by design and is more secure. Admins can still block users, delete users (from app database), reset passwords through Firebase Auth flows, and manage all quiz content.

## Tech Stack

- Static frontend: HTML/CSS/Vanilla JS
- Firebase:
  - Authentication (email/password)
  - Firestore
  - Storage (for raw PDF upload archive)

## Project Structure

- `index.html` – app shell and UI layout
- `styles.css` – Testbook-inspired styling
- `app.js` – app logic (auth, dashboard, quiz engine, admin tools)

## Firebase Setup

1. Create a Firebase project.
2. Enable **Authentication > Email/Password**.
3. Enable **Firestore Database**.
4. Enable **Storage** (for PDF archive upload).
5. Replace the `firebaseConfig` object in `app.js` with your project config.
6. Create an initial super-admin user:
   - Register normally from the UI.
   - In Firestore, set `users/{uid}.role = "super_admin"`.

## Firestore Data Model

### `users/{uid}`

```json
{
  "email": "student@example.com",
  "displayName": "Student Name",
  "role": "student",
  "blocked": false,
  "createdAt": "timestamp",
  "createdBy": "uid-or-self"
}
```

### `quizzes/{quizId}`

```json
{
  "title": "DPP - Kinetic Theory",
  "description": "Chapter-wise practice set",
  "durationSec": 1800,
  "status": "active",
  "sourceType": "json|pdf",
  "sourceUrl": "optional storage file URL",
  "createdBy": "adminUid",
  "createdAt": "timestamp",
  "questions": [
    {
      "question": "...",
      "options": ["A", "B", "C", "D"],
      "correctIndex": 2,
      "explanation": "optional"
    }
  ]
}
```

### `attempts/{attemptId}`

```json
{
  "quizId": "...",
  "quizTitle": "...",
  "studentUid": "...",
  "studentEmail": "...",
  "answers": [1, 0, null, 3],
  "score": 17,
  "total": 25,
  "submittedAt": "timestamp",
  "durationSec": 1800,
  "timeTakenSec": 1542
}
```

## JSON Quiz Upload Format

```json
{
  "title": "DPP - Electrodynamics 01",
  "description": "CSIR NET PYQ style",
  "durationSec": 2400,
  "questions": [
    {
      "question": "The divergence of curl of any vector field is:",
      "options": ["0", "1", "Depends on field", "Infinity"],
      "correctIndex": 0,
      "explanation": "Vector identity: ∇·(∇×A)=0"
    }
  ]
}
```

## Notes on PDF Upload

- You can upload a PDF to Storage and save quiz metadata in Firestore.
- Automatic conversion of arbitrary PDF to clean MCQ JSON is domain-specific and usually needs:
  - structured parsing rules,
  - manual review UI,
  - or OCR/LLM pipeline.
- This scaffold includes a **PDF archive upload path** and a **JSON-based reliable quiz ingestion flow**.

## Run

Since this is a static app, you can serve it with any static server:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## Production hardening checklist

- Add Firestore security rules matching role checks.
- Add Cloud Functions for privileged admin operations (delete auth users, custom claims).
- Add pagination for large user/attempt lists.
- Add audit logs for every admin action.
- Add anti-cheat controls (fullscreen monitor, tab switch counters, randomization).
- Add separate question bank and test generator.
